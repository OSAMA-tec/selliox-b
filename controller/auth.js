import path from "path";

import User from "../models/user.js";
import Referral from "../models/referral.js";
import ReferralCode from "../models/referralCode.js";
import DrawEntry from "../models/drawEntry.js";
import ErrorHandler from "../utils/ErrorHandler.js";
import catchAsyncErrors from "../middleware/catchAsyncErrors.js";
import sendToken from "../utils/jwtToken.js";
// test
const register = catchAsyncErrors(async (req, res, next) => {
  try {
    const { fullName, email, password, referralCode } = req.body;
    if (!fullName || !email || !password) {
      return next(new ErrorHandler("Please provide the all fields", 400));
    }
    const userEmail = await User.findOne({ email });
    if (userEmail) {
      return next(new ErrorHandler("User already exists", 422));
    }

    // Generate username from email
    // Extract part before @ and remove special characters
    let baseUsername = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
    
    // Add random digits for uniqueness (4 digits should be sufficient for most cases)
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    let username = `${baseUsername}${randomSuffix}`;
    
    // Check if username already exists and regenerate if needed
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      // Try a different random suffix if first attempt collides
      const newRandomSuffix = Math.floor(1000 + Math.random() * 9000);
      username = `${baseUsername}${newRandomSuffix}`;
    }
    
    // Create the user
    const user = await User.create({
      fullName: fullName,
      email: email,
      password: password,
      username: username
    }).catch((e) => {
      return next(new ErrorHandler(e.message, 400));
    });

    // ============
    // Create draw entry for new sign up (1 ticket)
    // ============
    try {
      // Create a draw entry for the new user
      const drawEntry = await DrawEntry.create({
        userId: user._id,
        tickets: 1,
        source: "signup",
      });
      
      // Update user's active tickets count
      await User.findByIdAndUpdate(user._id, {
        $inc: { "referralStats.activeDrawTickets": 1 }
      });
    } catch (drawEntryError) {
      console.error("Error creating signup draw entry:", drawEntryError);
      // We'll continue with registration even if creating the draw entry fails
    }

    // ============
    // Handle referral code if provided
    // ============
    if (referralCode) {
      try {
        // Find the referral code and check if it's active
        const referralCodeDoc = await ReferralCode.findOne({ 
          code: referralCode.toUpperCase(),
          isActive: true
        });

        if (!referralCodeDoc) {
          // We'll still register the user but inform them about the invalid code
          sendToken(user, 200, res, {
            referralStatus: "invalid",
            message: "User registered successfully, but the referral code is invalid or expired."
          });
          return;
        }

        // Make sure referrer is not the same as the new user
        if (referralCodeDoc.userId.toString() === user._id.toString()) {
          sendToken(user, 200, res, {
            referralStatus: "self_referral",
            message: "User registered successfully, but you cannot refer yourself."
          });
          return;
        }

        // Create a new referral record
        const referral = await Referral.create({
          referrerUserId: referralCodeDoc.userId,
          referredUserId: user._id,
          referralCode: referralCode.toUpperCase(),
          status: "pending" // Initial status
        });

        // Increment usage count for the referral code
        referralCodeDoc.usageCount += 1;
        await referralCodeDoc.save();

        // Send token with referral info
        sendToken(user, 200, res, {
          referralStatus: "success",
          message: "User registered successfully with valid referral code."
        });
        return;
      } catch (referralError) {
        console.error("Error processing referral:", referralError);
        // If there's an error with the referral processing, we'll still continue 
        // with user registration but inform about the referral issue
        sendToken(user, 200, res, {
          referralStatus: "error",
          message: "User registered successfully, but there was an error processing the referral code."
        });
        return;
      }
    }

    // No referral code provided, send regular token
    sendToken(user, 200, res);
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

const login = catchAsyncErrors(async (req, res, next) => {
  try {
    const { email, password } = req.body;
    console.log(await User.findOne({email}))
    if (!email || !password) {
      return next(new ErrorHandler("Please provide the all fields", 400));
    }
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return next(new ErrorHandler("User doesn't exist", 422));
    }
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return next(new ErrorHandler("Please provide correct password", 422));
    }
    sendToken(user, 200, res);
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});


const update = async(req,res)=>{
  const userId = req.user._id;
  const updatedData = req.body;
  try{
    // Check if password is included in the update data
    if(updatedData.password) {
      // Use findById and save to ensure password hashing middleware runs
      const user = await User.findById(userId);
      if(!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      // Update user fields
      Object.keys(updatedData).forEach(key => {
        user[key] = updatedData[key];
      });
      
      // Save user to trigger the password hashing middleware
      const updatedUser = await user.save();
      return res.status(200).json(updatedUser);
    } else {
      // For non-password updates, we can use findByIdAndUpdate
      const user = await User.findByIdAndUpdate(userId, updatedData, {new:true, runValidators:true});
      return res.status(200).json(user);
    }
  }catch(e){
    res.status(500).json({ message: 'Failed to update user', e });
  }
}

// Check if current password is valid
const checkCurrentPassword = catchAsyncErrors(async (req, res, next) => {
  try {
    const { currentPassword } = req.body;
    if (!currentPassword) {
      return next(new ErrorHandler("Please provide current password", 400));
    }

    // Get user with password field (which is normally not selected)
    const user = await User.findById(req.user._id).select("+password");
    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    // Check if provided password matches stored password
    const isPasswordValid = await user.comparePassword(currentPassword);
    
    res.status(200).json({
      success: true,
      isValid: isPasswordValid
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Update user password
const updatePassword = catchAsyncErrors(async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Validate inputs
    if (!currentPassword || !newPassword) {
      return next(new ErrorHandler("Please provide both current and new password", 400));
    }

    // Get user with password field
    const user = await User.findById(req.user._id).select("+password");
    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    // Verify current password
    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      return next(new ErrorHandler("Current password is incorrect", 400));
    }

    // Update password
    user.password = newPassword;
    await user.save();

    // Return new token with updated user data
    sendToken(user, 200, res);
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

export default {
  register,
  login,
  update,
  checkCurrentPassword,
  updatePassword
};

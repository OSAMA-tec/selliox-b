import path from "path";

import User from "../models/user.js";
import ErrorHandler from "../utils/ErrorHandler.js";
import catchAsyncErrors from "../middleware/catchAsyncErrors.js";
import sendToken from "../utils/jwtToken.js";
// test
const register = catchAsyncErrors(async (req, res, next) => {
  try {
    const { fullName, email, password   } = req.body;
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
    
    const user = await User.create({
      fullName: fullName,
      email: email,
      password: password,
      username: username
    }).catch((e) => {
      return next(new ErrorHandler(e.message, 400));
    });
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
    const user = await User.findByIdAndUpdate(userId,updatedData,{new:true,runValidators:true});
    res.status(200).json(user);
  }catch(e){
    res.status(500).json({ message: 'Failed to update user', e });
  }
}
export default {
  register,
  login,
  update
};

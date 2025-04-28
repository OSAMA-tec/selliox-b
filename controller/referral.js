import User from "../models/user.js";
import Referral from "../models/referral.js";
import ReferralCode from "../models/referralCode.js";
import DrawEntry from "../models/drawEntry.js";
import Draw from "../models/draw.js";
import PaymentDetail from "../models/paymentDetail.js";
import Notification from "../models/notification.js";
import ErrorHandler from "../utils/ErrorHandler.js";
import catchAsyncErrors from "../middleware/catchAsyncErrors.js";

// Generate a referral code for a user
export const generateReferralCode = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user._id;
  
  // Check if user already has a code
  let existingCode = await ReferralCode.findOne({ userId, isActive: true });
  if (existingCode) {
    // Update user's referral code field if needed
    if (!req.user.referralCode || req.user.referralCodeStatus !== "active") {
      await User.findByIdAndUpdate(userId, {
        referralCode: existingCode.code,
        referralCodeStatus: "active"
      });
    }
    
    return res.status(200).json({
      success: true,
      code: existingCode.code,
      message: "Existing referral code retrieved"
    });
  }
  
  // Generate a new code
  const code = await ReferralCode.generateUniqueCode();
  
  // Create the referral code
  const referralCode = await ReferralCode.create({
    code,
    userId
  });
  
  // Update user model with the code
  await User.findByIdAndUpdate(userId, {
    referralCode: code,
    referralCodeStatus: "active"
  });
  
  res.status(201).json({
    success: true,
    code,
    message: "Referral code generated successfully"
  });
});

// Validate a referral code
export const validateReferralCode = catchAsyncErrors(async (req, res, next) => {
  const { code } = req.params;
  
  // Find the code
  const referralCode = await ReferralCode.findOne({ code, isActive: true });
  if (!referralCode) {
    return next(new ErrorHandler("Invalid or inactive referral code", 400));
  }
  
  // Get referrer user
  const referrer = await User.findById(referralCode.userId);
  if (!referrer) {
    return next(new ErrorHandler("Referrer user not found", 404));
  }
  
  // Don't allow self-referral
  if (req.user && referralCode.userId.toString() === req.user._id.toString()) {
    return next(new ErrorHandler("You cannot use your own referral code", 400));
  }
  
  res.status(200).json({
    success: true,
    referralCode,
    referrer: {
      id: referrer._id,
      name: referrer.fullName
    },
    message: "Valid referral code"
  });
});

// Apply a referral code during registration/listing creation
export const applyReferralCode = catchAsyncErrors(async (req, res, next) => {
  const { code, listingId, rewardType } = req.body;
  const userId = req.user._id;
  
  if (!code) {
    return next(new ErrorHandler("Referral code is required", 400));
  }
  
  // Validate the code
  const referralCode = await ReferralCode.findOne({ code, isActive: true });
  if (!referralCode) {
    return next(new ErrorHandler("Invalid or inactive referral code", 400));
  }
  
  // Get referrer user
  const referrer = await User.findById(referralCode.userId);
  if (!referrer) {
    return next(new ErrorHandler("Referrer user not found", 404));
  }
  
  // Check for self-referral
  if (referralCode.userId.toString() === userId.toString()) {
    return next(new ErrorHandler("You cannot use your own referral code", 400));
  }
  
  // Check if already referred by this code
  const existingReferral = await Referral.findOne({
    referrerUserId: referralCode.userId,
    referredUserId: userId,
    referralCode: code
  });
  
  if (existingReferral) {
    // If already converted/rewarded, don't allow again
    if (existingReferral.status === "converted" || existingReferral.status === "rewarded") {
      return next(new ErrorHandler("This referral has already been processed", 400));
    }
    
    // Otherwise update the existing referral
    existingReferral.status = "converted";
    existingReferral.convertedAt = new Date();
    existingReferral.rewardType = rewardType || "draw_entries"; // Default to draw entries
    
    if (listingId) {
      existingReferral.listing = listingId;
    }
    
    await existingReferral.save();
    
    // Increment referrer stats
    await User.findByIdAndUpdate(referrer._id, {
      $inc: {
        "referralStats.successfulConversions": 1,
        "referralStats.totalRewards": 1
      }
    });
    
    // Increment referral code usage
    await ReferralCode.findByIdAndUpdate(referralCode._id, {
      $inc: { usageCount: 1 }
    });
    
    // Create draw entries or apply free month based on reward type
    if (rewardType === "free_month") {
      // Logic for free month (could update subscription in your payment system)
      await User.findByIdAndUpdate(referrer._id, {
        $inc: { "referralStats.freeMonthsUsed": 1 }
      });
      
      // Notification for referrer about free month
      await Notification.create({
        userId: referrer._id,
        type: "referral_used",
        message: "Someone used your referral code and you received a free month!",
        data: {
          referralId: existingReferral._id,
          rewardType: "free_month"
        }
      });
    } else {
      // Default to draw entries (5 tickets)
      const drawEntry = await DrawEntry.create({
        userId: referrer._id,
        tickets: 5,
        source: "referral",
        referralId: existingReferral._id
      });
      
      // Update user's active tickets count
      await User.findByIdAndUpdate(referrer._id, {
        $inc: { "referralStats.activeDrawTickets": 5 }
      });
      
      // Notification for referrer about draw entries
      await Notification.create({
        userId: referrer._id,
        type: "draw_entry",
        message: "Someone used your referral code and you received 5 draw entries!",
        data: {
          tickets: 5,
          drawEntryId: drawEntry._id
        }
      });
    }
    
    return res.status(200).json({
      success: true,
      referral: existingReferral,
      message: "Referral converted successfully"
    });
  }
  
  // Create a new referral record
  const referral = await Referral.create({
    referrerUserId: referralCode.userId,
    referredUserId: userId,
    referralCode: code,
    status: "converted",
    convertedAt: new Date(),
    rewardType: rewardType || "draw_entries",
    listing: listingId || null
  });
  
  // Update referrer stats
  await User.findByIdAndUpdate(referrer._id, {
    $inc: {
      "referralStats.referralsCount": 1,
      "referralStats.successfulConversions": 1,
      "referralStats.totalRewards": 1
    }
  });
  
  // Update referred user to record who referred them
  await User.findByIdAndUpdate(userId, {
    referredBy: referrer._id
  });
  
  // Increment referral code usage
  await ReferralCode.findByIdAndUpdate(referralCode._id, {
    $inc: { usageCount: 1 }
  });
  
  // Create draw entries or apply free month based on reward type
  if (rewardType === "free_month") {
    // Logic for free month
    await User.findByIdAndUpdate(referrer._id, {
      $inc: { "referralStats.freeMonthsUsed": 1 }
    });
    
    // Notification for referrer
    await Notification.create({
      userId: referrer._id,
      type: "referral_used",
      message: "Someone used your referral code and you received a free month!",
      data: {
        referralId: referral._id,
        rewardType: "free_month"
      }
    });
  } else {
    // Default to draw entries (5 tickets)
    const drawEntry = await DrawEntry.create({
      userId: referrer._id,
      tickets: 5,
      source: "referral",
      referralId: referral._id
    });
    
    // Update user's active tickets count
    await User.findByIdAndUpdate(referrer._id, {
      $inc: { "referralStats.activeDrawTickets": 5 }
    });
    
    // Notification for referrer
    await Notification.create({
      userId: referrer._id,
      type: "draw_entry",
      message: "Someone used your referral code and you received 5 draw entries!",
      data: {
        tickets: 5,
        drawEntryId: drawEntry._id
      }
    });
  }
  
  res.status(201).json({
    success: true,
    referral,
    message: "Referral created and processed successfully"
  });
});

// Choose reward type (free month or draw entries)
export const chooseReward = catchAsyncErrors(async (req, res, next) => {
  const { referralId, rewardType } = req.body;
  const userId = req.user._id;
  
  if (!referralId || !rewardType) {
    return next(new ErrorHandler("Referral ID and reward type are required", 400));
  }
  
  if (rewardType !== "free_month" && rewardType !== "draw_entries") {
    return next(new ErrorHandler("Invalid reward type", 400));
  }
  
  // Find the referral
  const referral = await Referral.findOne({
    _id: referralId,
    referrerUserId: userId,
    status: "converted",
    rewardStatus: { $ne: "processed" }
  });
  
  if (!referral) {
    return next(new ErrorHandler("Referral not found or already processed", 404));
  }
  
  // Update the referral with the chosen reward
  referral.rewardType = rewardType;
  referral.rewardStatus = "claimed";
  await referral.save();
  
  // Process the reward
  if (rewardType === "free_month") {
    // Logic for free month
    await User.findByIdAndUpdate(userId, {
      $inc: { "referralStats.freeMonthsUsed": 1 }
    });
    
    // You'd apply the free month in your payment system here
    
    // Notification for referrer
    await Notification.create({
      userId,
      type: "referral_used",
      message: "You've claimed a free month from your referral reward!",
      data: {
        referralId: referral._id,
        rewardType: "free_month"
      }
    });
  } else {
    // Create draw entries (5 tickets)
    const drawEntry = await DrawEntry.create({
      userId,
      tickets: 5,
      source: "referral",
      referralId: referral._id
    });
    
    // Update user's active tickets count
    await User.findByIdAndUpdate(userId, {
      $inc: { "referralStats.activeDrawTickets": 5 }
    });
    
    // Notification for referrer
    await Notification.create({
      userId,
      type: "draw_entry",
      message: "You've claimed 5 draw entries from your referral reward!",
      data: {
        tickets: 5,
        drawEntryId: drawEntry._id
      }
    });
  }
  
  // Mark referral as rewarded
  referral.rewardStatus = "processed";
  await referral.save();
  
  res.status(200).json({
    success: true,
    message: `Reward (${rewardType === "free_month" ? "Free Month" : "Draw Entries"}) processed successfully`
  });
});

// Get user's referral data
export const getUserReferralData = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user._id;
  
  // Get user with referral stats
  const user = await User.findById(userId);
  if (!user) {
    return next(new ErrorHandler("User not found", 404));
  }
  
  // Get user's referral code
  const referralCode = await ReferralCode.findOne({ userId, isActive: true });
  
  // Get user's successful referrals
  const referrals = await Referral.find({ 
    referrerUserId: userId,
    status: "converted" 
  }).sort({ convertedAt: -1 });
  
  // Get user's active draw entries
  const drawEntries = await DrawEntry.find({ 
    userId,
    status: "active" 
  }).sort({ createdAt: -1 });
  
  // Get total tickets
  const totalTickets = drawEntries.reduce((sum, entry) => sum + entry.tickets, 0);
  
  // Get current draw information
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();
  
  let currentDraw = await Draw.findOne({
    month: currentMonth,
    year: currentYear
  });
  
  if (!currentDraw) {
    // Create a new draw for the current month if it doesn't exist
    currentDraw = await Draw.create({
      month: currentMonth,
      year: currentYear,
      status: "pending"
    });
  }
  
  // Get countdown to end of month (draw date)
  const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
  const timeUntilDraw = lastDayOfMonth.getTime() - currentDate.getTime();
  
  // Format countdown
  const daysUntilDraw = Math.floor(timeUntilDraw / (1000 * 60 * 60 * 24));
  const hoursUntilDraw = Math.floor((timeUntilDraw % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  // Check if user is a winner of any draw
  const winningDraw = await Draw.findOne({
    "winner.userId": userId,
    status: "completed",
    paymentStatus: { $ne: "paid" }
  });
  
  res.status(200).json({
    success: true,
    referralCode: referralCode ? referralCode.code : null,
    referralStats: user.referralStats,
    referrals,
    drawEntries,
    totalTickets,
    currentDraw: {
      month: currentMonth,
      year: currentYear,
      status: currentDraw.status,
      daysUntilDraw,
      hoursUntilDraw,
      drawDate: lastDayOfMonth
    },
    isWinner: !!winningDraw,
    winningDraw
  });
});

// Submit payment details for winning
export const submitPaymentDetails = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user._id;
  const { bankName, accountHolder, accountNumber } = req.body;
  
  if (!bankName || !accountHolder || !accountNumber) {
    return next(new ErrorHandler("All payment details are required", 400));
  }
  
  // Check if user is a winner
  const winningDraw = await Draw.findOne({
    "winner.userId": userId,
    status: "completed",
    paymentStatus: "pending"
  });
  
  if (!winningDraw) {
    return next(new ErrorHandler("You are not eligible to submit payment details", 400));
  }
  
  // Create payment details
  const paymentDetails = await PaymentDetail.create({
    userId,
    drawId: winningDraw._id,
    bankName,
    accountHolder,
    accountNumber
  });
  
  // Update draw with payment details and status
  winningDraw.paymentDetails = paymentDetails._id;
  winningDraw.paymentStatus = "claimed";
  await winningDraw.save();
  
  // Notification for admin to process payment
  const adminUsers = await User.find({ role: "admin" });
  
  for (const admin of adminUsers) {
    await Notification.create({
      userId: admin._id,
      type: "payment_claimed",
      message: `A draw winner has submitted payment details for the ${winningDraw.month}/${winningDraw.year} draw`,
      data: {
        drawId: winningDraw._id,
        paymentDetailId: paymentDetails._id
      }
    });
  }
  
  res.status(201).json({
    success: true,
    message: "Payment details submitted successfully"
  });
});

// Check if user is a winner
export const checkWinnerStatus = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user._id;
  
  // Check if user is a winner of any draw
  const winningDraw = await Draw.findOne({
    "winner.userId": userId,
    status: "completed"
  });
  
  res.status(200).json({
    success: true,
    isWinner: !!winningDraw,
    draw: winningDraw
  });
});

// Get user's referral notifications
export const getReferralNotifications = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user._id;
  
  const notifications = await Notification.find({
    userId,
    read: false
  }).sort({ createdAt: -1 });
  
  res.status(200).json({
    success: true,
    notifications
  });
});

// Mark notification as read
export const markNotificationAsRead = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user._id;
  const { notificationId } = req.params;
  
  const notification = await Notification.findOne({
    _id: notificationId,
    userId
  });
  
  if (!notification) {
    return next(new ErrorHandler("Notification not found", 404));
  }
  
  notification.read = true;
  notification.readAt = new Date();
  await notification.save();
  
  res.status(200).json({
    success: true,
    message: "Notification marked as read"
  });
});

// Mark all notifications as read
export const markAllNotificationsAsRead = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user._id;
  
  await Notification.updateMany(
    { userId, read: false },
    { 
      $set: { 
        read: true,
        readAt: new Date()
      } 
    }
  );
  
  res.status(200).json({
    success: true,
    message: "All notifications marked as read"
  });
});

// Get detailed referral dashboard for the user
export const getReferralDashboard = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user._id;
  
  // ============
  // Fetch base user data and stats
  // ============
  const user = await User.findById(userId);
  if (!user) {
    return next(new ErrorHandler("User not found", 404));
  }
  
  // Get user's referral code
  const referralCode = await ReferralCode.findOne({ userId, isActive: true });
  
  // ============
  // Fetch all referrals with detailed information
  // ============
  // Get all referrals (both pending and converted)
  const allReferrals = await Referral.find({ 
    referrerUserId: userId
  }).sort({ createdAt: -1 });
  
  // Populate referred user details for each referral
  const populatedReferrals = await Referral.find({ 
    referrerUserId: userId 
  })
  .populate({
    path: 'referredUserId',
    select: 'fullName username email profileImage createdAt'
  })
  .populate({
    path: 'listing',
    select: 'title price status createdAt'
  })
  .sort({ createdAt: -1 });
  
  // ============
  // Prepare statistics and analytics
  // ============
  // Calculate conversion rate
  const conversionRate = allReferrals.length > 0 
    ? (user.referralStats.successfulConversions / allReferrals.length) * 100 
    : 0;
  
  // Group referrals by date (month)
  const referralsByMonth = {};
  populatedReferrals.forEach(referral => {
    const date = new Date(referral.createdAt);
    const monthYear = `${date.getMonth() + 1}/${date.getFullYear()}`;
    
    if (!referralsByMonth[monthYear]) {
      referralsByMonth[monthYear] = {
        count: 0,
        conversions: 0
      };
    }
    
    referralsByMonth[monthYear].count++;
    if (referral.status === 'converted') {
      referralsByMonth[monthYear].conversions++;
    }
  });
  
  // Group referrals by reward type
  const rewardTypeCounts = {
    free_month: 0,
    draw_entries: 0
  };
  
  populatedReferrals.forEach(referral => {
    if (referral.rewardType && referral.status === 'converted') {
      rewardTypeCounts[referral.rewardType]++;
    }
  });
  
  // ============
  // Fetch active draw entries
  // ============
  const drawEntries = await DrawEntry.find({ 
    userId,
    status: "active" 
  }).sort({ createdAt: -1 });
  
  // Group entries by source
  const entriesBySource = {
    signup: 0,
    referral: 0,
    listing: 0,
    other: 0
  };
  
  drawEntries.forEach(entry => {
    if (entry.source && entriesBySource.hasOwnProperty(entry.source)) {
      entriesBySource[entry.source] += entry.tickets;
    } else {
      entriesBySource.other += entry.tickets;
    }
  });
  
  // Get total tickets
  const totalTickets = drawEntries.reduce((sum, entry) => sum + entry.tickets, 0);
  
  // ============
  // Get current draw information
  // ============
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();
  
  let currentDraw = await Draw.findOne({
    month: currentMonth,
    year: currentYear
  });
  
  if (!currentDraw) {
    currentDraw = await Draw.create({
      month: currentMonth,
      year: currentYear,
      status: "pending"
    });
  }
  
  // Get countdown to end of month (draw date)
  const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
  const timeUntilDraw = lastDayOfMonth.getTime() - currentDate.getTime();
  
  // Format countdown
  const daysUntilDraw = Math.floor(timeUntilDraw / (1000 * 60 * 60 * 24));
  const hoursUntilDraw = Math.floor((timeUntilDraw % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  // Check if user is a winner of any draw
  const winningDraw = await Draw.findOne({
    "winner.userId": userId,
    status: "completed",
    paymentStatus: { $ne: "paid" }
  });
  
  // ============
  // Get referral notifications
  // ============
  const notifications = await Notification.find({
    userId,
    read: false,
    $or: [
      { type: 'referral_used' },
      { type: 'draw_entry' }
    ]
  }).sort({ createdAt: -1 }).limit(5);
  
  // ============
  // Return comprehensive dashboard data
  // ============
  res.status(200).json({
    success: true,
    user: {
      id: user._id,
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      profileImage: user.profileImage
    },
    referralCode: referralCode ? referralCode.code : null,
    codeUsageCount: referralCode ? referralCode.usageCount : 0,
    referralLink: referralCode ? `${process.env.FRONTEND_URL || 'https://yourapp.com'}/referral/${referralCode.code}` : null,
    referralStats: {
      ...user.referralStats,
      conversionRate: conversionRate.toFixed(2),
      pendingReferrals: allReferrals.length - user.referralStats.successfulConversions,
      freeMonthsEarned: rewardTypeCounts.free_month,
      drawEntriesEarned: rewardTypeCounts.draw_entries * 5, // 5 tickets per referral
    },
    analytics: {
      referralsByMonth,
      rewardTypes: rewardTypeCounts,
      entriesBySource
    },
    referrals: populatedReferrals.map(ref => ({
      id: ref._id,
      code: ref.referralCode,
      status: ref.status,
      createdAt: ref.createdAt,
      convertedAt: ref.convertedAt,
      rewardType: ref.rewardType,
      rewardStatus: ref.rewardStatus,
      referredUser: ref.referredUserId 
        ? {
            id: ref.referredUserId._id,
            name: ref.referredUserId.fullName,
            username: ref.referredUserId.username,
            email: ref.referredUserId.email,
            profileImage: ref.referredUserId.profileImage,
            joinedAt: ref.referredUserId.createdAt
          } 
        : null,
      listing: ref.listing 
        ? {
            id: ref.listing._id,
            title: ref.listing.title,
            price: ref.listing.price,
            status: ref.listing.status,
            createdAt: ref.listing.createdAt
          } 
        : null
    })),
    drawEntries: {
      total: totalTickets,
      entries: drawEntries.map(entry => ({
        id: entry._id,
        tickets: entry.tickets,
        source: entry.source,
        status: entry.status,
        createdAt: entry.createdAt,
        expiryDate: entry.expiryDate
      })),
      bySource: entriesBySource
    },
    currentDraw: {
      month: currentMonth,
      year: currentYear,
      status: currentDraw.status,
      daysUntilDraw,
      hoursUntilDraw,
      drawDate: lastDayOfMonth
    },
    winnerStatus: {
      isWinner: !!winningDraw,
      winningDraw
    },
    notifications: notifications.map(notif => ({
      id: notif._id,
      type: notif.type,
      message: notif.message,
      createdAt: notif.createdAt,
      data: notif.data
    })),
    unreadNotificationsCount: notifications.length
  });
});

export default {
  generateReferralCode,
  validateReferralCode,
  applyReferralCode,
  chooseReward,
  getUserReferralData,
  getReferralDashboard,
  submitPaymentDetails,
  checkWinnerStatus,
  getReferralNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead
}; 
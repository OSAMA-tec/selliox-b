import User from "../models/user.js";
import Draw from "../models/draw.js";
import DrawEntry from "../models/drawEntry.js";
import PaymentDetail from "../models/paymentDetail.js";
import Notification from "../models/notification.js";
import ErrorHandler from "../utils/ErrorHandler.js";
import catchAsyncErrors from "../middleware/catchAsyncErrors.js";
import { sendMail } from "../utils/mailer.js";

// Get draw management data
export const getDrawManagementData = catchAsyncErrors(async (req, res, next) => {
  try {
    // Get current month's draw
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();
    
    const currentDraw = await Draw.findOne({
      month: currentMonth,
      year: currentYear
    }).populate('winner.userId', 'fullName email');
    
    // Get past draws
    const pastDraws = await Draw.find({
      $or: [
        { year: { $lt: currentYear } },
        { year: currentYear, month: { $lt: currentMonth } }
      ]
    })
    .sort({ year: -1, month: -1 })
    .populate('winner.userId', 'fullName email')
    .limit(10);
    
    // Get total entries and participants
    const totalEntriesAggregation = await DrawEntry.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: null, totalEntries: { $sum: '$tickets' }, uniqueUsers: { $addToSet: '$userId' } } }
    ]);
    
    const totalEntries = totalEntriesAggregation.length ? totalEntriesAggregation[0].totalEntries : 0;
    const totalParticipants = totalEntriesAggregation.length ? totalEntriesAggregation[0].uniqueUsers.length : 0;
    
    // Get pending payments
    const pendingPayments = await Draw.countDocuments({ paymentStatus: 'claimed' });
    
    res.status(200).json({
      success: true,
      currentDraw,
      pastDraws,
      totalEntries,
      totalParticipants,
      pendingPayments
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Helper function to get month name
function getMonthName(monthIndex) {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                  'July', 'August', 'September', 'October', 'November', 'December'];
  return months[monthIndex];
}

// Run monthly draw
export const runMonthlyDraw = catchAsyncErrors(async (req, res, next) => {
  try {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();
    
    // Check if draw already exists for this month
    const existingDraw = await Draw.findOne({
      month: currentMonth,
      year: currentYear
    });
    
    if (existingDraw && existingDraw.status === 'completed') {
      return next(new ErrorHandler('Draw for this month has already been completed', 400));
    }
    
    // Get all active entries
    const entries = await DrawEntry.find({ status: 'active' })
      .populate('userId', 'fullName email');
    
    if (entries.length === 0) {
      return next(new ErrorHandler('No active entries for the draw', 400));
    }
    
    // Create weighted array of user IDs based on number of tickets
    let ticketPool = [];
    let totalEntries = 0;
    
    entries.forEach(entry => {
      for (let i = 0; i < entry.tickets; i++) {
        ticketPool.push({
          userId: entry.userId._id,
          name: entry.userId.fullName,
          email: entry.userId.email,
          entries: entry.tickets
        });
      }
      totalEntries += entry.tickets;
    });
    
    // Select random winner
    const winnerIndex = Math.floor(Math.random() * ticketPool.length);
    const winner = ticketPool[winnerIndex];
    
    // Create or update draw
    let draw;
    if (existingDraw) {
      existingDraw.status = 'completed';
      existingDraw.winner = {
        userId: winner.userId,
        entries: winner.entries
      };
      existingDraw.totalEntries = totalEntries;
      existingDraw.drawDate = new Date();
      draw = await existingDraw.save();
    } else {
      draw = await Draw.create({
        month: currentMonth,
        year: currentYear,
        status: 'completed',
        winner: {
          userId: winner.userId,
          entries: winner.entries
        },
        totalEntries,
        prizeAmount: 250,
        drawDate: new Date(),
        paymentStatus: 'pending'
      });
    }
    
    // Create notification for winner
    await Notification.create({
      userId: winner.userId,
      type: 'draw_winner',
      message: `Congratulations! You've won $${draw.prizeAmount} in our monthly draw!`,
      data: {
        drawId: draw._id,
        amount: draw.prizeAmount
      },
      read: false
    });
    
    // Send email notification to winner
    try {
      await sendMail({
        to: winner.email,
        subject: `🎉 Congratulations! You've Won $${draw.prizeAmount} in Our Monthly Draw!`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
            <div style="background-color: #F9D949; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: #333; margin: 0;">🎉 Congratulations!</h1>
              <p style="font-size: 18px; margin-top: 10px;">You're our monthly draw winner!</p>
            </div>
            
            <div style="background-color: #fff; padding: 20px; border-radius: 0 0 8px 8px; border: 1px solid #ddd; border-top: none;">
              <p>Dear ${winner.name},</p>
              
              <p>We're thrilled to inform you that you've won <strong>$${draw.prizeAmount}</strong> in our ${getMonthName(currentMonth)} ${currentYear} draw!</p>
              
              <p>Your ${winner.entries} entries have paid off! To claim your prize, please log in to your account and submit your payment details in the referral section.</p>
              
              <div style="background-color: #f7f7f7; border-radius: 8px; padding: 15px; margin: 20px 0;">
                <p style="font-weight: bold; margin-top: 0;">Next steps:</p>
                <ol style="margin-bottom: 0; padding-left: 20px;">
                  <li>Log in to your account</li>
                  <li>Go to the Referral section</li>
                  <li>Submit your payment details</li>
                  <li>We'll process your payment within 3-5 business days</li>
                </ol>
              </div>
              
              <p>If you have any questions about claiming your prize, please don't hesitate to contact our support team.</p>
              
              <p>Congratulations again!</p>
              
              <p>Best regards,<br>The Selliox Team</p>
              
              <div style="margin-top: 30px; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 15px;">
                <p>This is an automated message. Please do not reply to this email.</p>
              </div>
            </div>
          </div>
        `
      });
    } catch (error) {
      console.error('Failed to send winner email notification:', error);
      // Continue execution even if email fails - notification was already created
    }
    
    res.status(200).json({
      success: true,
      message: 'Draw completed successfully',
      draw
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Process winner payment
export const processPayment = catchAsyncErrors(async (req, res, next) => {
  try {
    const { drawId } = req.params;
    
    // Find draw and update payment status
    const draw = await Draw.findById(drawId).populate('winner.userId paymentDetails');
    
    if (!draw) {
      return next(new ErrorHandler('Draw not found', 404));
    }
    
    if (draw.paymentStatus !== 'claimed') {
      return next(new ErrorHandler('Payment details not yet claimed by winner', 400));
    }
    
    // Get payment details and winner info
    const paymentDetails = await PaymentDetail.findById(draw.paymentDetails).populate('userId', 'fullName email');
    if (!paymentDetails) {
      return next(new ErrorHandler('Payment details not found', 404));
    }
    
    // Update draw payment status
    draw.paymentStatus = 'paid';
    draw.paidDate = new Date();
    await draw.save();
    
    // Update payment details
    if (draw.paymentDetails) {
      await PaymentDetail.findByIdAndUpdate(draw.paymentDetails._id, {
        status: 'paid',
        paidAt: new Date()
      });
    }
    
    // Create notification for winner
    await Notification.create({
      userId: draw.winner.userId,
      type: 'payment_processed',
      message: `Your prize payment of $${draw.prizeAmount} has been processed!`,
      data: {
        drawId: draw._id,
        amount: draw.prizeAmount
      },
      read: false
    });
    
    // Send email notification to winner about processed payment
    try {
      const winner = await User.findById(draw.winner.userId);
      if (winner && winner.email) {
        await sendMail({
          to: winner.email,
          subject: `💰 Your $${draw.prizeAmount} Prize Payment Has Been Processed`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
              <div style="background-color: #4CAF50; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                <h1 style="color: white; margin: 0;">Payment Processed</h1>
                <p style="font-size: 18px; margin-top: 10px; color: white;">Your prize payment has been sent!</p>
              </div>
              
              <div style="background-color: #fff; padding: 20px; border-radius: 0 0 8px 8px; border: 1px solid #ddd; border-top: none;">
                <p>Dear ${winner.fullName},</p>
                
                <p>Great news! We've processed your prize payment of <strong>$${draw.prizeAmount}</strong> from the ${getMonthName(draw.month)} ${draw.year} draw.</p>
                
                <p>The payment has been sent to your bank account as per the details you provided:</p>
                
                <div style="background-color: #f7f7f7; border-radius: 8px; padding: 15px; margin: 20px 0;">
                  <p><strong>Bank:</strong> ${paymentDetails.bankName}</p>
                  <p><strong>Account holder:</strong> ${paymentDetails.accountHolder}</p>
                  <p><strong>Account number:</strong> ****${paymentDetails.accountNumber.slice(-4)}</p>
                  <p><strong>Date processed:</strong> ${new Date().toLocaleDateString()}</p>
                </div>
                
                <p>The payment should appear in your account within 2-3 business days, depending on your bank's processing times.</p>
                
                <p>If you don't receive the payment within 5 business days, please contact our support team.</p>
                
                <p>Congratulations again on your win, and thank you for being part of our community!</p>
                
                <p>Best regards,<br>The Selliox Team</p>
                
                <div style="margin-top: 30px; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 15px;">
                  <p>This is an automated message. Please do not reply to this email.</p>
                </div>
              </div>
            </div>
          `
        });
      }
    } catch (error) {
      console.error('Failed to send payment processed email notification:', error);
      // Continue execution even if email fails - notification was already created
    }
    
    res.status(200).json({
      success: true,
      message: 'Payment marked as processed',
      draw
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

export default {
  getDrawManagementData,
  runMonthlyDraw,
  processPayment
}; 
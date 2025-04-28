import schedule from 'node-schedule';
import adminController from '../controller/admin.js';
import User from "../models/user.js";
import Notification from "../models/notification.js";
import DrawEntry from "../models/drawEntry.js";
import Draw from "../models/draw.js";

/**
 * Scheduler class to manage all scheduled tasks in the application
 */
class Scheduler {
  constructor() {
    this.jobs = {};
  }

  /**
   * Initialize all scheduled jobs
   */
  init() {
    this.scheduleMonthlyDraw();
    this.scheduleDrawReminders();
    this.scheduleEntryExpirationCheck();
    console.log('✅ Scheduler initialized successfully');
  }

  /**
   * Schedule the monthly draw to run on the 1st of each month at 12:01 AM
   */
  scheduleMonthlyDraw() {
    // Run on the 1st day of every month at 12:01 AM
    this.jobs.monthlyDraw = schedule.scheduleJob('1 0 1 * *', async () => {
      console.log('🎲 Running scheduled monthly draw...');
      try {
        // Simulate a request object with next function for error handling
        const req = {};
        const res = {
          status: (code) => ({
            json: (data) => {
              console.log(`Draw completed with status code ${code}`);
              if (data.success) {
                console.log(`Winner: ${data.draw.winner?.userId}`);
              }
            }
          })
        };
        const next = (error) => {
          if (error) {
            console.error('Error running monthly draw:', error);
          }
        };

        // Run the draw
        await adminController.runMonthlyDraw(req, res, next);
      } catch (error) {
        console.error('Failed to run monthly draw:', error);
      }
    });
    console.log('📅 Monthly draw scheduled for 1st day of each month at 12:01 AM');
  }

  /**
   * Schedule reminders for users about upcoming draws
   * Sends a notification 3 days before the draw
   */
  scheduleDrawReminders() {
    // Run on the 28th day (or equivalent for shorter months) at 10:00 AM
    this.jobs.drawReminders = schedule.scheduleJob('0 10 28 * *', async () => {
      console.log('🔔 Sending draw reminders...');
      
      try {
        // Get all users with active draw entries
        const usersWithEntries = await DrawEntry.distinct('userId', { status: 'active' });
        
        // Get the current month's draw details
        const currentDate = new Date();
        const currentDraw = await Draw.findOne({
          month: currentDate.getMonth(),
          year: currentDate.getFullYear(),
          status: 'pending'
        });
        
        if (!currentDraw) {
          console.log('No pending draw found for reminders');
          return;
        }
        
        // Send notifications to all eligible users
        for (const userId of usersWithEntries) {
          // Count active tickets for this user
          const entries = await DrawEntry.find({ userId, status: 'active' });
          const ticketCount = entries.reduce((sum, entry) => sum + entry.tickets, 0);
          
          if (ticketCount > 0) {
            // Create a notification for the user
            await Notification.create({
              userId,
              type: 'draw_reminder',
              title: 'Upcoming Draw Reminder',
              message: `The monthly draw worth $${currentDraw.prizeAmount} is happening in 3 days! You have ${ticketCount} ticket${ticketCount !== 1 ? 's' : ''} entered.`,
              data: {
                drawId: currentDraw._id,
                ticketCount,
                drawDate: new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
              }
            });
          }
        }
        
        console.log(`Sent reminders to ${usersWithEntries.length} users`);
      } catch (error) {
        console.error('Failed to send draw reminders:', error);
      }
    });
    console.log('📅 Draw reminders scheduled for the 28th of each month at 10:00 AM');
  }

  /**
   * Check for and update expired draw entries
   * Runs on the 15th of each month
   */
  scheduleEntryExpirationCheck() {
    this.jobs.expiryCheck = schedule.scheduleJob('0 0 15 * *', async () => {
      console.log('🔍 Checking for expired draw entries...');
      try {
        const currentDate = new Date();
        
        // Find all entries that have expired
        const expiredEntries = await DrawEntry.find({
          status: 'active',
          expiryDate: { $lt: currentDate }
        });
        
        if (expiredEntries.length === 0) {
          console.log('No expired entries found');
          return;
        }
        
        // Mark entries as expired
        await DrawEntry.updateMany(
          { _id: { $in: expiredEntries.map(entry => entry._id) } },
          { $set: { status: 'expired' } }
        );
        
        // Adjust user ticket counts
        const userTicketUpdates = {};
        expiredEntries.forEach(entry => {
          const userId = entry.userId.toString();
          if (!userTicketUpdates[userId]) {
            userTicketUpdates[userId] = 0;
          }
          userTicketUpdates[userId] += entry.tickets;
        });
        
        // Update each user's active ticket count
        for (const userId in userTicketUpdates) {
          await User.findByIdAndUpdate(userId, {
            $inc: { "referralStats.activeDrawTickets": -userTicketUpdates[userId] }
          });
          
          // Notify user about expired tickets
          await Notification.create({
            userId,
            type: 'draw_entry',
            title: 'Draw Entries Expired',
            message: `${userTicketUpdates[userId]} draw ticket${userTicketUpdates[userId] !== 1 ? 's have' : ' has'} expired.`,
            data: {
              expiredTickets: userTicketUpdates[userId]
            }
          });
        }
        
        console.log(`Expired ${expiredEntries.length} entries for ${Object.keys(userTicketUpdates).length} users`);
      } catch (error) {
        console.error('Failed to process expired entries:', error);
      }
    });
    console.log('📅 Entry expiration check scheduled for the 15th of each month');
  }

  /**
   * Stop all scheduled jobs
   */
  stopAll() {
    Object.values(this.jobs).forEach(job => job.cancel());
    console.log('Scheduler stopped all jobs');
  }
}

export default new Scheduler(); 
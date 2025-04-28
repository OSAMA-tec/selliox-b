// emailRoute.js
import express from 'express';
import mongoose from 'mongoose';
import User from "../models/user.js";
const router = express.Router();
import nodemailer from 'nodemailer';
import transporter, { sendMail } from '../utils/mailer.js';

// Email sending route
router.post('/send', async(req, res) => {  
  const { buyerEmail, sellerId, subject, message } = req.body;
  
  // Validate required fields
  if (!buyerEmail || !sellerId || !message) {
    return res.status(400).json({ 
      success: false, 
      message: 'Missing required fields. Please provide buyerEmail, sellerId, and message.' 
    });
  }

  // ============
  // Handle case where sellerId is an object with _id property
  // ============
  let sellerIdToUse;
  
  if (typeof sellerId === 'object' && sellerId !== null) {
    // If sellerId is an object, try to get the _id property
    sellerIdToUse = sellerId._id;
  } else {
    // If sellerId is already a string, use it directly
    sellerIdToUse = sellerId;
  }

  // Validate seller ID
  if (!sellerIdToUse || !mongoose.Types.ObjectId.isValid(sellerIdToUse)) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid Seller ID format' 
    });
  }

  try {
    // Find the seller
    const seller = await User.findById(sellerIdToUse);

    if (!seller) {
      return res.status(404).json({
        success: false,
        message: "Seller not found"
      });
    }

    const sellerEmail = seller.email;
    
    // Set up email data
    const mailOptions = {
      from: `"Marketplace Contact" <${process.env.EMAIL_FROM || "marketplace@example.com"}>`,
      replyTo: buyerEmail,
      to: sellerEmail,
      subject: subject || "Message from Marketplace",
      text: `Message from: ${buyerEmail}\n\n${message}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>You have received a message from a potential buyer</h2>
          <p><strong>From:</strong> ${buyerEmail}</p>
          <div style="padding: 15px; border-left: 4px solid #ccc; margin: 15px 0;">
            ${message.replace(/\n/g, '<br>')}
          </div>
          <p>You can reply directly to this email to respond.</p>
          <hr>
          <p style="color: #777; font-size: 12px;">This email was sent from the Marketplace platform.</p>
        </div>
      `
    };

    // ============
    // Send email using the helper function or fallback 
    // ============
    let info;
    
    if (typeof sendMail === 'function') {
      // Use the sendMail helper function if available
      info = await sendMail(mailOptions);
    } else if (transporter && typeof transporter.sendMail === 'function') {
      // Fallback to using transporter directly if it exists
      info = await transporter.sendMail(mailOptions);
    } else {
      // Create a temporary test account as last resort
      const testAccount = await nodemailer.createTestAccount();
      const tempTransporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      
      info = await tempTransporter.sendMail(mailOptions);
      console.log('Test email URL:', nodemailer.getTestMessageUrl(info));
    }
    
    return res.status(200).json({ 
      success: true,
      message: 'Message sent successfully to seller',
      info: { messageId: info.messageId }
    });
  } catch (error) {
    console.error('Email sending error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send email. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/* 
import express from 'express';
var router = express.Router();
import nodemailer from 'nodemailer';
import cors from 'cors'; 

var transport = {
    host: 'smtp-mail.outlook.com', // Don't forget to replace with the SMTP host of your provider
    port: 587,
    auth: {
    user: 'AmjedMeeralebbe@hotmail.com',
    pass: ''
  }
}
var transporter = nodemailer.createTransport(transport)
transporter.verify((error, success) => {
  if (error) {
    console.log(error);
  } else {
    console.log('Server is ready to take messages');
  }
});
router.post('/send', (req, res, next) => {
  var name = req.body.name
  var email = req.body.email
  var message = req.body.message
  var content = `name: ${name} \n email: ${email} \n message: ${message} `
  var mail = {
    from: name,
    to: 'RECEIVING_EMAIL_ADDRESS_GOES_HERE',  // Change to email address that you want to receive messages on
    subject: 'New Message from Contact Form',
    text: content
  }
  transporter.sendMail(mail, (err, data) => {
    if (err) {
      res.json({
        status: 'fail'
      })
    } else {
      res.json({
       status: 'success'
      })
    }
  })
})
const app = express()
app.use(cors())
app.use(express.json())
app.use('/', router)
app.listen(3002) */


export default router;

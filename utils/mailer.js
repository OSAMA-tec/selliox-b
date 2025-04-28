// mailer.js
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

// Get directory path for template validation
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATES_DIR = path.join(__dirname, '../email-templates');

// Setup email transporter with fallback to ethereal if no credentials
let transporter;

// Check if we have mailgun credentials
if (process.env.mailUsername && process.env.mailPassword) {
  // Setup the Mailgun transporter using the SMTP credentials
  transporter = nodemailer.createTransport({
    service: 'Mailgun',
    host: 'smtp.mailgun.org',
    port: 587,
    auth: {
      user: process.env.mailUsername,
      pass: process.env.mailPassword,
    },
  });
  
  // Verify connection configuration
  transporter.verify((error) => {
    if (error) {
      console.error('Error with email server connection:', error);
    } else {
      console.log('Email server connection established successfully');
    }
  });
} else {
  if (process.env.NODE_ENV === 'production') {
    console.error('CRITICAL ERROR: No email credentials found in production environment');
  } else {
    console.log('No email credentials found. Using ethereal email for testing.');
    
    // Create a test account on ethereal.email
    nodemailer.createTestAccount().then(testAccount => {
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      
      console.log('Ethereal email test account created:', testAccount.user);
    }).catch(err => {
      console.error('Failed to create test email account', err);
      
      // Fallback to a logger transport in development only
      transporter = {
        sendMail: (options) => {
          console.log('⚠️ EMAIL WOULD BE SENT (DEVELOPMENT MODE ONLY):');
          console.log('From:', options.from);
          console.log('To:', options.to);
          console.log('Subject:', options.subject);
          console.log('Text:', options.text);
          
          return Promise.resolve({ messageId: 'console-transport' });
        }
      };
    });
  }
}

// Helper function to validate template existence
const validateTemplate = (templateName) => {
  const templatePath = path.join(TEMPLATES_DIR, `${templateName}.html`);
  return fs.existsSync(templatePath);
};

// Enhanced sendMail function with template validation
const sendMail = async (options) => {
  return new Promise((resolve, reject) => {
    // Validate template if specified
    if (options.template && !validateTemplate(options.template)) {
      return reject(new Error(`Email template '${options.template}' not found`));
    }
    
    // Make sure transporter exists
    if (!transporter) {
      return reject(new Error('Email transport not configured'));
    }
    
    // Send email
    transporter.sendMail(options)
      .then(info => {
        if (process.env.NODE_ENV !== 'production') {
          console.log('Email sent: %s', info.messageId);
          if (info.messageUrl) {
            console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
          }
        }
        resolve(info);
      })
      .catch(error => {
        console.error('Error sending email:', error);
        reject(error);
      });
  });
};

export { sendMail, validateTemplate };
export default transporter;

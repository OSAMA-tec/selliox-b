import { Schema, model } from "mongoose";
import crypto from "crypto";

// Encryption configuration
const algorithm = 'aes-256-gcm';
const secretKey = process.env.ENCRYPTION_KEY || 'fallback-key-for-development-only-change-in-prod';

// Encryption helpers
const encrypt = (text) => {
  if (!text) return text;
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, Buffer.from(secretKey, 'hex'), iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    // Return iv, encrypted data, and auth tag as a combined string
    return `${iv.toString('hex')}:${encrypted}:${authTag}`;
  } catch (error) {
    console.error('Encryption error:', error);
    return text; // Fallback to unencrypted in case of error
  }
};

const decrypt = (encryptedText) => {
  if (!encryptedText || !encryptedText.includes(':')) return encryptedText;
  try {
    const [ivHex, encrypted, authTagHex] = encryptedText.split(':');
    
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(algorithm, Buffer.from(secretKey, 'hex'), iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return encryptedText; // Return encrypted text if decryption fails
  }
};

const paymentDetailSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    drawId: {
      type: Schema.Types.ObjectId,
      ref: "Draw",
      required: true,
    },
    bankName: {
      type: String,
      required: true,
      trim: true,
    },
    accountHolder: {
      type: String,
      required: true,
      trim: true,
    },
    accountNumber: {
      type: String,
      required: true,
      trim: true,
      set: encrypt,
      get: decrypt,
    },
    status: {
      type: String,
      enum: ["pending", "verified", "paid"],
      default: "pending",
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      default: "",
    }
  },
  { 
    timestamps: true, 
    versionKey: false,
    toJSON: { getters: true },
    toObject: { getters: true }
  }
);

export default model("PaymentDetail", paymentDetailSchema); 
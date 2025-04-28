import { Schema, model } from "mongoose";
import { nanoid } from "nanoid";

const referralCodeSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    usageCount: {
      type: Number,
      default: 0,
    }
  },
  { timestamps: true, versionKey: false }
);

// Static method to generate a unique code
referralCodeSchema.statics.generateUniqueCode = async function() {
  let isUnique = false;
  let code;
  
  while (!isUnique) {
    // Generate a 6-character alphanumeric code
    code = nanoid(6).toUpperCase();
    
    // Check if code already exists
    const existingCode = await this.findOne({ code });
    if (!existingCode) {
      isUnique = true;
    }
  }
  
  return code;
};

export default model("ReferralCode", referralCodeSchema); 
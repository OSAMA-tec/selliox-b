import { Schema, model } from "mongoose";

const drawEntrySchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    tickets: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    status: {
      type: String,
      enum: ["active", "used", "expired"],
      default: "active",
    },
    source: {
      type: String,
      enum: ["referral", "signup", "listing", "promotion"],
      required: true,
    },
    referralId: {
      type: Schema.Types.ObjectId,
      ref: "Referral",
      default: null,
    },
    expiryDate: {
      type: Date,
      default: function() {
        // Set expiry to 3 months from now
        const expiry = new Date();
        expiry.setMonth(expiry.getMonth() + 3);
        return expiry;
      }
    }
  },
  { timestamps: true, versionKey: false }
);

export default model("DrawEntry", drawEntrySchema); 
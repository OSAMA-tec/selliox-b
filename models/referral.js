import { Schema, model } from "mongoose";

const referralSchema = new Schema(
  {
    referrerUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    referredUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    referralCode: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "converted", "rewarded"],
      default: "pending",
    },
    convertedAt: {
      type: Date,
      default: null,
    },
    rewardType: {
      type: String,
      enum: ["free_month", "draw_entries", null],
      default: null,
    },
    rewardStatus: {
      type: String,
      enum: ["pending", "claimed", "processed", null],
      default: null,
    },
    listing: {
      type: Schema.Types.ObjectId,
      ref: "Listing",
      default: null,
    }
  },
  { timestamps: true, versionKey: false }
);

export default model("Referral", referralSchema); 
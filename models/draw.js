import { Schema, model } from "mongoose";

const drawSchema = new Schema(
  {
    month: {
      type: Number,
      required: true,
      min: 0,
      max: 11, // 0-11 representing Jan-Dec
    },
    year: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "completed"],
      default: "pending",
    },
    winner: {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      entries: {
        type: Number,
        default: null,
      },
    },
    totalEntries: {
      type: Number,
      default: 0,
    },
    prizeAmount: {
      type: Number,
      default: 250, // $250 default
    },
    drawDate: {
      type: Date,
      default: null,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "claimed", "paid"],
      default: "pending",
    },
    paymentDetails: {
      type: Schema.Types.ObjectId,
      ref: "PaymentDetail",
      default: null,
    },
    paidDate: {
      type: Date,
      default: null,
    }
  },
  { timestamps: true, versionKey: false }
);

// Ensure only one draw per month/year
drawSchema.index({ month: 1, year: 1 }, { unique: true });

export default model("Draw", drawSchema); 
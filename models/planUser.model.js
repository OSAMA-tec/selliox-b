import mongoose from "mongoose";

const planUserSchema = new mongoose.Schema({
  // User reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  // Plan reference
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Plan",
    required: true
  },
  // Payment details
  paymentIntentId: {
    type: String,
    default: null
  },
  paymentStatus: {
    type: String,
    enum: ["pending", "succeeded", "failed", "canceled"],
    default: "pending"
  },
  // Subscription details
  startDate: {
    type: Date,
    default: null
  },
  endDate: {
    type: Date,
    default: null
  },
  isActive: {
    type: Boolean,
    default: false
  },
  // Additional subscription metadata
  paymentAmount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: "nzd"
  },
  autoRenew: {
    type: Boolean,
    default: false
  }
}, { timestamps: true, versionKey: false });

// Create index for faster lookups
planUserSchema.index({ userId: 1, planId: 1 });
planUserSchema.index({ paymentIntentId: 1 });

const PlanUser = mongoose.model("PlanUser", planUserSchema);

export default PlanUser; 
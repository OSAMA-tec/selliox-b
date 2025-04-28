import { Schema, model } from "mongoose";

const notificationSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: [
        "referral_used", 
        "draw_entry", 
        "draw_winner", 
        "draw_reminder",
        "payment_processed"
      ],
      required: true,
    },
    title: {
      type: String,
      default: function() {
        // Set default title based on type
        switch(this.type) {
          case "referral_used":
            return "Referral Used";
          case "draw_entry":
            return "New Draw Entries";
          case "draw_winner":
            return "Draw Winner";
          case "draw_reminder":
            return "Draw Reminder";
          case "payment_processed":
            return "Payment Processed";
          default:
            return "Notification";
        }
      }
    },
    message: {
      type: String,
      required: true,
    },
    data: {
      type: Object,
      default: {},
    },
    read: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    }
  },
  { timestamps: true, versionKey: false }
);

export default model("Notification", notificationSchema); 
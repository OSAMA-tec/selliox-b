import { Schema, model } from "mongoose";
import { reviewSchema } from "./review.js";
const listingSchema = new Schema(
  {
    listingNumber: {
      type: Number,
      unique: true,
      index: true
    },
    businessTitle: {
      type: String,
      required: [true, "Please enter a title for the listing"],
    },
    businessEmailAddress: {
      type: String,
      //Amjed 2025.3.1
      required: [false, "Please enter a email for the listing"],
    },
    serviceTitle: {
      type: String,
      required: [true, "Please enter a title for the listing"],
    },
    businessInfo: {
      type: String,
      required: [true, "Please enter a description for the listing"],
    },
    serviceDescription: {
      type: String,
      required: [true, "Please enter a description for the listing"],
    },
    serviceCategory: {
      type: String,
      required: [true, "Please enter the listing category"],
    },
    serviceSubCategory: {
      type: String,
      required: [false, "Please enter the listing Sub Category"],
    },
    serviceImages: [
      {
        type: String,
        required: [false, "Please provide at least one image"],
      },
    ],
    logo: {
      type: String,
      required: [false, "Please Provide Your Business Logo"],
    },
    website: {
      type: String,
    },
    location: {
      type: String,
      required: true,
    },
    services: [
      {
        type: String,
        required: [true, "Please provide at least one service"],
      },
    ],
    plan: {
      type: Schema.Types.ObjectId,
      ref: "Plan",
      required: [true, "Plan ID is required"],
    },
    sellerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Seller ID is required"],
    },
    reviews: [
      {
        type: Schema.Types.ObjectId,
        ref: "Review",
      },
    ],
    status: {
      type: String,
      enum: ["active", "inactive", "expired"],
      default: "active"
    },
    subscriptionEndDate: {
      type: Date,
      default: function() {
        return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default 30 days from creation
      }
    }
  },
  { timestamps: true, versionKey: false }
);

export default model("Listing", listingSchema);

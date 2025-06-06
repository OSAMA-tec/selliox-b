import { Schema, model } from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const userSchema = new Schema(
  {
    fullName: {
      type: String,
      required: [true, "Please enter your name"],
    },
    username: {
      type: String,
    },
    address: {
      type: String,
    },
    about: {
      type: String,
    },
    email: {
      type: String,
      required: [true, "Please enter your email"],
      unique: true,
    },
    password: {
      type: String,
      required: [true, "Please enter your password"],
      minLength: [4, "Password should be greater than 4 characters"],
      select: false,
    },
    stripeCustomerId: { type: String, default: null },
    phoneNumber: {
      type: Number,
      required: false,
    },
    profileImage: {
      type: String,
      required: false,
    },
    savedListings: [
      {
        type: Schema.Types.ObjectId,
        ref: "Listing",
        unique: true,
      },
    ],
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    // Referral program fields
    referralCode: {
      type: String,
      default: null,
    },
    referralCodeStatus: {
      type: String,
      enum: ["active", "inactive", null],
      default: null,
    },
    referredBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    referralStats: {
      referralsCount: {
        type: Number,
        default: 0,
      },
      successfulConversions: {
        type: Number,
        default: 0,
      },
      activeDrawTickets: {
        type: Number,
        default: 0,
      },
      freeMonthsUsed: {
        type: Number,
        default: 0,
      },
      totalRewards: {
        type: Number,
        default: 0,
      },
    },
  },
  { timestamps: true, versionKey: false }
);

// Custom validation to ensure uniqueness in savedListings
userSchema.path("savedListings").validate(function (value) {
  const uniqueListings = new Set(value.map((v) => v.toString())); // Ensure IDs are unique
  return uniqueListings.size === value.length;
}, "Duplicate listings are not allowed.");

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    next();
    return;
  }
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// jwt token
userSchema.methods.getJwtToken = function () {
  return jwt.sign({ id: this._id }, process.env.JWT_SECRET_KEY);
};

// compare password
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

export default model("User", userSchema);

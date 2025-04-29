import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";

import { isAuthenticated } from "../middleware/auth.js";
import PlanUser from "../models/planUser.model.js";
import Plan from "../models/plan.model.js";
import User from "../models/user.js";
import stripeService from "../services/stripe.service.js";

dotenv.config();
const router = express.Router();

/**
 * Create payment intent for a plan subscription
 * Payment method will be collected on the frontend
 * POST /plan-user/create-intent
 */
router.post("/create-intent", isAuthenticated, async (req, res) => {
  try {
    const { planId } = req.body;
    const userId = req.user._id;

    // Validate inputs
    if (!planId || !mongoose.Types.ObjectId.isValid(planId)) {
      return res.status(400).json({ success: false, message: "Valid plan ID is required" });
    }

    // Get plan details
    const plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(404).json({ success: false, message: "Plan not found" });
    }

    // Get user and ensure they have a Stripe customer ID
    const user = await User.findById(userId);
    const customerId = await stripeService.ensureCustomerId(user);
    
    // Create a payment intent without payment method (will be collected on frontend)
    const paymentIntent = await stripeService.createSetupIntent(
      plan.planPrice,
      customerId,
      `Subscription to ${plan.planType} plan`,
      {
        userId: userId.toString(),
        planId: planId.toString()
      }
    );

    // Create a pending subscription record
    const planUser = await PlanUser.create({
      userId: userId,
      planId: planId,
      paymentIntentId: paymentIntent.id,
      paymentStatus: "pending",
      paymentAmount: plan.planPrice,
      currency: "nzd"
    });

    // Return the client secret and subscription details
    res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      planUserId: planUser._id,
      amount: plan.planPrice,
      planType: plan.planType
    });
    
  } catch (error) {
    console.error("Create payment intent error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to create payment intent", 
      error: error.message 
    });
  }
});

/**
 * Update payment status after Stripe confirmation
 * POST /plan-user/confirm-payment
 */
router.post("/confirm-payment", isAuthenticated, async (req, res) => {
  try {
    const { paymentIntentId } = req.body;
    const userId = req.user._id;

    if (!paymentIntentId) {
      return res.status(400).json({ success: false, message: "Payment intent ID is required" });
    }

    // Retrieve the payment intent from Stripe
    const paymentIntent = await stripeService.retrievePaymentIntent(paymentIntentId);
    
    if (!paymentIntent) {
      return res.status(404).json({ success: false, message: "Payment intent not found" });
    }

    // Verify this payment intent belongs to the current user
    if (paymentIntent.metadata.userId !== userId.toString()) {
      return res.status(403).json({ success: false, message: "Unauthorized access to payment intent" });
    }

    const planId = paymentIntent.metadata.planId;
    const plan = await Plan.findById(planId);
    
    // Find the corresponding planUser record
    const planUser = await PlanUser.findOne({ paymentIntentId: paymentIntentId });
    
    if (!planUser) {
      return res.status(404).json({ success: false, message: "Subscription record not found" });
    }

    // Update the payment status based on Stripe payment intent status
    if (paymentIntent.status === "succeeded") {
      // Calculate subscription period (30 days from now)
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 30);
      
      // Update planUser record with payment success and subscription dates
      await PlanUser.findByIdAndUpdate(planUser._id, {
        paymentStatus: "succeeded",
        isActive: true,
        startDate: startDate,
        endDate: endDate
      });
      
      res.status(200).json({
        success: true,
        message: "Payment successful",
        subscriptionDetails: {
          planType: plan.planType,
          startDate: startDate,
          endDate: endDate,
          isActive: true
        }
      });
    } else if (paymentIntent.status === "canceled") {
      await PlanUser.findByIdAndUpdate(planUser._id, {
        paymentStatus: "canceled",
        isActive: false
      });
      
      res.status(200).json({
        success: true,
        message: "Payment was canceled",
        status: "canceled"
      });
    } else {
      // For other statuses, just update the status
      await PlanUser.findByIdAndUpdate(planUser._id, {
        paymentStatus: paymentIntent.status
      });
      
      res.status(200).json({
        success: true,
        message: `Payment status updated to ${paymentIntent.status}`,
        status: paymentIntent.status
      });
    }
    
  } catch (error) {
    console.error("Confirm payment error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to confirm payment", 
      error: error.message 
    });
  }
});

/**
 * Get user's active subscriptions
 * GET /plan-user/my-subscriptions
 */
router.get("/my-subscriptions", isAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Find all active subscriptions for this user
    const subscriptions = await PlanUser.find({ 
      userId: userId,
      isActive: true 
    }).populate('planId');
    
    // Filter subscriptions based on plan type and listing limits
    const availableSubscriptions = [];
    
    for (const subscription of subscriptions) {
      // Skip basic plans entirely as requested
      if (subscription.planId.planType === "basic") {
        continue;
      }
      
      const planType = subscription.planId.planType;
      let maxListings = 5; // Default for premium plan
      
      if (planType === "featured") {
        maxListings = 10;
      }
      
      // Only include subscriptions that haven't reached their limit
      if (subscription.listingsUsed < maxListings) {
        availableSubscriptions.push(subscription);
      }
    }
    
    res.status(200).json({
      success: true,
      subscriptions: availableSubscriptions
    });
    
  } catch (error) {
    console.error("Get subscriptions error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to retrieve subscriptions", 
      error: error.message 
    });
  }
});

/**
 * Webhook to handle Stripe events
 * POST /plan-user/webhook
 * Note: This should be publicly accessible (no auth) and needs additional security measures in production
 */
router.post("/webhook", express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Verify webhook signature
    event = stripeService.verifyWebhookSignature(req.body, sig);
  } catch (err) {
    console.log(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    
    // Update the planUser record
    try {
      const planUser = await PlanUser.findOne({ 
        paymentIntentId: paymentIntent.id 
      });
      
      if (planUser) {
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 30);
        
        await PlanUser.findByIdAndUpdate(planUser._id, {
          paymentStatus: "succeeded",
          isActive: true,
          startDate: startDate,
          endDate: endDate
        });
        
        console.log(`Updated subscription for payment intent: ${paymentIntent.id}`);
      }
    } catch (error) {
      console.error('Error processing payment success webhook:', error);
    }
  } else if (event.type === 'payment_intent.payment_failed') {
    const paymentIntent = event.data.object;
    
    try {
      await PlanUser.findOneAndUpdate(
        { paymentIntentId: paymentIntent.id },
        { paymentStatus: "failed", isActive: false }
      );
      
      console.log(`Updated failed payment for intent: ${paymentIntent.id}`);
    } catch (error) {
      console.error('Error processing payment failure webhook:', error);
    }
  }

  // Return a 200 response to acknowledge receipt of the event
  res.send();
});

export default router; 
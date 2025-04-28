import Stripe from "stripe";
import dotenv from "dotenv";
import User from "../models/user.js";

dotenv.config();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Service for handling Stripe payment operations
 */
class StripeService {
  /**
   * Ensure user has a Stripe customer ID, create one if needed
   * @param {Object} user - User object with _id, email, fullName
   * @returns {String} Stripe customer ID
   */
  async ensureCustomerId(user) {
    let customerId = user.stripeCustomerId;
    
    // If customer ID exists, verify it's still valid in Stripe
    if (customerId) {
      try {
        // Try to retrieve the customer to verify it exists
        await stripe.customers.retrieve(customerId);
        // If no error is thrown, the customer exists
        return customerId;
      } catch (error) {
        console.log(`Customer ID ${customerId} no longer valid in Stripe: ${error.message}`);
        // Customer doesn't exist in the current Stripe environment
        // We'll create a new one below
        customerId = null;
      }
    }
    
    // Create a new customer if needed
    if (!customerId) {
      try {
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.fullName,
          metadata: {
            userId: user._id.toString()
          }
        });
        
        customerId = customer.id;
        // Save the customer ID to the user record
        await User.findByIdAndUpdate(user._id, { stripeCustomerId: customerId });
        console.log(`Created new Stripe customer: ${customerId} for user: ${user._id}`);
      } catch (createError) {
        console.error('Failed to create Stripe customer:', createError.message);
        throw createError;
      }
    }
    
    return customerId;
  }
  
  /**
   * Attach payment method to customer
   * @param {String} paymentMethodId - Stripe payment method ID
   * @param {String} customerId - Stripe customer ID
   */
  async attachPaymentMethod(paymentMethodId, customerId) {
    try {
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });
      
      // Set as default payment method
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
    } catch (error) {
      // If the payment method is already attached or other error
      console.log("Payment method attachment error:", error.message);
      // We continue as the payment method might already be attached
    }
  }
  
  /**
   * Create a payment intent with payment method (original method)
   * @param {Number} amount - Amount in dollars
   * @param {String} customerId - Stripe customer ID
   * @param {String} paymentMethodId - Stripe payment method ID
   * @param {String} description - Payment description
   * @param {Object} metadata - Additional metadata
   * @returns {Object} Payment intent object
   */
  async createPaymentIntent(amount, customerId, paymentMethodId, description, metadata = {}) {
    const amountInCents = Math.round(amount * 100); // Convert to cents
    
    return await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: "nzd",
      customer: customerId,
      payment_method: paymentMethodId,
      description,
      metadata,
      setup_future_usage: 'off_session', // Allow future payments
    });
  }
  
  /**
   * Create a payment intent without payment method (for frontend collection)
   * @param {Number} amount - Amount in dollars
   * @param {String} customerId - Stripe customer ID
   * @param {String} description - Payment description
   * @param {Object} metadata - Additional metadata
   * @returns {Object} Payment intent object
   */
  async createSetupIntent(amount, customerId, description, metadata = {}) {
    const amountInCents = Math.round(amount * 100); // Convert to cents
    
    try {
      return await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: "nzd",
        customer: customerId,
        description,
        metadata,
        setup_future_usage: 'off_session', // Allow future payments
        // Enable automatic payment methods to handle card and other payment methods
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'always'
        },
        // No payment_method specified - will be collected on frontend
      });
    } catch (error) {
      console.error("Stripe payment intent creation error:", error.message);
      throw error; // Re-throw to handle in the route
    }
  }
  
  /**
   * Retrieve a payment intent
   * @param {String} paymentIntentId - Stripe payment intent ID
   * @returns {Object} Payment intent object
   */
  async retrievePaymentIntent(paymentIntentId) {
    try {
      return await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (error) {
      console.error(`Error retrieving payment intent ${paymentIntentId}:`, error.message);
      // If it's a resource_missing error, provide more helpful info
      if (error.code === 'resource_missing') {
        console.error('This could be due to: 1) Wrong environment (test/live), 2) Intent expired, or 3) Intent ID is incorrect');
      }
      throw error; // Re-throw to handle in the route
    }
  }
  
  /**
   * Verify webhook signature
   * @param {Object} payload - Request body
   * @param {String} signature - Stripe signature from headers
   * @returns {Object} Stripe event
   */
  verifyWebhookSignature(payload, signature) {
    return stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  }
}

export default new StripeService(); 
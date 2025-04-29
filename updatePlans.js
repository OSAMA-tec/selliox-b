import mongoose from "mongoose";
import dotenv from "dotenv";
import Plan from "./models/plan.model.js";

// Load environment variables
dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.DB_URL || 'mongodb://localhost:27017/marketplace')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Function to update all plans
async function updateAllPlans() {
  try {
    console.log('Starting plan updates...');
    
    // ============
    // Update Basic Plan
    // ============
    const basicPlanId = "678a558ecdc59296d3f0c53a";
    await Plan.findByIdAndUpdate(basicPlanId, {
      planType: "basic",
      planPrice: 10,
      features: [
        "Basic search visibility",
        "Upload up to 5 photos",
        "Manage one listing on your account", 
        "30-day subscription"
      ],
      rank: 1
    });
    console.log('Basic plan updated successfully');
    
    // ============
    // Update Premium Plan
    // ============
    const premiumPlanId = "678a558ecdc59296d3f0c538";
    await Plan.findByIdAndUpdate(premiumPlanId, {
      planType: "premium",
      planPrice: 20,
      features: [
        "Higher search ranking",
        "Upload up to 10 photos",
        "Manage up to 5 listings on your account",
        "Highlighted listing in search results",
        "30-day subscription"
      ],
      rank: 2
    });
    console.log('Premium plan updated successfully');
    
    // ============
    // Update Featured Plan
    // ============
    const featuredPlanId = "678a558ecdc59296d3f0c539";
    await Plan.findByIdAndUpdate(featuredPlanId, {
      planType: "featured",
      planPrice: 35,
      features: [
        "Top placement in search results",
        "Featured placement on homepage",
        "Upload up to 10 photos",
        "Manage up to 10 listings on your account",
        "30-day subscription"
      ],
      rank: 3
    });
    console.log('Featured plan updated successfully');
    
    // Verify and display updated plans
    const updatedPlans = await Plan.find().sort({ rank: 1 });
    console.log('All plans updated successfully:');
    console.log(JSON.stringify(updatedPlans, null, 2));
    
    // Close the MongoDB connection
    await mongoose.connection.close();
    console.log('Database connection closed');
  } catch (error) {
    console.error('Error updating plans:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run the function
updateAllPlans(); 
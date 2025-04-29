import express from "express";
import mongoose from "mongoose";
import Plan from "../models/plan.model.js";
import { isAuthenticated } from "../middleware/auth.js";

const router = express.Router();

router.post("/create",isAuthenticated,async(req,res)=>{
    const {planType,planPrice,features} = req.body;
    
    try{
        const plan = await Plan.create({
            planType:planType,
            planPrice:planPrice,
            features:features
        });
        const savedPlan = await plan.save();
        res.status(201).json(savedPlan);
    }catch(e){
        res.status(e.statusCode).json(e.message);
    }
});

router.get("/all",async(req,res)=>{
    try{
        const allPlans = await Plan.find();
        if(!allPlans){
            return res.status(404).json({message:"No Plans Found"});
        }
        res.status(200).json(allPlans);
    }catch(e){
        res.status(e.statusCode).json(e.message);
    }
});

router.get("/:planId",async(req,res)=>{
    const {planId} = req.params;
    if (!mongoose.Types.ObjectId.isValid(planId)) {
        return res.status(400).json({ message: 'Invalid product ID' });
    }
    try{
        const plan = await Plan.findById(planId);
        if(!plan){
            return res.status(404).json({message:"No Plan Found"});
        }
        res.status(200).json(plan);
    }catch(e){
        res.status(e.statusCode).json(e.message);
    }
});

// Route to update all plans to match the subscription UI
router.post("/update-all-plans", isAuthenticated, async (req, res) => {
    try {
        // First verify the user is an admin
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Only admin users can update plans"
            });
        }
        
        // ============
        // Update Basic/Standard Plan
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
        
        // ============
        // Verify updates and return updated plans
        // ============
        const updatedPlans = await Plan.find().sort({ rank: 1 });
        
        return res.status(200).json({
            success: true,
            message: "All plans have been updated successfully",
            plans: updatedPlans
        });
    } catch (error) {
        console.error("Error updating plans:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update plans",
            error: error.message
        });
    }
});

export default router;
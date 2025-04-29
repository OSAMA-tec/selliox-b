import path from "path";
import Listing from "../models/listing.js";
import User from "../models/user.js";
import Plan from "../models/plan.model.js";
import Credit from "../models/creditCard.js";
import PlanUser from "../models/planUser.model.js";
import ErrorHandler from "../utils/ErrorHandler.js";
import catchAsyncErrors from "../middleware/catchAsyncErrors.js";
import Stripe from "stripe";
import mongoose from "mongoose";
import dotenv from "dotenv";
import lodash from "lodash";
import Counter from "../models/counter.js";
import cloudinaryService from "../services/cloudinary.service.js";

dotenv.config();
const stripe = new Stripe(`${process.env.STRIPE_SECRET_KEY}`);

const create = async (req, res) => {
  try {
    // Get uploaded files from request
    const serviceImages = req.files && req.files["serviceImages"] && req.files["serviceImages"];
    const logo = req.files && req.files["logo"] && req.files["logo"].length > 0 && req.files["logo"][0];
    
    // Validate required files if needed
    if (!serviceImages || serviceImages.length === 0) {
      // Optional validation - commented out for now
      // return res.status(400).json({ message: "Please upload at least one image" });
    }
    if (!logo || logo.length === 0) {
      // Optional validation - commented out for now
      // return res.status(400).json({ message: "Please upload your business logo" });
    }

    // ============
    // Upload files to Cloudinary
    // ============
    let imageUrls = [];
    let logoUrl = null;

    // Upload service images to Cloudinary
    if (serviceImages && serviceImages.length > 0) {
      try {
        const imagePaths = serviceImages.map(file => file.path);
        const uploadedImages = await cloudinaryService.uploadMultipleFiles(imagePaths, { folder: 'listings/images' });
        imageUrls = uploadedImages.map(image => image.secure_url);
      } catch (error) {
        console.error('Error uploading service images:', error);
        return res.status(500).json({ 
          success: false, 
          message: "Error uploading service images to cloud storage" 
        });
      }
    }

    // Upload logo to Cloudinary
    if (logo) {
      try {
        const uploadedLogo = await cloudinaryService.uploadFile(logo.path, { folder: 'listings/logos' });
        logoUrl = uploadedLogo.secure_url;
      } catch (error) {
        console.error('Error uploading logo:', error);
        return res.status(500).json({ 
          success: false, 
          message: "Error uploading logo to cloud storage" 
        });
      }
    }

    let {
      businessTitle,
      businessEmailAddress,
      businessInfo,
      businessWebsite,
      serviceDescription,
      servicePlan,
      serviceTitle,
      serviceCategory,
      serviceSubCategory,
      services,
      location,
      paymentId,
      // Handle alternate field names that might be in the form
      title,
      description,
      category,
      selectedPlan,
      businessName,
      businessEmail,
      country,
      region,
      district,
      aboutBusiness,
      website,
    } = req.body;
    
    // Use alternate field values if primary fields are missing
    businessTitle = businessTitle || title || businessName || "";
    serviceTitle = serviceTitle || title || "";
    businessEmailAddress = businessEmailAddress || businessEmail || "";
    businessInfo = businessInfo || aboutBusiness || "";
    serviceDescription = serviceDescription || description || "";
    serviceCategory = serviceCategory || category || "";
    businessWebsite = businessWebsite || website || "";
    
    // Handle the case where servicePlan comes as an object (from frontend form)
    if (selectedPlan && typeof selectedPlan === 'object') {
      try {
        // Try to parse it if it's a string representation of an object
        if (typeof selectedPlan === 'string') {
          selectedPlan = JSON.parse(selectedPlan);
        }
        // Extract the ID from the plan object
        servicePlan = selectedPlan._id || selectedPlan.id || servicePlan;
      } catch (e) {
        console.error("Error parsing selectedPlan:", e);
      }
    }
    
    // Build location string from country, region, district if location is empty
    if (!location && (country || region || district)) {
      const locationParts = [country, region, district].filter(Boolean);
      location = locationParts.join(', ');
    }
    
    // Validate required fields
    if (!businessTitle || !serviceTitle || !servicePlan) {
      return res.status(400).json({ 
        success: false, 
        message: "Required fields missing: businessTitle, serviceTitle, and servicePlan are required" 
      });
    }
    
    // Validate location
    if (!location) {
      return res.status(400).json({
        success: false,
        message: "Location is required. Please provide either location or country/region/district information."
      });
    }

    // Handle services if it's a string instead of an array
    if (typeof services === 'string') {
      services = [services];
    } else if (!Array.isArray(services)) {
      services = [];
    }

    // Get the plan
    const plan = await Plan.findById(servicePlan);
    if (!plan) {
      return res.status(404).json({ 
        success: false, 
        message: "Plan not found" 
      });
    }

    // ============
    // Payment validation - Either using paymentId OR checking PlanUser
    // ============
    let paymentValidated = false;
    const userId = req.user._id;

    // Option 1: Check if user has an active subscription through PlanUser
    // Handle both no paymentId or the special value "using_existing_subscription"
    if (!paymentId || paymentId === "using_existing_subscription") {
      // Check if user has an active plan subscription
      const activePlanUser = await PlanUser.findOne({
        userId: userId,
        planId: servicePlan,
        isActive: true,
        endDate: { $gt: new Date() } // Make sure it hasn't expired
      });

      if (activePlanUser) {
        // Get the plan type
        const plan = await Plan.findById(servicePlan);
        const planType = plan.planType;
        
        // Reject basic plans for listings
        if (planType === "basic") {
          return res.status(400).json({ 
            success: false, 
            message: "Basic plans cannot be used to create listings. Please upgrade to Premium or Featured plan." 
          });
        }
        
        // Set max listings based on plan type
        let maxListings = 5; // Default for premium
        if (planType === "featured") {
          maxListings = 10;
        }
        
        // Verify user hasn't reached their listing limit
        if (activePlanUser.listingsUsed >= maxListings) {
          return res.status(400).json({ 
            success: false, 
            message: `You've reached the maximum of ${maxListings} listings allowed on your ${planType} plan. Please upgrade your plan to create more listings.` 
          });
        }
        
        paymentValidated = true;
        console.log(`Using existing plan subscription: ${activePlanUser._id}`);
      } else {
        return res.status(400).json({ 
          success: false, 
          message: "No active plan subscription found. Please subscribe to a plan first." 
        });
      }
    } 
    // Option 2: Using provided payment ID (old method)
    else {
      try {
        // Check if the paymentId is a Stripe payment ID (starts with 'pi_')
        if (paymentId.startsWith('pi_')) {
          // Directly use the Stripe payment ID
          try {
            // Retrieve the payment intent to check its status
            const paymentIntent = await stripe.paymentIntents.retrieve(paymentId);
            
            if (paymentIntent.status === "succeeded") {
              paymentValidated = true;
            } else {
              return res.status(400).json({ 
                success: false, 
                message: "Payment not completed", 
                status: paymentIntent.status 
              });
            }
          } catch (err) {
            console.log("Stripe payment retrieval error:", err);
            return res.status(400).json({ 
              success: false, 
              message: "Invalid Stripe payment ID or payment verification failed" 
            });
          }
        } else {
          // Try to find by MongoDB ID if it's not a Stripe payment ID
          try {
            const credit = await Credit.findById(paymentId);
            if (!credit) {
              return res.status(404).json({ 
                success: false, 
                message: "Payment method not found" 
              });
            }

            // Create payment intent with Stripe
            try {
              const paymentIntent = await stripe.paymentIntents.create({
                amount: plan.planPrice * 100,
                currency: "nzd",
                payment_method: credit.paymentId,
                customer: credit.customerId,
                confirm: true,
                automatic_payment_methods: {
                  enabled: true,
                  allow_redirects: "never",
                },
              });

              if (paymentIntent.status === "succeeded") {
                paymentValidated = true;
              } else {
                return res.status(400).json({ 
                  success: false, 
                  message: "Payment not completed", 
                  status: paymentIntent.status 
                });
              }
            } catch (err) {
              console.log("Payment error:", err);
              return res.status(400).json({ 
                success: false, 
                message: err.message 
              });
            }
          } catch (error) {
            // Handle case where paymentId isn't a valid ObjectId
            if (error.name === "CastError") {
              return res.status(400).json({ 
                success: false, 
                message: "Invalid payment ID format. Please provide a valid payment ID, a Stripe payment intent ID (pi_*), or use 'using_existing_subscription'." 
              });
            }
            throw error; // Rethrow unexpected errors
          }
        }
      } catch (error) {
        console.error("Payment validation error:", error);
        return res.status(500).json({ 
          success: false, 
          message: "An error occurred during payment validation" 
        });
      }
    }

    // ============
    // Create the listing
    // ============
    if (paymentValidated) {
      // Get the next available listing number
      let counter = await Counter.findOne({ name: "listingNumber" });
      if (!counter) {
        // Initialize counter if it doesn't exist
        counter = await Counter.create({ name: "listingNumber", value: 1000 });
      }
      
      // Increment counter
      const listingNumber = counter.value;
      counter.value += 1;
      await counter.save();

      const createdList = await Listing.create({
        listingNumber,
        businessTitle,
        businessEmailAddress,
        serviceTitle,
        businessInfo,
        serviceDescription,
        serviceCategory,
        serviceSubCategory,
        serviceImages: imageUrls,
        logo: logoUrl,
        services,
        plan: servicePlan,
        location,
        website: businessWebsite,
        sellerId: req.user?.id,
      });
      
      // If using a subscription, increment the listings used count
      if (!paymentId || paymentId === "using_existing_subscription") {
        // Find the active subscription and increment the listings used count
        const activePlanUser = await PlanUser.findOneAndUpdate(
          {
            userId: userId,
            planId: servicePlan,
            isActive: true
          },
          { $inc: { listingsUsed: 1 } },
          { new: true }
        );
        
        console.log(`Updated subscription usage. New count: ${activePlanUser.listingsUsed}`);
      }
      
      res.status(201).json({
        success: true,
        message: "Listing created successfully",
        createdList,
      });
    } else {
      return res.status(400).json({ 
        success: false, 
        message: "Payment validation failed" 
      });
    }
  } catch (e) {
    console.error("Listing creation error:", e);
    res.status(e.statusCode || 500).json({ 
      success: false,
      message: e.message || "An unexpected error occurred",
      error: e.toString()
    });
  }
};

/* const findAll = catchAsyncErrors(async (req, res, next) => {

  const page = parseInt(req.query.page) || 1;  // Default to page 1 if not provided
  const limit = parseInt(req.query.limit) || 10;
  try {
    const Listings = await Listing.find().populate("plan");
    const planOrder ={
      featured:1,
      premium:2,
      basic:3
    };

    const sortedListings = Listings.sort((a,b)=>{
      return planOrder[a.plan.planType] - planOrder[b.plan.planType];
    });

    // Paginate the sorted data
    const skip = (page - 1) * limit;
    const paginatedListings = sortedListings.slice(skip, skip + limit);
    // Get total count for pagination info
    const totalListings = sortedListings.length;
    res.status(200).json({
      success: true,
      totalListings,  // Total number of listings
      totalPages: Math.ceil(totalListings / limit),  // Total pages based on the limit
      currentPage: page,  // Current page number
      listings: paginatedListings  // Paginated listings for the current page
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
}); */

const findAll = catchAsyncErrors(async (req, res, next) => {
  try {
    // Get page number and limit from query parameters (defaults if not provided)
    const page = parseInt(req.query.page) || 1; // Default to page 1 if not provided
    const limit = parseInt(req.query.limit) || 10; // Default to 10 items per page if not provided
    const { category, title, subCategory, country, region, district, listingNumber } = req.query;

    const query = {};
    if (category) {
      query.serviceCategory = lodash.lowerCase(category);
    }
    if (country || region || district) {
      query.location = {
        $regex: `(${[country, region, district].filter(Boolean).join("|")})`,
        $options: "i",
      };
    }
    // Check if searching by listing number
    if (listingNumber) {
      query.listingNumber = parseInt(listingNumber);
    }
    // if (subCategory) {
    //   query.serviceSubCategory = lodash.lowerCase(subCategory);
    // }
    if (title) {
      // console.log(title)
      query.serviceTitle = {
        $regex: `^${lodash.lowerCase(title)}`,
        $options: "i",
      };
      // query.serviceCategory = lodash.lowerCase(title);
    }
    
    // MongoDB aggregation pipeline to sort and paginate the listings
    const listings = await Listing.aggregate([
      { $match: query }, // Apply all query filters in one step
      {
        $lookup: {
          from: "plans", // Replace with the actual collection name if needed
          localField: "plan", // Field to match from Listing
          foreignField: "_id", // Field to match from Plan
          as: "plan", // Alias for the populated field
        },
      },
      { $unwind: "$plan" }, // Unwind the plan array to flatten it
      {
        $lookup: {
          from: "reviews",
          localField: "reviews",
          foreignField: "_id",
          as: "reviews",
        },
      },
      { $unwind: { path: "$review", preserveNullAndEmptyArrays: true } },
      // Sort the listings by planType
      {
        $addFields: {
          planOrder: {
            $switch: {
              branches: [
                { case: { $eq: ["$plan.planType", "featured"] }, then: 1 },
                { case: { $eq: ["$plan.planType", "premium"] }, then: 2 },
                { case: { $eq: ["$plan.planType", "basic"] }, then: 3 },
              ],
              default: 4, // Default to 4 if not matched
            },
          },
        },
      },
      { $sort: { planOrder: 1 } }, // Sort by the computed planOrder

      {
        $facet: {
          totalCount: [{ $count: "count" }],
          data: [
            { $skip: (page - 1) * limit },
            { $limit: limit }
          ],
        }
      }

      // { $skip: (page - 1) * limit },
      // { $limit: limit },
    ]);

    // Get the total number of listings for pagination info
    const totalListings = listings[0].totalCount[0]?.count || 0;
    const listingData = listings[0].data;

    res.status(200).json({
      success: true,
      totalListings, // Total number of listings
      totalPages: Math.ceil(totalListings / limit), // Total pages based on the limit
      currentPage: page, // Current page number
      listings:listingData, // Paginated and sorted listings
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

const findUser = async (req, res) => {
  // Get page number and limit from query parameters (defaults if not provided)
  const page = parseInt(req.query.page) || 1; // Default to page 1 if not provided
  const limit = parseInt(req.query.limit) || 10; // Default to 10 items per page if not provided
  const skip = (page - 1) * limit;
  const { _id } = req.user;
  try {
    const userListings = await Listing.find({ sellerId: _id })
      .skip(skip)
      .limit(limit)
      .populate('sellerId');

    if (!userListings) {
      return res
        .status(404)
        .json({ message: "You Dont Have Any Listings Yet!" });
    }
    const totalListings = await Listing.countDocuments({ sellerId: _id });
    res.status(200).json({
      success: true,
      listings: userListings,
      totalListings,
      currentPage: page,
      totalPages: Math.ceil(totalListings / limit),
    });
  } catch (e) {
    return res
      .status(e.statusCode || 500)
      .json(e.message || "an  unexpected error occured");
  }
};

const find = catchAsyncErrors(async (req, res, next) => {
  const { listingId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(listingId)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid Listing ID" });
  }
  if (!listingId) {
    return res.status(400).json({
      success: false,
      message: "Listing ID is required.",
    });
  }
  const listing = await Listing.findById(listingId).populate("reviews sellerId");
  if (!listing) {
    return res.status(404).json({
      success: false,
      message: "Listing not found.",
    });
  }
  return res.status(200).json({
    success: true,
    listing: listing,
  });
});

const search = catchAsyncErrors(async (req, res, next) => {
  const {
    query,
    category,
    priceMin,
    priceMax,
    location,
    rating,
    instantBooking,
    page = 1,
    limit = 10,
  } = req.query;
  const filters = {};
  if (query) {
    filters.title = { $regex: query, $options: "i" };
  }
  if (category) {
    filters.category = category;
  }
  if (priceMin || priceMax) {
    filters["sellers.pricing.basePrice"] = {};
    if (priceMin)
      filters["sellers.pricing.basePrice"].$gte = parseFloat(priceMin);
    if (priceMax)
      filters["sellers.pricing.basePrice"].$lte = parseFloat(priceMax);
  }
  if (location) {
    filters.location = { $regex: location, $options: "i" };
  }
  if (rating) {
    filters["sellers.rating"] = { $gte: parseFloat(rating) };
  }
  if (instantBooking !== undefined) {
    filters["sellers.availability.instantBooking"] = instantBooking === "true";
  }
  const skip = (page - 1) * limit;
  const listings = await Listing.find(filters)
    .populate("category", "id name")
    .populate("subCategory", "id name")
    .lean()
    .skip(skip)
    .limit(parseInt(limit));
  if (!listings.length) {
    return res.status(404).json({
      success: false,
      message: "No listings found matching the search criteria.",
    });
  }
  const enrichedListings = await Promise.all(
    listings.map(async (listing) => {
      const sellers = await SellerOffer.find({ listingId: listing._id })
        .populate("sellerId", "name")
        .lean();
      const enrichedSellers = await Promise.all(
        sellers.map(async (seller) => {
          const reviews = await Review.find({
            sellerId: seller.sellerId,
          }).lean();
          const totalReviews = reviews.length;
          const averageRating =
            totalReviews > 0
              ? reviews.reduce((sum, review) => sum + review.rating, 0) /
                totalReviews
              : 0;
          return {
            id: seller.sellerId._id,
            name: seller.sellerId.name,
            rating: averageRating.toFixed(1),
            pricing: seller.pricing,
            availability: seller.availability,
            reviews: totalReviews,
          };
        })
      );
      return {
        ...listing,
        sellers: enrichedSellers,
      };
    })
  );
  return res.status(200).json({
    success: true,
    listings: enrichedListings,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: enrichedListings.length,
    },
  });
});

const addSaved = async (req, res) => {
  const { _id: userId } = req.user;
  const { listingId } = req.params;

  try {
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    // Check if the listing is already saved
    if (user.savedListings.includes(listingId)) {
      return res.status(400).json({ message: "Listing already saved." });
    }
    user.savedListings.push(listingId);
    await user.save();
    return res.status(200).json({ message: "Listing added to user" });
  } catch (e) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: e.message });
  }
};

const getSaved = async (req, res) => {
  const { _id: userId } = req.user;
  const { page = 1, limit = 10 } = req.query;

  try {
    const pageNumber = parseInt(page);
    const pageSize = parseInt(limit);
    const skip = (pageNumber - 1) * pageSize;

    const savedListings = await User.findById(userId)
      .populate({
        path: "savedListings",
        options: { skip, limit: pageSize },
      })
      .select("savedListings");

    if (!savedListings) {
      return res.status(404).json({ message: "User not found" });
    }
    // Count total saved listings for pagination metadata
    const totalListings = await User.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(userId) } },
      { $project: { totalSavedListings: { $size: "$savedListings" } } },
    ]);

    const total = totalListings[0]?.totalSavedListings || 0;
    res.status(200).json({
      totalListings: total,
      page: pageNumber,
      totalPages: Math.ceil(total / pageSize),
      listings: savedListings.savedListings,
    });
  } catch (e) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: e.message });
  }
};

const removeSaved = async (req, res) => {
  const { listingId } = req.params;
  const { _id: userId } = req.user;

  try {
    // Find the user and update the savedListings array
    const user = await User.findByIdAndUpdate(
      userId,
      { $pull: { savedListings: listingId } }, // Remove the listingId from the array
      { new: true } // Return the updated document
    );

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json({
      message: "Listing removed successfully.",
      savedListings: user.savedListings,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal server error.", error: error.message });
  }
};

const checkSaved = async (req, res) => {
  const { listingId } = req.params;
  const { _id: userId } = req.user;

  try {
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if the listing ID exists in the user's savedListings array
    const isSaved = user.savedListings.includes(listingId);

    return res.status(200).json({ isSaved });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const updateListing = async (req, res) => {
  const { listingId } = req.params;
  const { _id: userId } = req.user;
  const updatedData = req.body;

  try {
    // Check if the listing exists and belongs to the user
    const listing = await Listing.findOne({ _id: listingId, sellerId: userId });
    
    if (!listing) {
      return res.status(404).json({ 
        success: false,
        message: "Listing not found or you don't have permission to edit it" 
      });
    }

    // Handle file uploads if present
    if (req.files) {
      // Handle service images upload to Cloudinary
      if (req.files.serviceImages && req.files.serviceImages.length > 0) {
        try {
          const imagePaths = req.files.serviceImages.map(file => file.path);
          const uploadedImages = await cloudinaryService.uploadMultipleFiles(imagePaths, { folder: 'listings/images' });
          updatedData.serviceImages = uploadedImages.map(image => image.secure_url);
        } catch (error) {
          console.error('Error uploading service images:', error);
          return res.status(500).json({ 
            success: false, 
            message: "Error uploading service images to cloud storage" 
          });
        }
      }
      
      // Handle logo upload to Cloudinary
      if (req.files.logo && req.files.logo.length > 0) {
        try {
          const uploadedLogo = await cloudinaryService.uploadFile(req.files.logo[0].path, { folder: 'listings/logos' });
          updatedData.logo = uploadedLogo.secure_url;
        } catch (error) {
          console.error('Error uploading logo:', error);
          return res.status(500).json({ 
            success: false, 
            message: "Error uploading logo to cloud storage" 
          });
        }
      }
    }

    // Update the listing
    const updatedListing = await Listing.findByIdAndUpdate(
      listingId, 
      updatedData,
      { new: true, runValidators: true }
    ).populate('plan');

    return res.status(200).json({
      success: true,
      message: "Listing updated successfully",
      listing: updatedListing
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false,
      message: "Failed to update listing", 
      error: error.message 
    });
  }
};

const updateListingPlan = async (req, res) => {
  const { listingId } = req.params;
  const { _id: userId } = req.user;
  const { planId, paymentId } = req.body;

  try {
    // Check if the listing exists and belongs to the user
    const listing = await Listing.findOne({ _id: listingId, sellerId: userId });
    
    if (!listing) {
      return res.status(404).json({ 
        success: false,
        message: "Listing not found or you don't have permission to edit it" 
      });
    }

    // Get the new plan
    const newPlan = await Plan.findById(planId);
    if (!newPlan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found"
      });
    }

    // Get payment details
    const credit = await Credit.findById(paymentId);
    if (!credit) {
      return res.status(404).json({
        success: false,
        message: "Payment method not found"
      });
    }

    // Process payment
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: newPlan.planPrice * 100,
        currency: "nzd",
        payment_method: credit.paymentId,
        customer: credit.customerId,
        confirm: true,
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: "never",
        },
      });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }

    if (!paymentIntent || paymentIntent.status !== "succeeded") {
      return res.status(400).json({ 
        success: false, 
        message: "Payment not completed" 
      });
    }

    // Update the listing with the new plan and reset subscription end date
    const updatedListing = await Listing.findByIdAndUpdate(
      listingId,
      { 
        plan: planId,
        status: "active",
        subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
      },
      { new: true, runValidators: true }
    ).populate('plan');

    return res.status(200).json({
      success: true,
      message: "Plan updated successfully",
      listing: updatedListing
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false,
      message: "Failed to update plan", 
      error: error.message 
    });
  }
};

const deactivateListing = async (req, res) => {
  const { listingId } = req.params;
  const { _id: userId } = req.user;

  try {
    // Check if the listing exists and belongs to the user
    const listing = await Listing.findOne({ _id: listingId, sellerId: userId });
    
    if (!listing) {
      return res.status(404).json({ 
        success: false,
        message: "Listing not found or you don't have permission to edit it" 
      });
    }

    // Update the listing status to inactive
    const updatedListing = await Listing.findByIdAndUpdate(
      listingId,
      { status: "inactive" },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: "Listing deactivated successfully",
      listing: updatedListing
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false,
      message: "Failed to deactivate listing", 
      error: error.message 
    });
  }
};

const reactivateListing = async (req, res) => {
  const { listingId } = req.params;
  const { _id: userId } = req.user;
  const { planId, paymentId } = req.body;

  try {
    // Check if the listing exists and belongs to the user
    const listing = await Listing.findOne({ _id: listingId, sellerId: userId });
    
    if (!listing) {
      return res.status(404).json({ 
        success: false,
        message: "Listing not found or you don't have permission to edit it" 
      });
    }

    // Get the plan
    const plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found"
      });
    }

    // Get payment details
    const credit = await Credit.findById(paymentId);
    if (!credit) {
      return res.status(404).json({
        success: false,
        message: "Payment method not found"
      });
    }

    // Process payment
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: plan.planPrice * 100,
        currency: "nzd",
        payment_method: credit.paymentId,
        customer: credit.customerId,
        confirm: true,
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: "never",
        },
      });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }

    if (!paymentIntent || paymentIntent.status !== "succeeded") {
      return res.status(400).json({ 
        success: false, 
        message: "Payment not completed" 
      });
    }

    // Update the listing
    const updatedListing = await Listing.findByIdAndUpdate(
      listingId,
      { 
        plan: planId,
        status: "active",
        subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
      },
      { new: true, runValidators: true }
    ).populate('plan');

    return res.status(200).json({
      success: true,
      message: "Listing reactivated successfully",
      listing: updatedListing
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false,
      message: "Failed to reactivate listing", 
      error: error.message 
    });
  }
};

export default {
  create,
  find,
  findAll,
  search,
  findUser,
  addSaved,
  getSaved,
  removeSaved,
  checkSaved,
  updateListing,
  updateListingPlan,
  deactivateListing,
  reactivateListing
};

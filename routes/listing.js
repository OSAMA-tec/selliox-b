import { Router } from "express";
import ListingController from "../controller/listing.js";
import { isAuthenticated } from "../middleware/auth.js";
import { upload, validateFileUpload } from "../middleware/multer.js";

const router = Router();

// Multer configuration for file upload
const serviceImagesUpload = upload.fields([
  { name: "serviceImages", maxCount: 5 },
  { name: "logo", maxCount: 1 },
]);

// Private endpoints
router.post(
  "/create",
  isAuthenticated,
  serviceImagesUpload,
  validateFileUpload,
  ListingController.create
);
router.get("/mylistings", isAuthenticated, ListingController.findUser);
router.get("/saved/find", isAuthenticated, ListingController.getSaved);
router.post("/saved/:listingId", isAuthenticated, ListingController.addSaved);
router.get("/saved/check/:listingId", isAuthenticated, ListingController.checkSaved);
router.delete("/saved/:listingId", isAuthenticated, ListingController.removeSaved);

// New endpoints for listing management
router.put(
  "/:listingId",
  isAuthenticated,
  serviceImagesUpload,
  validateFileUpload,
  ListingController.updateListing
);
router.put(
  "/:listingId/plan",
  isAuthenticated,
  ListingController.updateListingPlan
);
router.put(
  "/:listingId/deactivate",
  isAuthenticated,
  ListingController.deactivateListing
);
router.put(
  "/:listingId/reactivate",
  isAuthenticated,
  ListingController.reactivateListing
);

// Public endpoints
router.get("/all", ListingController.findAll);
router.get("/find/:listingId", ListingController.find);
router.get("/search", ListingController.search);

export default router;

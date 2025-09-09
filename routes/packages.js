const express = require('express');
const PackageController = require('../controllers/packageController');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Get all available packages (public)
router.get('/', PackageController.getPackages);

// Get user's packages and credits (requires auth)
router.get('/my-packages', auth, PackageController.getUserPackages);

// Check user's credits (requires auth)
router.get('/credits/check', auth, PackageController.checkCredits);

// Create payment intent for package purchase (requires auth)
router.post('/purchase/intent', auth, PackageController.createPaymentIntent);

// Confirm package purchase after payment (requires auth)
router.post('/purchase/confirm', auth, PackageController.confirmPurchase);

// Use credits for job posting (requires auth)
router.post('/credits/use', auth, PackageController.useCredits);

// Get usage analytics (admin only)
router.get('/analytics', auth, PackageController.getUsageAnalytics);

// Discount validation and application
router.post('/validate-discount', auth, PackageController.validateDiscount);
router.get('/my-discounts', auth, PackageController.getUserDiscounts);

module.exports = router;
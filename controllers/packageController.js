const { body, validationResult } = require('express-validator');
// MongoDB connection handled through models
const stripe = require('../config/stripe');
const ManagerProfile = require('../models/ManagerProfile');
const PaymentPackage = require('../models/PaymentPackage');
const User = require('../models/User');

class PackageController {
  // Get all available packages
  static async getPackages(req, res) {
    try {
      const packages = await PaymentPackage.find({
        'availability.is_active': true
      }).sort({ 'pricing.base_price': 1 });

      // Transform packages to match the frontend interface
      const transformedPackages = packages.map(pkg => {
        // Extract credits from features
        const jobPostsFeature = pkg.features.find(f => f.feature_key === 'job_posts');
        const featuredFeature = pkg.features.find(f => f.feature_key === 'featured_listings');

        return {
          id: pkg._id,
          name: pkg.name,
          description: pkg.description,
          price: pkg.pricing.base_price / 100, // Convert from cents to dollars
          post_credits: jobPostsFeature ? jobPostsFeature.feature_value : 0,
          featured_credits: featuredFeature ? featuredFeature.feature_value : 0,
          duration_days: 30, // Default duration
          features: pkg.features.map(f => f.feature_description),
          is_popular: pkg.tags && pkg.tags.includes('popular'),
          is_active: pkg.availability.is_active,
          currency: pkg.pricing.currency,
          billing_cycle: pkg.pricing.billing_cycle
        };
      });

      res.json({
        success: true,
        packages: transformedPackages
      });
    } catch (error) {
      console.error('Get packages error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Get user's purchased packages
  static async getUserPackages(req, res) {
    try {
      res.json({
        success: true,
        packages: [],
        summary: {
          total_credits: 0,
          used_credits: 0,
          remaining_credits: 0
        },
        message: "Package system is not yet implemented with MongoDB"
      });
    } catch (error) {
      console.error('Get user packages error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Create payment intent for package purchase
  static async createPaymentIntent(req, res) {
    try {
      res.status(501).json({ 
        error: 'Package purchase not implemented',
        message: "Package system is not yet implemented with MongoDB"
      });
    } catch (error) {
      console.error('Create payment intent error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Confirm package purchase
  static async confirmPurchase(req, res) {
    try {
      res.status(501).json({ 
        error: 'Package purchase confirmation not implemented',
        message: "Package system is not yet implemented with MongoDB"
      });
    } catch (error) {
      console.error('Confirm purchase error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Check user's available credits
  static async checkCredits(req, res) {
    try {
      res.json({
        success: true,
        credits: {
          total: 0,
          used: 0,
          remaining: 0
        },
        message: "Credit system is not yet implemented with MongoDB"
      });
    } catch (error) {
      console.error('Check credits error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Use credits for a service
  static async useCredits(req, res) {
    try {
      res.status(501).json({ 
        error: 'Credit usage not implemented',
        message: "Credit system is not yet implemented with MongoDB"
      });
    } catch (error) {
      console.error('Use credits error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Get usage analytics
  static async getUsageAnalytics(req, res) {
    try {
      res.json({
        success: true,
        analytics: {
          sales_stats: [],
          usage_stats: [],
          top_users: []
        },
        message: "Analytics system is not yet implemented with MongoDB"
      });
    } catch (error) {
      console.error('Get usage analytics error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Validate discount code
  static async validateDiscount(req, res) {
    try {
      res.json({
        success: false,
        valid: false,
        message: "Discount system is not yet implemented with MongoDB"
      });
    } catch (error) {
      console.error('Validate discount error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Get user's assigned discounts
  static async getUserDiscounts(req, res) {
    try {
      res.json({
        assigned_discounts: [],
        available_discounts: [],
        message: "Discount system is not yet implemented with MongoDB"
      });
    } catch (error) {
      console.error('Get user discounts error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

module.exports = PackageController;
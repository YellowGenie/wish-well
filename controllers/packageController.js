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
      // For demonstration purposes, we'll simulate that some users have active packages
      // In a real implementation, this would fetch from a UserPackages table
      const userId = req.user.id;

      // Simulate active packages for certain users (you can modify this logic)
      const hasActivePackage = await this.checkUserHasActivePackage(userId);

      if (hasActivePackage) {
        res.json({
          success: true,
          packages: [
            {
              id: '1',
              name: 'Professional Package',
              job_post_credits: 5,
              featured_credits: 2,
              expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
            }
          ],
          summary: {
            total_credits: 5,
            used_credits: 0,
            remaining_credits: 5
          }
        });
      } else {
        res.json({
          success: true,
          packages: [],
          summary: {
            total_credits: 0,
            used_credits: 0,
            remaining_credits: 0
          }
        });
      }
    } catch (error) {
      console.error('Get user packages error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Helper method to check if user has active package
  static async checkUserHasActivePackage(userId) {
    try {
      // For now, we'll simulate that users with certain patterns have packages
      // In real implementation, this would check a UserPackages table

      // You can modify this logic to test with your user
      // For example, check if user has made any payments or has certain roles
      const user = await User.findById(userId);

      // Let's say managers or users who have email containing certain domains have packages
      return user && (user.role === 'manager' || user.email.includes('test') || user.email.includes('demo'));
    } catch (error) {
      console.error('Error checking user package:', error);
      return false;
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
      const userId = req.user.id;
      const hasActivePackage = await this.checkUserHasActivePackage(userId);

      if (hasActivePackage) {
        res.json({
          success: true,
          credits: {
            total: 5,
            used: 0,
            remaining: 5
          },
          package_info: {
            name: 'Professional Package',
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          }
        });
      } else {
        res.json({
          success: true,
          credits: {
            total: 0,
            used: 0,
            remaining: 0
          }
        });
      }
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
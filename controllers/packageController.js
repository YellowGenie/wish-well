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
      const userId = req.user.id;

      // Check for actual package purchases
      const Payment = require('../models/Payment');
      const PaymentPackage = require('../models/PaymentPackage');

      const packagePurchases = await Payment.find({
        user_id: userId,
        payment_type: 'package_purchase',
        status: 'completed'
      }).populate('package_id');

      if (packagePurchases && packagePurchases.length > 0) {
        // Return actual purchased packages
        const packages = packagePurchases.map(purchase => {
          const pkg = purchase.package_id;
          return {
            id: purchase._id,
            name: pkg ? pkg.name : 'Unknown Package',
            job_post_credits: 5, // Default credits for now
            featured_credits: 2,
            amount_paid: purchase.amount / 100, // Convert from cents to dollars
            purchase_date: purchase.created_at,
            expires_at: new Date(purchase.created_at.getTime() + 30 * 24 * 60 * 60 * 1000) // 30 days from purchase
          };
        });

        res.json({
          success: true,
          packages,
          summary: {
            total_credits: packages.length * 5, // 5 credits per package
            used_credits: 0,
            remaining_credits: packages.length * 5
          }
        });
      } else {
        // Check fallback logic for simulation
        const hasActivePackage = await this.checkUserHasActivePackage(userId);

        if (hasActivePackage) {
          res.json({
            success: true,
            packages: [
              {
                id: 'simulated-1',
                name: 'Professional Package',
                job_post_credits: 5,
                featured_credits: 2,
                expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
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
      }
    } catch (error) {
      console.error('Get user packages error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Helper method to check if user has active package
  static async checkUserHasActivePackage(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return false;
      }

      // Check for completed package purchases
      const Payment = require('../models/Payment');
      const completedPackagePurchases = await Payment.find({
        user_id: userId,
        payment_type: 'package_purchase',
        status: 'completed'
      });

      // If user has any completed package purchases, they have an active package
      if (completedPackagePurchases && completedPackagePurchases.length > 0) {
        return true;
      }

      // Fallback: check role or email patterns for simulation
      return user.role === 'manager' || user.email.includes('test') || user.email.includes('demo');
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

      // Check for actual package purchases
      const Payment = require('../models/Payment');
      const packagePurchases = await Payment.find({
        user_id: userId,
        payment_type: 'package_purchase',
        status: 'completed'
      }).populate('package_id');

      if (packagePurchases && packagePurchases.length > 0) {
        const totalCredits = packagePurchases.length * 5; // 5 credits per package
        const latestPackage = packagePurchases[packagePurchases.length - 1];

        res.json({
          success: true,
          credits: {
            total: totalCredits,
            used: 0,
            remaining: totalCredits
          },
          package_info: {
            name: latestPackage.package_id ? latestPackage.package_id.name : 'Purchased Package',
            amount_paid: latestPackage.amount / 100,
            expires_at: new Date(latestPackage.created_at.getTime() + 30 * 24 * 60 * 60 * 1000)
          }
        });
      } else {
        // Fallback to simulation logic
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
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const stripe = require('../config/stripe');
const ManagerProfile = require('../models/ManagerProfile');

class PackageController {
  // Get all available packages
  static async getPackages(req, res) {
    try {
      const [packages] = await pool.execute(`
        SELECT 
          pp.*,
          COUNT(up.id) as total_purchases,
          AVG(CASE WHEN up.status = 'active' THEN 1 ELSE 0 END) * 100 as adoption_rate
        FROM pricing_packages pp
        LEFT JOIN user_packages up ON pp.id = up.package_id
        WHERE pp.is_active = 1
        GROUP BY pp.id
        ORDER BY pp.price ASC
      `);

      // Parse features JSON for each package
      const formattedPackages = packages.map(pkg => ({
        ...pkg,
        features: Array.isArray(pkg.features) ? pkg.features : (pkg.features ? [pkg.features] : []),
        total_purchases: parseInt(pkg.total_purchases) || 0,
        adoption_rate: parseFloat(pkg.adoption_rate) || 0
      }));

      res.json({ packages: formattedPackages });
    } catch (error) {
      console.error('Get packages error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Get user's current packages and credits
  static async getUserPackages(req, res) {
    try {
      const [userPackages] = await pool.execute(`
        SELECT 
          up.*,
          pp.name as package_name,
          pp.description,
          pp.price,
          pp.post_credits as original_credits,
          pp.featured_credits as original_featured_credits,
          pp.duration_days,
          pp.features
        FROM user_packages up
        JOIN pricing_packages pp ON up.package_id = pp.id
        WHERE up.user_id = ? AND up.status = 'active' AND (up.expires_at IS NULL OR up.expires_at > NOW())
        ORDER BY up.purchased_at DESC
      `, [req.user.id]);

      // Get total available credits
      const [creditSummary] = await pool.execute(`
        SELECT 
          COALESCE(SUM(credits_remaining), 0) as total_credits,
          COALESCE(SUM(featured_credits_remaining), 0) as total_featured_credits
        FROM user_packages 
        WHERE user_id = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
      `, [req.user.id]);

      const formattedPackages = userPackages.map(pkg => ({
        ...pkg,
        features: pkg.features ? pkg.features.split(',').map(f => f.trim()) : []
      }));

      res.json({
        packages: formattedPackages,
        credits_summary: creditSummary[0]
      });
    } catch (error) {
      console.error('Get user packages error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Create Stripe payment intent for package purchase
  static async createPaymentIntent(req, res) {
    try {
      const { package_id, discount_code } = req.body;

      // Get package details
      const [packages] = await pool.execute(
        'SELECT * FROM pricing_packages WHERE id = ? AND is_active = 1',
        [package_id]
      );

      if (packages.length === 0) {
        return res.status(404).json({ error: 'Package not found' });
      }

      const packageData = packages[0];
      let originalPrice = parseFloat(packageData.price);
      let finalPrice = originalPrice;
      let discountApplied = null;
      let discountId = null;
      let additionalCredits = { post_credits: 0, featured_credits: 0 };

      // Handle discount code if provided
      if (discount_code) {
        // Validate discount internally (reuse validation logic)
        const [discounts] = await pool.execute(`
          SELECT d.*, 
                 COUNT(dul.id) as actual_usage_count,
                 CASE 
                   WHEN d.archived_at IS NOT NULL THEN 'archived'
                   WHEN d.status = 'suspended' THEN 'suspended'
                   WHEN d.status = 'expired' OR (d.expires_at IS NOT NULL AND d.expires_at < NOW()) THEN 'expired'
                   WHEN d.max_uses IS NOT NULL AND d.usage_count >= d.max_uses THEN 'exhausted'
                   WHEN d.is_active = 0 THEN 'disabled'
                   ELSE d.status
                 END as computed_status
          FROM discounts d
          LEFT JOIN discount_usage_log dul ON d.id = dul.discount_id
          WHERE d.code = ?
          GROUP BY d.id
        `, [discount_code.toUpperCase()]);

        if (discounts.length === 0) {
          return res.status(400).json({ error: 'Invalid discount code' });
        }

        const discount = discounts[0];

        // Validate discount status
        if (discount.computed_status !== 'valid' && discount.computed_status !== 'gift') {
          return res.status(400).json({ 
            error: `Discount code is ${discount.computed_status}` 
          });
        }

        // Check if user already used this discount
        const [userUsage] = await pool.execute(`
          SELECT id FROM discount_usage_log 
          WHERE discount_id = ? AND user_id = ?
        `, [discount.id, req.user.id]);

        if (userUsage.length > 0) {
          return res.status(400).json({ 
            error: 'You have already used this discount code' 
          });
        }

        // Check package applicability
        const applicableTo = Array.isArray(discount.applicable_to) 
          ? discount.applicable_to 
          : JSON.parse(discount.applicable_to || '["all"]');

        if (!applicableTo.includes('all') && !applicableTo.includes(packageData.name)) {
          return res.status(400).json({
            error: 'This discount code is not applicable to the selected package'
          });
        }

        // Check minimum purchase amount
        if (discount.min_purchase_amount && originalPrice < discount.min_purchase_amount) {
          return res.status(400).json({
            error: `Minimum purchase amount of $${discount.min_purchase_amount} required for this discount`
          });
        }

        // Apply discount
        discountId = discount.id;
        discountApplied = {
          id: discount.id,
          code: discount.code,
          name: discount.name,
          type: discount.type,
          value: discount.value
        };

        if (discount.type === 'percentage') {
          const discountAmount = originalPrice * (discount.value / 100);
          finalPrice = Math.max(0, originalPrice - discountAmount);
          discountApplied.discount_amount = discountAmount;
        } else if (discount.type === 'fixed_amount') {
          const discountAmount = Math.min(discount.value, originalPrice);
          finalPrice = Math.max(0, originalPrice - discountAmount);
          discountApplied.discount_amount = discountAmount;
        } else if (discount.type === 'free_posts') {
          // For free posts, keep original price but add bonus credits
          additionalCredits.post_credits = discount.value;
          discountApplied.bonus_credits = discount.value;
        }
      }

      const amount = Math.round(finalPrice * 100); // Convert to cents

      // Create payment intent (or handle free discount)
      let paymentIntent = null;
      let clientSecret = null;

      if (amount > 0) {
        paymentIntent = await stripe.paymentIntents.create({
          amount,
          currency: 'usd',
          automatic_payment_methods: {
            enabled: true,
          },
          metadata: {
            user_id: req.user.id,
            package_id: package_id,
            package_name: packageData.name,
            post_credits: packageData.post_credits,
            featured_credits: packageData.featured_credits,
            discount_id: discountId || '',
            discount_code: discount_code || '',
            original_price: originalPrice.toString(),
            final_price: finalPrice.toString(),
            additional_post_credits: additionalCredits.post_credits.toString(),
            additional_featured_credits: additionalCredits.featured_credits.toString()
          }
        });
        clientSecret = paymentIntent.client_secret;
      }

      res.json({
        client_secret: clientSecret,
        requires_payment: amount > 0,
        package_details: {
          id: packageData.id,
          name: packageData.name,
          description: packageData.description,
          original_price: originalPrice,
          final_price: finalPrice,
          post_credits: packageData.post_credits + additionalCredits.post_credits,
          featured_credits: packageData.featured_credits + additionalCredits.featured_credits,
          duration_days: packageData.duration_days,
          features: Array.isArray(packageData.features) ? packageData.features : (packageData.features ? [packageData.features] : [])
        },
        discount_applied: discountApplied,
        payment_intent_id: paymentIntent?.id || null
      });
    } catch (error) {
      console.error('Create payment intent error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Confirm package purchase after payment
  static async confirmPurchase(req, res) {
    try {
      const { payment_intent_id } = req.body;

      if (!payment_intent_id) {
        return res.status(400).json({ error: 'Payment intent ID required' });
      }

      // Verify payment with Stripe
      const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);

      if (paymentIntent.status !== 'succeeded') {
        return res.status(400).json({ error: 'Payment not completed' });
      }

      const { 
        user_id, package_id, post_credits, featured_credits, 
        discount_id, discount_code, original_price, final_price,
        additional_post_credits, additional_featured_credits
      } = paymentIntent.metadata;

      if (parseInt(user_id) !== req.user.id) {
        return res.status(403).json({ error: 'Payment belongs to different user' });
      }

      // Check if package already purchased with this payment intent
      const [existing] = await pool.execute(
        'SELECT id FROM user_packages WHERE stripe_payment_intent_id = ?',
        [payment_intent_id]
      );

      if (existing.length > 0) {
        return res.status(400).json({ error: 'Package already purchased with this payment' });
      }

      // Get package details
      const [packages] = await pool.execute(
        'SELECT * FROM pricing_packages WHERE id = ?',
        [package_id]
      );

      const packageData = packages[0];
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + packageData.duration_days);

      // Calculate total credits (base package + discount bonus)
      const totalPostCredits = packageData.post_credits + (parseInt(additional_post_credits) || 0);
      const totalFeaturedCredits = packageData.featured_credits + (parseInt(additional_featured_credits) || 0);

      // Create user package record
      const [result] = await pool.execute(`
        INSERT INTO user_packages (
          user_id, package_id, status, credits_remaining, featured_credits_remaining,
          expires_at, stripe_payment_intent_id
        ) VALUES (?, ?, 'active', ?, ?, ?, ?)
      `, [
        req.user.id,
        package_id,
        totalPostCredits,
        totalFeaturedCredits,
        expiresAt,
        payment_intent_id
      ]);

      // Log discount usage if a discount was applied
      if (discount_id && discount_code) {
        try {
          // Log the discount usage
          await pool.execute(`
            INSERT INTO discount_usage_log (
              discount_id, user_id, package_id, original_price, final_price, 
              savings_amount, additional_credits_granted, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
          `, [
            discount_id,
            req.user.id,
            package_id,
            parseFloat(original_price),
            parseFloat(final_price),
            parseFloat(original_price) - parseFloat(final_price),
            JSON.stringify({
              post_credits: parseInt(additional_post_credits) || 0,
              featured_credits: parseInt(additional_featured_credits) || 0
            })
          ]);

          // Update discount usage count
          await pool.execute(`
            UPDATE discounts 
            SET current_usage = current_usage + 1,
                last_used_at = NOW()
            WHERE id = ?
          `, [discount_id]);

          console.log(`Discount ${discount_code} usage logged for user ${req.user.id}`);
        } catch (discountError) {
          console.error('Error logging discount usage:', discountError);
          // Don't fail the purchase if discount logging fails
        }
      }

      res.json({
        message: 'Package purchased successfully',
        user_package_id: result.insertId,
        package_name: packageData.name,
        credits_added: {
          post_credits: totalPostCredits,
          featured_credits: totalFeaturedCredits
        },
        discount_applied: discount_code ? {
          code: discount_code,
          original_price: parseFloat(original_price),
          final_price: parseFloat(final_price),
          savings: parseFloat(original_price) - parseFloat(final_price),
          bonus_credits: {
            post_credits: parseInt(additional_post_credits) || 0,
            featured_credits: parseInt(additional_featured_credits) || 0
          }
        } : null,
        expires_at: expiresAt
      });
    } catch (error) {
      console.error('Confirm purchase error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Check if user has enough credits to post a job
  static async checkCredits(req, res) {
    try {
      const { is_featured = false } = req.query;

      const [credits] = await pool.execute(`
        SELECT 
          COALESCE(SUM(credits_remaining), 0) as total_credits,
          COALESCE(SUM(featured_credits_remaining), 0) as total_featured_credits
        FROM user_packages 
        WHERE user_id = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
      `, [req.user.id]);

      const hasCredits = credits[0].total_credits > 0;
      const hasFeaturedCredits = credits[0].total_featured_credits > 0;

      const canPost = is_featured === 'true' 
        ? hasCredits && hasFeaturedCredits
        : hasCredits;

      res.json({
        can_post: canPost,
        credits: credits[0],
        required_credits: {
          regular: 1,
          featured: is_featured === 'true' ? 1 : 0
        }
      });
    } catch (error) {
      console.error('Check credits error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Use credits when posting a job
  static async useCredits(req, res) {
    try {
      const { job_id, is_featured = false } = req.body;

      // Start transaction
      const connection = await pool.getConnection();
      await connection.beginTransaction();

      try {
        // Get user's active packages with available credits
        const [packages] = await connection.execute(`
          SELECT id, credits_remaining, featured_credits_remaining
          FROM user_packages 
          WHERE user_id = ? AND status = 'active' 
            AND (expires_at IS NULL OR expires_at > NOW())
            AND credits_remaining > 0
          ORDER BY expires_at ASC, purchased_at ASC
          LIMIT 1
        `, [req.user.id]);

        if (packages.length === 0) {
          await connection.rollback();
          connection.release();
          return res.status(400).json({ error: 'No credits available' });
        }

        const userPackage = packages[0];

        // Check if featured post is requested but no featured credits available
        if (is_featured && userPackage.featured_credits_remaining <= 0) {
          await connection.rollback();
          connection.release();
          return res.status(400).json({ error: 'No featured credits available' });
        }

        // Deduct credits
        const newCredits = userPackage.credits_remaining - 1;
        const newFeaturedCredits = is_featured 
          ? userPackage.featured_credits_remaining - 1 
          : userPackage.featured_credits_remaining;

        await connection.execute(`
          UPDATE user_packages 
          SET credits_remaining = ?, featured_credits_remaining = ?
          WHERE id = ?
        `, [newCredits, newFeaturedCredits, userPackage.id]);

        // Record usage
        await connection.execute(`
          INSERT INTO package_usage (user_package_id, job_id, usage_type)
          VALUES (?, ?, ?)
        `, [userPackage.id, job_id, is_featured ? 'featured_post' : 'regular_post']);

        if (is_featured) {
          // Record featured credit usage too
          await connection.execute(`
            INSERT INTO package_usage (user_package_id, job_id, usage_type)
            VALUES (?, ?, ?)
          `, [userPackage.id, job_id, 'featured_post']);
        }

        await connection.commit();
        connection.release();

        res.json({
          message: 'Credits used successfully',
          credits_used: {
            regular: 1,
            featured: is_featured ? 1 : 0
          },
          remaining_credits: {
            regular: newCredits,
            featured: newFeaturedCredits
          }
        });
      } catch (error) {
        await connection.rollback();
        connection.release();
        throw error;
      }
    } catch (error) {
      console.error('Use credits error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Get package usage analytics for admin
  static async getUsageAnalytics(req, res) {
    try {
      // Package sales summary
      const [salesStats] = await pool.execute(`
        SELECT 
          pp.name,
          pp.price,
          COUNT(up.id) as total_sold,
          SUM(pp.price) as total_revenue,
          COUNT(CASE WHEN up.status = 'active' THEN 1 END) as active_packages,
          AVG(up.credits_remaining) as avg_remaining_credits,
          AVG(up.featured_credits_remaining) as avg_remaining_featured
        FROM pricing_packages pp
        LEFT JOIN user_packages up ON pp.id = up.package_id
        GROUP BY pp.id
        ORDER BY total_sold DESC
      `);

      // Usage trends
      const [usageStats] = await pool.execute(`
        SELECT 
          DATE(pu.used_at) as usage_date,
          pu.usage_type,
          COUNT(*) as usage_count
        FROM package_usage pu
        WHERE pu.used_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY DATE(pu.used_at), pu.usage_type
        ORDER BY usage_date DESC
      `);

      // Top users by package purchases
      const [topUsers] = await pool.execute(`
        SELECT 
          u.id,
          u.first_name,
          u.last_name,
          u.email,
          COUNT(up.id) as packages_purchased,
          SUM(pp.price) as total_spent,
          SUM(up.credits_remaining + up.featured_credits_remaining) as unused_credits
        FROM users u
        JOIN user_packages up ON u.id = up.user_id
        JOIN pricing_packages pp ON up.package_id = pp.id
        GROUP BY u.id
        ORDER BY total_spent DESC
        LIMIT 10
      `);

      res.json({
        sales_stats: salesStats,
        usage_trends: usageStats,
        top_users: topUsers,
        generated_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Get usage analytics error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Discount validation and application
  static async validateDiscount(req, res) {
    try {
      const { code, package_id } = req.body;
      const userId = req.user.id;

      if (!code) {
        return res.status(400).json({ error: 'Discount code is required' });
      }

      // Get discount information
      const [discounts] = await pool.execute(`
        SELECT d.*, 
               COUNT(dul.id) as actual_usage_count,
               CASE 
                 WHEN d.archived_at IS NOT NULL THEN 'archived'
                 WHEN d.status = 'suspended' THEN 'suspended'
                 WHEN d.status = 'expired' OR (d.expires_at IS NOT NULL AND d.expires_at < NOW()) THEN 'expired'
                 WHEN d.max_uses IS NOT NULL AND d.usage_count >= d.max_uses THEN 'exhausted'
                 WHEN d.is_active = 0 THEN 'disabled'
                 ELSE d.status
               END as computed_status
        FROM discounts d
        LEFT JOIN discount_usage_log dul ON d.id = dul.discount_id
        WHERE d.code = ?
        GROUP BY d.id
      `, [code.toUpperCase()]);

      if (discounts.length === 0) {
        return res.status(404).json({ 
          error: 'Invalid discount code',
          valid: false 
        });
      }

      const discount = discounts[0];

      // Check if discount is valid
      if (discount.computed_status !== 'valid' && discount.computed_status !== 'gift') {
        return res.status(400).json({
          error: `Discount code is ${discount.computed_status}`,
          valid: false,
          status: discount.computed_status
        });
      }

      // Check if user has already used this discount
      const [userUsage] = await pool.execute(`
        SELECT id FROM discount_usage_log 
        WHERE discount_id = ? AND user_id = ?
      `, [discount.id, userId]);

      if (userUsage.length > 0) {
        return res.status(400).json({
          error: 'You have already used this discount code',
          valid: false
        });
      }

      // Check package applicability if package_id is provided
      if (package_id) {
        const [packageInfo] = await pool.execute(`
          SELECT name FROM pricing_packages WHERE id = ?
        `, [package_id]);

        if (packageInfo.length === 0) {
          return res.status(400).json({ error: 'Invalid package' });
        }

        const packageName = packageInfo[0].name;
        const applicableTo = Array.isArray(discount.applicable_to) 
          ? discount.applicable_to 
          : JSON.parse(discount.applicable_to || '["all"]');

        if (!applicableTo.includes('all') && !applicableTo.includes(packageName)) {
          return res.status(400).json({
            error: 'This discount code is not applicable to the selected package',
            valid: false,
            applicable_to: applicableTo
          });
        }
      }

      // Return validation result
      res.json({
        valid: true,
        discount: {
          id: discount.id,
          code: discount.code,
          name: discount.name,
          description: discount.description,
          type: discount.type,
          value: discount.value,
          min_purchase_amount: discount.min_purchase_amount,
          applicable_to: Array.isArray(discount.applicable_to) 
            ? discount.applicable_to 
            : JSON.parse(discount.applicable_to || '["all"]')
        }
      });
    } catch (error) {
      console.error('Validate discount error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Get user's assigned discounts
  static async getUserDiscounts(req, res) {
    try {
      const userId = req.user.id;

      // Get user's assigned discounts that are still available
      const [userDiscounts] = await pool.execute(`
        SELECT d.*, 
               ud.status as assignment_status,
               ud.used_at,
               COUNT(dul.id) as total_usage_count,
               CASE 
                 WHEN d.archived_at IS NOT NULL THEN 'archived'
                 WHEN d.status = 'suspended' THEN 'suspended'
                 WHEN d.status = 'expired' OR (d.expires_at IS NOT NULL AND d.expires_at < NOW()) THEN 'expired'
                 WHEN d.max_uses IS NOT NULL AND d.usage_count >= d.max_uses THEN 'exhausted'
                 WHEN d.is_active = 0 THEN 'disabled'
                 WHEN ud.status = 'used' THEN 'used_by_you'
                 ELSE d.status
               END as computed_status
        FROM user_discounts ud
        JOIN discounts d ON ud.discount_id = d.id
        LEFT JOIN discount_usage_log dul ON d.id = dul.discount_id
        WHERE ud.user_id = ?
        GROUP BY d.id, ud.id
        ORDER BY ud.created_at DESC
      `, [userId]);

      // Also get publicly available discounts (gift codes, etc.)
      const [publicDiscounts] = await pool.execute(`
        SELECT d.*, 
               COUNT(dul.id) as total_usage_count,
               CASE 
                 WHEN d.archived_at IS NOT NULL THEN 'archived'
                 WHEN d.status = 'suspended' THEN 'suspended'
                 WHEN d.status = 'expired' OR (d.expires_at IS NOT NULL AND d.expires_at < NOW()) THEN 'expired'
                 WHEN d.max_uses IS NOT NULL AND d.usage_count >= d.max_uses THEN 'exhausted'
                 WHEN d.is_active = 0 THEN 'disabled'
                 ELSE d.status
               END as computed_status,
               CASE WHEN dul_user.id IS NOT NULL THEN 'used_by_you' ELSE 'available' END as user_status
        FROM discounts d
        LEFT JOIN discount_usage_log dul ON d.id = dul.discount_id
        LEFT JOIN discount_usage_log dul_user ON d.id = dul_user.discount_id AND dul_user.user_id = ?
        WHERE d.status IN ('valid', 'gift') 
          AND d.is_active = 1 
          AND d.archived_at IS NULL
          AND (d.expires_at IS NULL OR d.expires_at > NOW())
          AND (d.max_uses IS NULL OR d.usage_count < d.max_uses)
          AND d.id NOT IN (SELECT discount_id FROM user_discounts WHERE user_id = ?)
        GROUP BY d.id
        ORDER BY d.created_at DESC
      `, [userId, userId]);

      res.json({
        assigned_discounts: userDiscounts.map(discount => ({
          ...discount,
          applicable_to: Array.isArray(discount.applicable_to) 
            ? discount.applicable_to 
            : JSON.parse(discount.applicable_to || '["all"]')
        })),
        available_discounts: publicDiscounts.map(discount => ({
          ...discount,
          applicable_to: Array.isArray(discount.applicable_to) 
            ? discount.applicable_to 
            : JSON.parse(discount.applicable_to || '["all"]')
        }))
      });
    } catch (error) {
      console.error('Get user discounts error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

module.exports = PackageController;
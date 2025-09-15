const express = require('express');
const adminPaymentController = require('../../controllers/adminPaymentController');
const { auth, requireAdmin } = require('../../middleware/auth');
const { body, param, query } = require('express-validator');

const router = express.Router();

// All admin payment routes require authentication and admin role
router.use(auth, requireAdmin);

// System Control Routes
router.get('/system/status', adminPaymentController.getSystemStatus);
router.put('/system/status', [
  body('setting_key').isIn([
    'payment_system_enabled',
    'maintenance_mode',
    'emergency_shutdown',
    'maintenance_message',
    'minimum_job_fee',
    'maximum_job_fee',
    'default_job_fee'
  ]),
  body('setting_value').notEmpty(),
  body('reason').optional().isString()
], adminPaymentController.updateSystemStatus);

router.get('/system/settings', [
  query('category').optional().isIn(['system', 'pricing', 'commission', 'escrow', 'policies'])
], adminPaymentController.getAllSettings);

// Package Management Routes
router.get('/packages', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('target_audience').optional().isIn(['talent', 'manager', 'both']),
  query('package_type').optional().isIn([
    'job_posting',
    'featured_listing',
    'talent_subscription',
    'manager_subscription',
    'enterprise_plan',
    'one_time_credit',
    'bulk_package',
    'premium_features'
  ]),
  query('is_active').optional().isBoolean()
], adminPaymentController.getAllPackages);

router.post('/packages', [
  body('name').trim().isLength({ min: 1, max: 100 }),
  body('description').trim().isLength({ min: 1, max: 500 }),
  body('package_type').isIn([
    'job_posting',
    'featured_listing',
    'talent_subscription',
    'manager_subscription',
    'enterprise_plan',
    'one_time_credit',
    'bulk_package',
    'premium_features'
  ]),
  body('target_audience').isIn(['talent', 'manager', 'both']),
  body('pricing.base_price').isNumeric().isFloat({ min: 0 }),
  body('pricing.currency').optional().isIn(['usd', 'eur', 'gbp']),
  body('pricing.billing_cycle').optional().isIn(['one_time', 'monthly', 'quarterly', 'yearly']),
  body('features').optional().isArray(),
  body('availability.is_active').optional().isBoolean(),
  body('availability.start_date').optional().isISO8601(),
  body('availability.end_date').optional().isISO8601(),
  body('availability.limited_quantity').optional().isInt({ min: 1 })
], adminPaymentController.createPackage);

router.put('/packages/:id', [
  param('id').isMongoId(),
  body('name').optional().trim().isLength({ min: 1, max: 100 }),
  body('description').optional().trim().isLength({ min: 1, max: 500 }),
  body('pricing.base_price').optional().isNumeric().isFloat({ min: 0 }),
  body('availability.is_active').optional().isBoolean()
], adminPaymentController.updatePackage);

router.delete('/packages/:id', [
  param('id').isMongoId(),
  query('soft_delete').optional().isBoolean()
], adminPaymentController.deletePackage);

router.post('/packages/:id/distribute', [
  param('id').isMongoId(),
  body('distribution_type').isIn(['all', 'new_signups', 'premium_tier', 'specific_users']),
  body('manager_ids').optional().isArray().custom((value) => {
    return value.every(id => typeof id === 'string' && id.match(/^[0-9a-fA-F]{24}$/));
  })
], adminPaymentController.distributePackageToManagers);

// Transaction Management Routes
router.get('/transactions', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn([
    'initiated',
    'pending',
    'processing',
    'completed',
    'failed',
    'cancelled',
    'disputed',
    'refunded',
    'partially_refunded',
    'chargeback',
    'under_review'
  ]),
  query('transaction_type').optional().isIn([
    'job_payment',
    'escrow_deposit',
    'escrow_release',
    'escrow_refund',
    'commission_collection',
    'package_purchase',
    'subscription_payment',
    'refund_issued',
    'chargeback',
    'dispute_resolution',
    'manual_adjustment',
    'penalty_fee',
    'bonus_payment'
  ]),
  query('user_id').optional().isMongoId(),
  query('start_date').optional().isISO8601(),
  query('end_date').optional().isISO8601()
], adminPaymentController.getAllTransactions);

router.put('/transactions/:id/status', [
  param('id').isMongoId(),
  body('status').isIn([
    'pending',
    'processing',
    'completed',
    'failed',
    'cancelled',
    'disputed',
    'refunded',
    'under_review',
    'approved',
    'rejected'
  ]),
  body('reason').optional().isString().isLength({ max: 500 })
], adminPaymentController.updateTransactionStatus);

router.post('/transactions/:id/notes', [
  param('id').isMongoId(),
  body('note').trim().isLength({ min: 1, max: 1000 })
], adminPaymentController.addTransactionNote);

router.get('/transactions/unreconciled', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], adminPaymentController.getUnreconciledTransactions);

router.put('/transactions/:id/reconcile', [
  param('id').isMongoId(),
  body('bank_reference').optional().isString(),
  body('discrepancy_amount').optional().isNumeric(),
  body('discrepancy_reason').optional().isString()
], adminPaymentController.markTransactionReconciled);

// Commission Settings Routes
router.get('/commissions', [
  query('user_type').optional().isIn(['talent', 'manager', 'both'])
], adminPaymentController.getAllCommissionSettings);

router.post('/commissions', [
  body('user_type').isIn(['talent', 'manager', 'both']),
  body('commission_type').isIn(['percentage', 'flat_fee', 'tiered', 'hybrid']),
  body('base_commission_rate').isNumeric().isFloat({ min: 0, max: 100 }),
  body('flat_fee_amount').optional().isNumeric().isFloat({ min: 0 }),
  body('minimum_commission').optional().isNumeric().isFloat({ min: 0 }),
  body('maximum_commission').optional().isNumeric().isFloat({ min: 0 }),
  body('metadata.name').trim().isLength({ min: 1, max: 100 }),
  body('metadata.description').optional().isString(),
  body('conditions.enabled').optional().isBoolean(),
  body('applies_to.transaction_types').optional().isArray()
], adminPaymentController.createCommissionSettings);

router.put('/commissions/:id', [
  param('id').isMongoId(),
  body('base_commission_rate').optional().isNumeric().isFloat({ min: 0, max: 100 }),
  body('flat_fee_amount').optional().isNumeric().isFloat({ min: 0 }),
  body('conditions.enabled').optional().isBoolean(),
  body('metadata.description').optional().isString()
], adminPaymentController.updateCommissionSettings);

// Analytics and Reporting Routes
router.get('/analytics', [
  query('start_date').optional().isISO8601(),
  query('end_date').optional().isISO8601(),
  query('breakdown_by').optional().isIn(['day', 'week', 'month', 'year'])
], adminPaymentController.getPaymentAnalytics);

router.get('/reports/revenue', [
  query('start_date').optional().isISO8601(),
  query('end_date').optional().isISO8601(),
  query('group_by').optional().isIn(['hour', 'day', 'week', 'month'])
], adminPaymentController.getRevenueReport);

router.get('/alerts/fraud', adminPaymentController.getFraudAlerts);

// Escrow Management Routes (Enhanced)
router.get('/escrow/accounts', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['created', 'funded', 'partial_release', 'completed', 'refunded', 'disputed'])
], async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const skip = (page - 1) * limit;

    const query = {};
    if (status) query.status = status;

    const [accounts, total] = await Promise.all([
      EscrowAccount.find(query)
        .populate('contract_id', 'title status')
        .populate('manager_id', 'user_id')
        .populate('talent_id', 'user_id')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      EscrowAccount.countDocuments(query)
    ]);

    res.json({
      accounts,
      pagination: {
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / limit),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error getting escrow accounts:', error);
    res.status(500).json({
      error: 'Failed to get escrow accounts',
      details: error.message
    });
  }
});

router.put('/escrow/accounts/:id/emergency-release', [
  param('id').isMongoId(),
  body('amount').isNumeric().isFloat({ min: 0 }),
  body('reason').trim().isLength({ min: 1, max: 500 })
], async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, reason } = req.body;
    const adminId = req.user.id;

    const escrow = await EscrowAccount.findById(id);
    if (!escrow) {
      return res.status(404).json({ error: 'Escrow account not found' });
    }

    if (amount > escrow.held_amount) {
      return res.status(400).json({ error: 'Release amount exceeds held amount' });
    }

    // Create emergency release transaction
    const transactionData = {
      type: 'release',
      amount: amount,
      status: 'completed',
      description: `Emergency release: ${reason}`,
      processed_at: new Date()
    };

    await EscrowAccount.addTransaction(id, transactionData);

    // Update escrow amounts
    await EscrowAccount.updateAmounts(id, {
      released_amount: escrow.released_amount + amount,
      held_amount: escrow.held_amount - amount
    });

    // Log admin action
    await TransactionLog.create({
      transaction_type: 'escrow_release',
      related_entity_type: 'escrow',
      related_entity_id: id,
      user_id: adminId,
      recipient_id: escrow.talent_id,
      payment_details: {
        original_amount: amount,
        processed_amount: amount,
        net_amount: amount
      },
      status: 'completed',
      metadata: {
        description: `Admin emergency release: ${reason}`,
        admin_notes: reason
      }
    });

    res.json({
      success: true,
      message: 'Emergency release completed successfully'
    });
  } catch (error) {
    console.error('Error processing emergency release:', error);
    res.status(500).json({
      error: 'Failed to process emergency release',
      details: error.message
    });
  }
});

router.put('/escrow/accounts/:id/hold', [
  param('id').isMongoId(),
  body('reason').trim().isLength({ min: 1, max: 500 })
], async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user.id;

    const result = await EscrowAccount.updateOne(
      { _id: id },
      {
        $set: {
          status: 'disputed',
          'metadata.admin_hold_reason': reason,
          'metadata.held_by_admin': adminId,
          'metadata.hold_date': new Date()
        }
      }
    );

    if (result.modifiedCount > 0) {
      // Log admin action
      await TransactionLog.create({
        transaction_type: 'manual_adjustment',
        related_entity_type: 'escrow',
        related_entity_id: id,
        user_id: adminId,
        payment_details: {
          original_amount: 0,
          processed_amount: 0,
          net_amount: 0
        },
        status: 'completed',
        metadata: {
          description: `Admin hold placed on escrow: ${reason}`,
          admin_notes: reason
        }
      });

      res.json({
        success: true,
        message: 'Escrow account placed on hold'
      });
    } else {
      res.status(404).json({
        error: 'Escrow account not found'
      });
    }
  } catch (error) {
    console.error('Error placing escrow on hold:', error);
    res.status(500).json({
      error: 'Failed to place escrow on hold',
      details: error.message
    });
  }
});

module.exports = router;
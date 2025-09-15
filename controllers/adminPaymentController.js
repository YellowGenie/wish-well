const PaymentSettings = require('../models/PaymentSettings');
const PaymentPackage = require('../models/PaymentPackage');
const Payment = require('../models/Payment');
const TransactionLog = require('../models/TransactionLog');
const CommissionSettings = require('../models/CommissionSettings');
const EscrowAccount = require('../models/EscrowAccount');
const User = require('../models/User');
const { validationResult } = require('express-validator');

class AdminPaymentController {
  // Payment System Control
  async getSystemStatus(req, res) {
    try {
      const status = await PaymentSettings.getSystemStatus();
      const recentTransactions = await TransactionLog.find({
        created_at: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }).countDocuments();

      const pendingPayments = await Payment.countDocuments({
        status: { $in: ['pending', 'processing', 'requires_action'] }
      });

      res.json({
        system_status: status,
        stats: {
          recent_transactions_24h: recentTransactions,
          pending_payments: pendingPayments
        }
      });
    } catch (error) {
      console.error('Error getting system status:', error);
      res.status(500).json({
        error: 'Failed to get system status',
        details: error.message
      });
    }
  }

  async updateSystemStatus(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { setting_key, setting_value, reason } = req.body;
      const adminId = req.user.id;

      const updated = await PaymentSettings.setSetting(setting_key, setting_value, adminId);

      if (updated) {
        // Log admin action
        await TransactionLog.create({
          transaction_type: 'manual_adjustment',
          related_entity_type: 'system',
          related_entity_id: adminId,
          user_id: adminId,
          payment_details: {
            original_amount: 0,
            processed_amount: 0,
            net_amount: 0
          },
          status: 'completed',
          metadata: {
            description: `System setting ${setting_key} updated to ${setting_value}`,
            admin_notes: reason || 'Admin system update'
          }
        });

        res.json({
          success: true,
          message: `System setting ${setting_key} updated successfully`
        });
      } else {
        res.status(404).json({
          error: 'Setting not found'
        });
      }
    } catch (error) {
      console.error('Error updating system status:', error);
      res.status(500).json({
        error: 'Failed to update system status',
        details: error.message
      });
    }
  }

  async getAllSettings(req, res) {
    try {
      const { category } = req.query;
      const settings = await PaymentSettings.getAllSettings(category);

      res.json({
        settings,
        total: settings.length
      });
    } catch (error) {
      console.error('Error getting settings:', error);
      res.status(500).json({
        error: 'Failed to get settings',
        details: error.message
      });
    }
  }

  // Package Management
  async createPackage(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const packageData = {
        ...req.body,
        metadata: {
          ...req.body.metadata,
          created_by: req.user.id
        }
      };

      const packageId = await PaymentPackage.create(packageData);

      res.status(201).json({
        success: true,
        package_id: packageId,
        message: 'Package created successfully'
      });
    } catch (error) {
      console.error('Error creating package:', error);
      res.status(500).json({
        error: 'Failed to create package',
        details: error.message
      });
    }
  }

  async getAllPackages(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        target_audience,
        package_type,
        is_active
      } = req.query;

      const skip = (page - 1) * limit;
      const query = {};

      if (target_audience) query.target_audience = target_audience;
      if (package_type) query.package_type = package_type;
      if (is_active !== undefined) query['availability.is_active'] = is_active === 'true';

      const [packages, total] = await Promise.all([
        PaymentPackage.find(query)
          .populate('metadata.created_by', 'first_name last_name email')
          .populate('metadata.last_updated_by', 'first_name last_name email')
          .sort({ created_at: -1 })
          .skip(skip)
          .limit(parseInt(limit)),
        PaymentPackage.countDocuments(query)
      ]);

      res.json({
        packages,
        pagination: {
          total,
          page: parseInt(page),
          totalPages: Math.ceil(total / limit),
          limit: parseInt(limit)
        }
      });
    } catch (error) {
      console.error('Error getting packages:', error);
      res.status(500).json({
        error: 'Failed to get packages',
        details: error.message
      });
    }
  }

  async updatePackage(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const updates = {
        ...req.body,
        'metadata.last_updated_by': req.user.id
      };

      const result = await PaymentPackage.updateOne({ _id: id }, { $set: updates });

      if (result.modifiedCount > 0) {
        res.json({
          success: true,
          message: 'Package updated successfully'
        });
      } else {
        res.status(404).json({
          error: 'Package not found'
        });
      }
    } catch (error) {
      console.error('Error updating package:', error);
      res.status(500).json({
        error: 'Failed to update package',
        details: error.message
      });
    }
  }

  async deletePackage(req, res) {
    try {
      const { id } = req.params;
      const { soft_delete = true } = req.query;

      if (soft_delete === 'true') {
        const result = await PaymentPackage.updateOne(
          { _id: id },
          {
            $set: {
              'availability.is_active': false,
              'metadata.last_updated_by': req.user.id
            }
          }
        );

        if (result.modifiedCount > 0) {
          res.json({
            success: true,
            message: 'Package deactivated successfully'
          });
        } else {
          res.status(404).json({
            error: 'Package not found'
          });
        }
      } else {
        const result = await PaymentPackage.deleteOne({ _id: id });

        if (result.deletedCount > 0) {
          res.json({
            success: true,
            message: 'Package permanently deleted'
          });
        } else {
          res.status(404).json({
            error: 'Package not found'
          });
        }
      }
    } catch (error) {
      console.error('Error deleting package:', error);
      res.status(500).json({
        error: 'Failed to delete package',
        details: error.message
      });
    }
  }

  async distributePackageToManagers(req, res) {
    try {
      const { id } = req.params;
      const { manager_ids, distribution_type } = req.body;

      const packageData = await PaymentPackage.findById(id);
      if (!packageData) {
        return res.status(404).json({ error: 'Package not found' });
      }

      let targetManagers = [];

      if (distribution_type === 'all') {
        const managers = await User.find({ role: 'manager', is_active: true });
        targetManagers = managers.map(m => m._id);
      } else if (distribution_type === 'specific' && manager_ids) {
        targetManagers = manager_ids;
      }

      // Update package with manager distribution
      await PaymentPackage.updateOne(
        { _id: id },
        {
          $set: {
            'distribution.specific_user_ids': targetManagers,
            'distribution.manager_distribution_type': distribution_type,
            'metadata.last_updated_by': req.user.id
          }
        }
      );

      res.json({
        success: true,
        message: `Package distributed to ${targetManagers.length} managers`,
        managers_count: targetManagers.length
      });
    } catch (error) {
      console.error('Error distributing package:', error);
      res.status(500).json({
        error: 'Failed to distribute package',
        details: error.message
      });
    }
  }

  // Transaction Management
  async getAllTransactions(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        transaction_type,
        user_id,
        start_date,
        end_date
      } = req.query;

      const filters = {};
      if (status) filters.status = status;
      if (transaction_type) filters.transaction_type = transaction_type;
      if (user_id) filters.user_id = user_id;
      if (start_date) filters.start_date = start_date;
      if (end_date) filters.end_date = end_date;

      const result = await TransactionLog.findByUserId(null, page, limit, filters);

      res.json(result);
    } catch (error) {
      console.error('Error getting transactions:', error);
      res.status(500).json({
        error: 'Failed to get transactions',
        details: error.message
      });
    }
  }

  async updateTransactionStatus(req, res) {
    try {
      const { id } = req.params;
      const { status, reason } = req.body;
      const adminId = req.user.id;

      const updated = await TransactionLog.updateStatus(id, status, reason, adminId);

      if (updated) {
        // Add admin action
        await TransactionLog.addAdminAction(id, {
          action_type: 'status_change',
          action_details: { old_status: 'previous', new_status: status },
          reason
        }, adminId);

        res.json({
          success: true,
          message: 'Transaction status updated successfully'
        });
      } else {
        res.status(404).json({
          error: 'Transaction not found'
        });
      }
    } catch (error) {
      console.error('Error updating transaction status:', error);
      res.status(500).json({
        error: 'Failed to update transaction status',
        details: error.message
      });
    }
  }

  async addTransactionNote(req, res) {
    try {
      const { id } = req.params;
      const { note } = req.body;
      const adminId = req.user.id;

      const added = await TransactionLog.addAdminAction(id, {
        action_type: 'note_added',
        action_details: { note },
        reason: 'Admin added note'
      }, adminId);

      if (added) {
        res.json({
          success: true,
          message: 'Note added successfully'
        });
      } else {
        res.status(404).json({
          error: 'Transaction not found'
        });
      }
    } catch (error) {
      console.error('Error adding transaction note:', error);
      res.status(500).json({
        error: 'Failed to add note',
        details: error.message
      });
    }
  }

  // Commission Management
  async getAllCommissionSettings(req, res) {
    try {
      const { user_type } = req.query;
      const settings = await CommissionSettings.getAllActive(user_type);

      res.json({
        settings,
        total: settings.length
      });
    } catch (error) {
      console.error('Error getting commission settings:', error);
      res.status(500).json({
        error: 'Failed to get commission settings',
        details: error.message
      });
    }
  }

  async createCommissionSettings(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const settingsData = {
        ...req.body,
        metadata: {
          ...req.body.metadata,
          created_by: req.user.id
        }
      };

      const settingsId = await CommissionSettings.create(settingsData);

      res.status(201).json({
        success: true,
        settings_id: settingsId,
        message: 'Commission settings created successfully'
      });
    } catch (error) {
      console.error('Error creating commission settings:', error);
      res.status(500).json({
        error: 'Failed to create commission settings',
        details: error.message
      });
    }
  }

  async updateCommissionSettings(req, res) {
    try {
      const { id } = req.params;
      const updates = {
        ...req.body,
        'metadata.last_updated_by': req.user.id
      };

      const result = await CommissionSettings.updateOne({ _id: id }, { $set: updates });

      if (result.modifiedCount > 0) {
        res.json({
          success: true,
          message: 'Commission settings updated successfully'
        });
      } else {
        res.status(404).json({
          error: 'Commission settings not found'
        });
      }
    } catch (error) {
      console.error('Error updating commission settings:', error);
      res.status(500).json({
        error: 'Failed to update commission settings',
        details: error.message
      });
    }
  }

  // Analytics and Reports
  async getPaymentAnalytics(req, res) {
    try {
      const { start_date, end_date, breakdown_by } = req.query;

      const filters = {};
      if (start_date) filters.start_date = start_date;
      if (end_date) filters.end_date = end_date;

      const [paymentAnalytics, transactionAnalytics, packageAnalytics, commissionAnalytics] = await Promise.all([
        Payment.getAnalytics(filters),
        TransactionLog.getAnalytics(filters),
        PaymentPackage.getAnalytics(null, filters.start_date, filters.end_date),
        CommissionSettings.getAnalytics(null, filters.start_date, filters.end_date)
      ]);

      const dashboardData = {
        overview: {
          total_payments: paymentAnalytics.total_payments,
          total_revenue: paymentAnalytics.total_amount,
          success_rate: paymentAnalytics.success_rate,
          total_transactions: transactionAnalytics.total_transactions
        },
        payments: paymentAnalytics,
        transactions: transactionAnalytics,
        packages: packageAnalytics,
        commissions: commissionAnalytics
      };

      res.json(dashboardData);
    } catch (error) {
      console.error('Error getting payment analytics:', error);
      res.status(500).json({
        error: 'Failed to get payment analytics',
        details: error.message
      });
    }
  }

  async getRevenueReport(req, res) {
    try {
      const { start_date, end_date, group_by = 'day' } = req.query;

      const matchStage = {
        status: 'completed',
        created_at: {}
      };

      if (start_date) matchStage.created_at.$gte = new Date(start_date);
      if (end_date) matchStage.created_at.$lte = new Date(end_date);

      let groupStage;
      switch (group_by) {
        case 'hour':
          groupStage = {
            $group: {
              _id: {
                year: { $year: '$created_at' },
                month: { $month: '$created_at' },
                day: { $dayOfMonth: '$created_at' },
                hour: { $hour: '$created_at' }
              },
              revenue: { $sum: '$amount' },
              transactions: { $sum: 1 },
              fees: { $sum: '$fee_amount' },
              commissions: { $sum: '$commission_amount' }
            }
          };
          break;
        case 'month':
          groupStage = {
            $group: {
              _id: {
                year: { $year: '$created_at' },
                month: { $month: '$created_at' }
              },
              revenue: { $sum: '$amount' },
              transactions: { $sum: 1 },
              fees: { $sum: '$fee_amount' },
              commissions: { $sum: '$commission_amount' }
            }
          };
          break;
        default: // day
          groupStage = {
            $group: {
              _id: {
                year: { $year: '$created_at' },
                month: { $month: '$created_at' },
                day: { $dayOfMonth: '$created_at' }
              },
              revenue: { $sum: '$amount' },
              transactions: { $sum: 1 },
              fees: { $sum: '$fee_amount' },
              commissions: { $sum: '$commission_amount' }
            }
          };
      }

      const revenueData = await Payment.aggregate([
        { $match: matchStage },
        groupStage,
        { $sort: { '_id': 1 } }
      ]);

      res.json({
        revenue_data: revenueData,
        group_by,
        period: { start_date, end_date }
      });
    } catch (error) {
      console.error('Error getting revenue report:', error);
      res.status(500).json({
        error: 'Failed to get revenue report',
        details: error.message
      });
    }
  }

  async getFraudAlerts(req, res) {
    try {
      const alerts = await TransactionLog.getFraudAlerts();
      const disputedPayments = await Payment.getDisputedPayments();

      res.json({
        fraud_alerts: alerts,
        disputed_payments: disputedPayments,
        total_alerts: alerts.length + disputedPayments.length
      });
    } catch (error) {
      console.error('Error getting fraud alerts:', error);
      res.status(500).json({
        error: 'Failed to get fraud alerts',
        details: error.message
      });
    }
  }

  async getUnreconciledTransactions(req, res) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const result = await TransactionLog.getUnreconciledTransactions(page, limit);

      res.json(result);
    } catch (error) {
      console.error('Error getting unreconciled transactions:', error);
      res.status(500).json({
        error: 'Failed to get unreconciled transactions',
        details: error.message
      });
    }
  }

  async markTransactionReconciled(req, res) {
    try {
      const { id } = req.params;
      const { bank_reference, discrepancy_amount, discrepancy_reason } = req.body;

      const details = {};
      if (bank_reference) details.bank_reference = bank_reference;
      if (discrepancy_amount) details.discrepancy_amount = discrepancy_amount;
      if (discrepancy_reason) details.discrepancy_reason = discrepancy_reason;

      const marked = await TransactionLog.markReconciled(id, req.user.id, details);

      if (marked) {
        res.json({
          success: true,
          message: 'Transaction marked as reconciled'
        });
      } else {
        res.status(404).json({
          error: 'Transaction not found'
        });
      }
    } catch (error) {
      console.error('Error marking transaction reconciled:', error);
      res.status(500).json({
        error: 'Failed to mark transaction reconciled',
        details: error.message
      });
    }
  }
}

module.exports = new AdminPaymentController();
const { mongoose } = require('../config/mongodb');

const transactionLogSchema = new mongoose.Schema({
  transaction_id: {
    type: String,
    required: true
  },
  transaction_type: {
    type: String,
    enum: [
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
    ],
    required: true
  },
  related_entity_type: {
    type: String,
    enum: ['job', 'contract', 'milestone', 'package', 'subscription', 'user', 'escrow', 'system'],
    required: true
  },
  related_entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipient_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  payment_details: {
    stripe_payment_intent_id: String,
    stripe_transfer_id: String,
    stripe_refund_id: String,
    stripe_charge_id: String,
    payment_method_id: String,
    original_amount: {
      type: Number,
      required: true
    },
    processed_amount: {
      type: Number,
      required: true
    },
    fee_amount: {
      type: Number,
      default: 0
    },
    commission_amount: {
      type: Number,
      default: 0
    },
    net_amount: {
      type: Number,
      required: true
    },
    currency: {
      type: String,
      default: 'usd'
    },
    exchange_rate: Number,
    processing_fee: Number
  },
  status: {
    type: String,
    enum: [
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
    ],
    default: 'initiated'
  },
  status_history: [{
    status: String,
    timestamp: Date,
    reason: String,
    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    system_generated: {
      type: Boolean,
      default: false
    }
  }],
  metadata: {
    description: String,
    admin_notes: String,
    customer_notes: String,
    fraud_score: Number,
    risk_level: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical']
    },
    ip_address: String,
    user_agent: String,
    country_code: String,
    device_fingerprint: String
  },
  reconciliation: {
    reconciled: {
      type: Boolean,
      default: false
    },
    reconciled_at: Date,
    reconciled_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    discrepancy_amount: Number,
    discrepancy_reason: String,
    bank_reference: String,
    accounting_period: String
  },
  admin_actions: [{
    action_type: {
      type: String,
      enum: [
        'status_change',
        'refund_issued',
        'dispute_resolved',
        'manual_adjustment',
        'fraud_investigation',
        'account_suspension',
        'note_added',
        'priority_changed'
      ]
    },
    action_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    action_details: mongoose.Schema.Types.Mixed,
    timestamp: {
      type: Date,
      default: Date.now
    },
    reason: String
  }],
  error_logs: [{
    error_type: String,
    error_message: String,
    error_code: String,
    stack_trace: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    resolved: {
      type: Boolean,
      default: false
    }
  }],
  notification_status: {
    user_notified: {
      type: Boolean,
      default: false
    },
    admin_notified: {
      type: Boolean,
      default: false
    },
    notification_attempts: {
      type: Number,
      default: 0
    },
    last_notification_attempt: Date
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Indexes
transactionLogSchema.index({ transaction_id: 1 }, { unique: true });
transactionLogSchema.index({ user_id: 1, created_at: -1 });
transactionLogSchema.index({ recipient_id: 1, created_at: -1 });
transactionLogSchema.index({ transaction_type: 1 });
transactionLogSchema.index({ status: 1 });
transactionLogSchema.index({ related_entity_type: 1, related_entity_id: 1 });
transactionLogSchema.index({ 'payment_details.stripe_payment_intent_id': 1 });
transactionLogSchema.index({ 'reconciliation.reconciled': 1 });
transactionLogSchema.index({ created_at: -1 });

// Virtual for formatted amount
transactionLogSchema.virtual('formatted_amount').get(function() {
  return `${this.payment_details.currency.toUpperCase()} ${(this.payment_details.processed_amount / 100).toFixed(2)}`;
});

// Static methods
transactionLogSchema.statics.create = async function(transactionData) {
  // Generate unique transaction ID if not provided
  if (!transactionData.transaction_id) {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8);
    transactionData.transaction_id = `TXN_${timestamp}_${random}`;
  }

  // Initialize status history
  if (!transactionData.status_history) {
    transactionData.status_history = [{
      status: transactionData.status || 'initiated',
      timestamp: new Date(),
      reason: 'Transaction created',
      system_generated: true
    }];
  }

  const transaction = new this(transactionData);
  const savedTransaction = await transaction.save();
  return savedTransaction._id;
};

transactionLogSchema.statics.findByUserId = async function(userId, page = 1, limit = 20, filters = {}) {
  const skip = (page - 1) * limit;

  const query = {
    $or: [
      { user_id: userId },
      { recipient_id: userId }
    ]
  };

  // Apply filters
  if (filters.transaction_type) query.transaction_type = filters.transaction_type;
  if (filters.status) query.status = filters.status;
  if (filters.start_date || filters.end_date) {
    query.created_at = {};
    if (filters.start_date) query.created_at.$gte = new Date(filters.start_date);
    if (filters.end_date) query.created_at.$lte = new Date(filters.end_date);
  }

  const [transactions, total] = await Promise.all([
    this.find(query)
      .populate('user_id', 'first_name last_name email')
      .populate('recipient_id', 'first_name last_name email')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    this.countDocuments(query)
  ]);

  return {
    transactions,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
};

transactionLogSchema.statics.updateStatus = async function(transactionId, newStatus, reason = null, updatedBy = null) {
  const statusEntry = {
    status: newStatus,
    timestamp: new Date(),
    reason: reason || `Status updated to ${newStatus}`,
    system_generated: !updatedBy
  };

  if (updatedBy) {
    statusEntry.updated_by = updatedBy;
  }

  const result = await this.updateOne(
    { _id: transactionId },
    {
      $set: { status: newStatus },
      $push: { status_history: statusEntry }
    }
  );

  return result.modifiedCount > 0;
};

transactionLogSchema.statics.addAdminAction = async function(transactionId, actionData, adminUserId) {
  const action = {
    ...actionData,
    action_by: adminUserId,
    timestamp: new Date()
  };

  const result = await this.updateOne(
    { _id: transactionId },
    { $push: { admin_actions: action } }
  );

  return result.modifiedCount > 0;
};

transactionLogSchema.statics.logError = async function(transactionId, errorData) {
  const error = {
    ...errorData,
    timestamp: new Date()
  };

  const result = await this.updateOne(
    { _id: transactionId },
    { $push: { error_logs: error } }
  );

  return result.modifiedCount > 0;
};

transactionLogSchema.statics.markReconciled = async function(transactionId, reconciledBy, details = {}) {
  const update = {
    'reconciliation.reconciled': true,
    'reconciliation.reconciled_at': new Date(),
    'reconciliation.reconciled_by': reconciledBy,
    ...Object.keys(details).reduce((acc, key) => {
      acc[`reconciliation.${key}`] = details[key];
      return acc;
    }, {})
  };

  const result = await this.updateOne({ _id: transactionId }, { $set: update });
  return result.modifiedCount > 0;
};

transactionLogSchema.statics.getAnalytics = async function(filters = {}) {
  const match = {};

  if (filters.start_date || filters.end_date) {
    match.created_at = {};
    if (filters.start_date) match.created_at.$gte = new Date(filters.start_date);
    if (filters.end_date) match.created_at.$lte = new Date(filters.end_date);
  }

  if (filters.transaction_type) match.transaction_type = filters.transaction_type;
  if (filters.status) match.status = filters.status;

  const pipeline = [
    { $match: match },
    {
      $group: {
        _id: null,
        total_transactions: { $sum: 1 },
        total_amount: { $sum: '$payment_details.processed_amount' },
        total_fees: { $sum: '$payment_details.fee_amount' },
        total_commission: { $sum: '$payment_details.commission_amount' },
        avg_amount: { $avg: '$payment_details.processed_amount' },
        successful_transactions: {
          $sum: {
            $cond: [{ $eq: ['$status', 'completed'] }, 1, 0]
          }
        },
        failed_transactions: {
          $sum: {
            $cond: [{ $in: ['$status', ['failed', 'cancelled']] }, 1, 0]
          }
        }
      }
    },
    {
      $addFields: {
        success_rate: {
          $multiply: [
            { $divide: ['$successful_transactions', '$total_transactions'] },
            100
          ]
        }
      }
    }
  ];

  const result = await this.aggregate(pipeline);
  return result[0] || {
    total_transactions: 0,
    total_amount: 0,
    total_fees: 0,
    total_commission: 0,
    avg_amount: 0,
    successful_transactions: 0,
    failed_transactions: 0,
    success_rate: 0
  };
};

transactionLogSchema.statics.getUnreconciledTransactions = async function(page = 1, limit = 20) {
  const skip = (page - 1) * limit;

  const [transactions, total] = await Promise.all([
    this.find({
      'reconciliation.reconciled': false,
      status: 'completed'
    })
      .populate('user_id', 'first_name last_name email')
      .populate('recipient_id', 'first_name last_name email')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit),
    this.countDocuments({
      'reconciliation.reconciled': false,
      status: 'completed'
    })
  ]);

  return {
    transactions,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
};

transactionLogSchema.statics.getFraudAlerts = async function() {
  return await this.find({
    $or: [
      { 'metadata.fraud_score': { $gte: 75 } },
      { 'metadata.risk_level': 'high' },
      { 'metadata.risk_level': 'critical' },
      { status: 'disputed' },
      { status: 'chargeback' }
    ]
  })
    .populate('user_id', 'first_name last_name email')
    .sort({ created_at: -1 })
    .limit(50);
};

const TransactionLog = mongoose.model('TransactionLog', transactionLogSchema);

module.exports = TransactionLog;
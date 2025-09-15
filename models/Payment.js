const { mongoose } = require('../config/mongodb');

const paymentSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipient_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  stripe_customer_id: String,
  stripe_payment_intent_id: {
    type: String,
    unique: true,
    required: true
  },
  stripe_transfer_id: String,
  stripe_refund_id: String,
  payment_type: {
    type: String,
    enum: [
      'job_payment',
      'package_purchase',
      'subscription_payment',
      'escrow_deposit',
      'escrow_release',
      'commission_fee',
      'refund',
      'bonus_payment',
      'penalty_fee',
      'manual_adjustment'
    ],
    default: 'job_payment'
  },
  package_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PaymentPackage'
  },
  original_amount: {
    type: Number,
    required: true
  },
  amount: {
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
  status: {
    type: String,
    enum: [
      'pending',
      'processing',
      'completed',
      'failed',
      'cancelled',
      'disputed',
      'refunded',
      'partially_refunded',
      'chargeback',
      'requires_action',
      'under_review',
      'approved',
      'rejected'
    ],
    default: 'pending'
  },
  status_history: [{
    status: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    reason: String,
    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  job_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job'
  },
  contract_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contract'
  },
  milestone_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Milestone'
  },
  description: String,
  admin_notes: String,
  metadata: {
    ip_address: String,
    user_agent: String,
    country_code: String,
    payment_method_type: String,
    fraud_score: Number,
    risk_level: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical']
    }
  },
  notification_sent: {
    type: Boolean,
    default: false
  },
  transaction_log_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TransactionLog'
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Indexes
paymentSchema.index({ user_id: 1 });
paymentSchema.index({ recipient_id: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ payment_type: 1 });
paymentSchema.index({ stripe_payment_intent_id: 1 });
paymentSchema.index({ created_at: -1 });
paymentSchema.index({ job_id: 1 });
paymentSchema.index({ package_id: 1 });

// Virtual for formatted amount
paymentSchema.virtual('formatted_amount').get(function() {
  return `${this.currency.toUpperCase()} ${(this.amount / 100).toFixed(2)}`;
});

// Static methods
paymentSchema.statics.create = async function(paymentData) {
  // Initialize status history
  if (!paymentData.status_history) {
    paymentData.status_history = [{
      status: paymentData.status || 'pending',
      timestamp: new Date(),
      reason: 'Payment created'
    }];
  }

  const payment = new this(paymentData);
  const savedPayment = await payment.save();
  return savedPayment._id;
};

paymentSchema.statics.findById = async function(id) {
  return await this.findOne({ _id: id })
    .populate('user_id', 'first_name last_name email')
    .populate('recipient_id', 'first_name last_name email')
    .populate('job_id', 'title')
    .populate('package_id', 'name slug')
    .populate('contract_id', 'title')
    .populate('transaction_log_id');
};

paymentSchema.statics.findByUserId = async function(userId, page = 1, limit = 20, filters = {}) {
  const skip = (page - 1) * limit;

  const query = {
    $or: [
      { user_id: userId },
      { recipient_id: userId }
    ]
  };

  // Apply filters
  if (filters.status) query.status = filters.status;
  if (filters.payment_type) query.payment_type = filters.payment_type;
  if (filters.start_date || filters.end_date) {
    query.created_at = {};
    if (filters.start_date) query.created_at.$gte = new Date(filters.start_date);
    if (filters.end_date) query.created_at.$lte = new Date(filters.end_date);
  }

  const [payments, total] = await Promise.all([
    this.find(query)
      .populate('user_id', 'first_name last_name email')
      .populate('recipient_id', 'first_name last_name email')
      .populate('job_id', 'title')
      .populate('package_id', 'name')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    this.countDocuments(query)
  ]);

  return {
    payments,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
};

paymentSchema.statics.updateStatus = async function(paymentId, newStatus, reason = null, updatedBy = null) {
  const statusEntry = {
    status: newStatus,
    timestamp: new Date(),
    reason: reason || `Status updated to ${newStatus}`
  };

  if (updatedBy) {
    statusEntry.updated_by = updatedBy;
  }

  const result = await this.updateOne(
    { _id: paymentId },
    {
      $set: { status: newStatus },
      $push: { status_history: statusEntry }
    }
  );

  return result.modifiedCount > 0;
};

paymentSchema.statics.updateByPaymentIntentId = async function(paymentIntentId, updates) {
  const result = await this.updateOne(
    { stripe_payment_intent_id: paymentIntentId },
    { $set: updates }
  );
  return result.modifiedCount > 0;
};

paymentSchema.statics.getAnalytics = async function(filters = {}) {
  const match = {};

  if (filters.start_date || filters.end_date) {
    match.created_at = {};
    if (filters.start_date) match.created_at.$gte = new Date(filters.start_date);
    if (filters.end_date) match.created_at.$lte = new Date(filters.end_date);
  }

  if (filters.payment_type) match.payment_type = filters.payment_type;
  if (filters.user_id) match.user_id = filters.user_id;

  const pipeline = [
    { $match: match },
    {
      $group: {
        _id: null,
        total_payments: { $sum: 1 },
        total_amount: { $sum: '$amount' },
        total_fees: { $sum: '$fee_amount' },
        total_commission: { $sum: '$commission_amount' },
        avg_payment: { $avg: '$amount' },
        completed_payments: {
          $sum: {
            $cond: [{ $eq: ['$status', 'completed'] }, 1, 0]
          }
        },
        failed_payments: {
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
            { $divide: ['$completed_payments', '$total_payments'] },
            100
          ]
        }
      }
    }
  ];

  const result = await this.aggregate(pipeline);
  return result[0] || {
    total_payments: 0,
    total_amount: 0,
    total_fees: 0,
    total_commission: 0,
    avg_payment: 0,
    completed_payments: 0,
    failed_payments: 0,
    success_rate: 0
  };
};

paymentSchema.statics.getPendingPayments = async function(page = 1, limit = 20) {
  const skip = (page - 1) * limit;

  const [payments, total] = await Promise.all([
    this.find({
      status: { $in: ['pending', 'processing', 'requires_action'] }
    })
      .populate('user_id', 'first_name last_name email')
      .populate('recipient_id', 'first_name last_name email')
      .populate('job_id', 'title')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit),
    this.countDocuments({
      status: { $in: ['pending', 'processing', 'requires_action'] }
    })
  ]);

  return {
    payments,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
};

paymentSchema.statics.getDisputedPayments = async function() {
  return await this.find({
    status: { $in: ['disputed', 'chargeback', 'under_review'] }
  })
    .populate('user_id', 'first_name last_name email')
    .populate('recipient_id', 'first_name last_name email')
    .populate('job_id', 'title')
    .sort({ created_at: -1 })
    .limit(50);
};

const Payment = mongoose.model('Payment', paymentSchema);
module.exports = Payment;
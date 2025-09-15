const { mongoose } = require('../config/mongodb');

const tierSchema = new mongoose.Schema({
  tier_name: {
    type: String,
    required: true
  },
  min_volume: {
    type: Number,
    required: true,
    min: 0
  },
  max_volume: {
    type: Number
  },
  commission_rate: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  flat_fee: {
    type: Number,
    default: 0,
    min: 0
  }
});

const commissionSettingsSchema = new mongoose.Schema({
  user_type: {
    type: String,
    enum: ['talent', 'manager', 'both'],
    required: true
  },
  commission_type: {
    type: String,
    enum: ['percentage', 'flat_fee', 'tiered', 'hybrid'],
    required: true
  },
  base_commission_rate: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  flat_fee_amount: {
    type: Number,
    default: 0,
    min: 0
  },
  minimum_commission: {
    type: Number,
    default: 0,
    min: 0
  },
  maximum_commission: {
    type: Number
  },
  currency: {
    type: String,
    default: 'usd'
  },
  tiers: [tierSchema],
  applies_to: {
    transaction_types: [{
      type: String,
      enum: [
        'job_payment',
        'package_purchase',
        'escrow_release',
        'bonus_payment',
        'milestone_payment'
      ]
    }],
    job_categories: [String],
    payment_ranges: [{
      min_amount: Number,
      max_amount: Number,
      commission_adjustment: Number // percentage adjustment (+/-)
    }]
  },
  conditions: {
    enabled: {
      type: Boolean,
      default: true
    },
    start_date: {
      type: Date,
      default: Date.now
    },
    end_date: {
      type: Date
    },
    minimum_user_rating: {
      type: Number,
      min: 0,
      max: 5
    },
    minimum_account_age_days: {
      type: Number,
      default: 0
    },
    premium_users_only: {
      type: Boolean,
      default: false
    },
    geographic_restrictions: [String], // country codes
    excluded_users: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }]
  },
  promotional: {
    is_promotional: {
      type: Boolean,
      default: false
    },
    promotional_name: String,
    promotional_start: Date,
    promotional_end: Date,
    max_users: Number,
    current_users: {
      type: Number,
      default: 0
    }
  },
  metadata: {
    name: {
      type: String,
      required: true
    },
    description: String,
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    last_updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    priority: {
      type: Number,
      default: 1,
      min: 1,
      max: 10
    },
    internal_notes: String
  },
  analytics: {
    total_users_affected: {
      type: Number,
      default: 0
    },
    total_commission_collected: {
      type: Number,
      default: 0
    },
    total_transactions_processed: {
      type: Number,
      default: 0
    },
    average_commission_per_transaction: {
      type: Number,
      default: 0
    },
    last_calculated: Date
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Indexes
commissionSettingsSchema.index({ user_type: 1 });
commissionSettingsSchema.index({ 'conditions.enabled': 1 });
commissionSettingsSchema.index({ 'metadata.priority': -1 });
commissionSettingsSchema.index({ commission_type: 1 });
commissionSettingsSchema.index({ created_at: -1 });

// Virtual for active status
commissionSettingsSchema.virtual('is_active').get(function() {
  if (!this.conditions.enabled) return false;

  const now = new Date();
  if (this.conditions.start_date > now) return false;
  if (this.conditions.end_date && this.conditions.end_date < now) return false;

  if (this.promotional.is_promotional) {
    if (this.promotional.promotional_start && this.promotional.promotional_start > now) return false;
    if (this.promotional.promotional_end && this.promotional.promotional_end < now) return false;
    if (this.promotional.max_users && this.promotional.current_users >= this.promotional.max_users) return false;
  }

  return true;
});

// Static methods
commissionSettingsSchema.statics.create = async function(settingsData) {
  const settings = new this(settingsData);
  const savedSettings = await settings.save();
  return savedSettings._id;
};

commissionSettingsSchema.statics.getActiveForUser = async function(userId, userType, transactionAmount = 0, transactionType = null, jobCategory = null) {
  const User = require('./User');
  const user = await User.findById(userId);

  if (!user) return null;

  const query = {
    user_type: { $in: [userType, 'both'] },
    'conditions.enabled': true,
    'conditions.start_date': { $lte: new Date() },
    $or: [
      { 'conditions.end_date': { $exists: false } },
      { 'conditions.end_date': null },
      { 'conditions.end_date': { $gt: new Date() } }
    ]
  };

  // Apply user exclusions
  query['conditions.excluded_users'] = { $ne: userId };

  const settings = await this.find(query)
    .sort({ 'metadata.priority': -1, created_at: -1 })
    .limit(10);

  // Filter based on conditions
  const applicableSettings = settings.filter(setting => {
    // Check minimum user rating
    if (setting.conditions.minimum_user_rating && user.rating < setting.conditions.minimum_user_rating) {
      return false;
    }

    // Check account age
    if (setting.conditions.minimum_account_age_days) {
      const accountAge = (new Date() - user.created_at) / (1000 * 60 * 60 * 24);
      if (accountAge < setting.conditions.minimum_account_age_days) {
        return false;
      }
    }

    // Check premium status
    if (setting.conditions.premium_users_only && !user.is_premium) {
      return false;
    }

    // Check transaction type
    if (transactionType && setting.applies_to.transaction_types.length > 0) {
      if (!setting.applies_to.transaction_types.includes(transactionType)) {
        return false;
      }
    }

    // Check job category
    if (jobCategory && setting.applies_to.job_categories.length > 0) {
      if (!setting.applies_to.job_categories.includes(jobCategory)) {
        return false;
      }
    }

    // Check promotional limits
    if (setting.promotional.is_promotional) {
      if (setting.promotional.max_users && setting.promotional.current_users >= setting.promotional.max_users) {
        return false;
      }
    }

    return true;
  });

  return applicableSettings.length > 0 ? applicableSettings[0] : null;
};

commissionSettingsSchema.statics.calculateCommission = async function(settingsId, transactionAmount, userId = null) {
  const settings = await this.findById(settingsId);
  if (!settings || !settings.is_active) {
    throw new Error('Commission settings not found or inactive');
  }

  let commissionAmount = 0;
  let calculationDetails = {
    base_rate: settings.base_commission_rate,
    flat_fee: settings.flat_fee_amount,
    tier_applied: null,
    range_adjustment: 0
  };

  switch (settings.commission_type) {
    case 'percentage':
      commissionAmount = (transactionAmount * settings.base_commission_rate) / 100;
      break;

    case 'flat_fee':
      commissionAmount = settings.flat_fee_amount;
      break;

    case 'tiered':
      // Find applicable tier
      const tier = settings.tiers.find(t =>
        transactionAmount >= t.min_volume &&
        (!t.max_volume || transactionAmount <= t.max_volume)
      );

      if (tier) {
        commissionAmount = (transactionAmount * tier.commission_rate) / 100 + tier.flat_fee;
        calculationDetails.tier_applied = tier.tier_name;
      } else {
        commissionAmount = (transactionAmount * settings.base_commission_rate) / 100;
      }
      break;

    case 'hybrid':
      commissionAmount = (transactionAmount * settings.base_commission_rate) / 100 + settings.flat_fee_amount;
      break;

    default:
      commissionAmount = (transactionAmount * settings.base_commission_rate) / 100;
  }

  // Apply payment range adjustments
  const range = settings.applies_to.payment_ranges.find(r =>
    transactionAmount >= r.min_amount &&
    (!r.max_amount || transactionAmount <= r.max_amount)
  );

  if (range) {
    const adjustment = (commissionAmount * range.commission_adjustment) / 100;
    commissionAmount += adjustment;
    calculationDetails.range_adjustment = range.commission_adjustment;
  }

  // Apply min/max limits
  if (settings.minimum_commission && commissionAmount < settings.minimum_commission) {
    commissionAmount = settings.minimum_commission;
  }

  if (settings.maximum_commission && commissionAmount > settings.maximum_commission) {
    commissionAmount = settings.maximum_commission;
  }

  return {
    commission_amount: Math.round(commissionAmount), // Round to cents
    settings_id: settingsId,
    calculation_details: calculationDetails,
    effective_rate: (commissionAmount / transactionAmount) * 100
  };
};

commissionSettingsSchema.statics.updateAnalytics = async function(settingsId, transactionAmount, commissionAmount) {
  const update = {
    $inc: {
      'analytics.total_commission_collected': commissionAmount,
      'analytics.total_transactions_processed': 1
    },
    $set: {
      'analytics.last_calculated': new Date()
    }
  };

  await this.updateOne({ _id: settingsId }, update);

  // Calculate new average
  const settings = await this.findById(settingsId);
  if (settings) {
    const newAverage = settings.analytics.total_commission_collected / settings.analytics.total_transactions_processed;
    await this.updateOne(
      { _id: settingsId },
      { $set: { 'analytics.average_commission_per_transaction': newAverage } }
    );
  }
};

commissionSettingsSchema.statics.getAllActive = async function(userType = null) {
  const query = {
    'conditions.enabled': true,
    'conditions.start_date': { $lte: new Date() },
    $or: [
      { 'conditions.end_date': { $exists: false } },
      { 'conditions.end_date': null },
      { 'conditions.end_date': { $gt: new Date() } }
    ]
  };

  if (userType) {
    query.user_type = { $in: [userType, 'both'] };
  }

  return await this.find(query)
    .populate('metadata.created_by', 'first_name last_name')
    .populate('metadata.last_updated_by', 'first_name last_name')
    .sort({ 'metadata.priority': -1, created_at: -1 });
};

commissionSettingsSchema.statics.getAnalytics = async function(settingsId = null, startDate = null, endDate = null) {
  const match = {};

  if (settingsId) {
    match._id = settingsId;
  }

  if (startDate || endDate) {
    match.created_at = {};
    if (startDate) match.created_at.$gte = startDate;
    if (endDate) match.created_at.$lte = endDate;
  }

  const pipeline = [
    { $match: match },
    {
      $group: {
        _id: null,
        total_settings: { $sum: 1 },
        total_commission_collected: { $sum: '$analytics.total_commission_collected' },
        total_transactions: { $sum: '$analytics.total_transactions_processed' },
        avg_commission_per_transaction: { $avg: '$analytics.average_commission_per_transaction' },
        active_settings: {
          $sum: {
            $cond: [{ $eq: ['$conditions.enabled', true] }, 1, 0]
          }
        }
      }
    }
  ];

  const result = await this.aggregate(pipeline);
  return result[0] || {
    total_settings: 0,
    total_commission_collected: 0,
    total_transactions: 0,
    avg_commission_per_transaction: 0,
    active_settings: 0
  };
};

commissionSettingsSchema.statics.initializeDefaults = async function(adminUserId) {
  const defaultSettings = [
    {
      user_type: 'talent',
      commission_type: 'percentage',
      base_commission_rate: 5.0,
      flat_fee_amount: 0,
      minimum_commission: 50, // $0.50 minimum
      currency: 'usd',
      applies_to: {
        transaction_types: ['job_payment', 'escrow_release', 'milestone_payment']
      },
      conditions: {
        enabled: true
      },
      metadata: {
        name: 'Default Talent Commission',
        description: 'Standard 5% commission for talent payments',
        created_by: adminUserId,
        priority: 5
      }
    },
    {
      user_type: 'manager',
      commission_type: 'percentage',
      base_commission_rate: 3.0,
      flat_fee_amount: 0,
      minimum_commission: 30, // $0.30 minimum
      currency: 'usd',
      applies_to: {
        transaction_types: ['job_payment', 'package_purchase']
      },
      conditions: {
        enabled: true
      },
      metadata: {
        name: 'Default Manager Commission',
        description: 'Standard 3% commission for manager payments',
        created_by: adminUserId,
        priority: 5
      }
    }
  ];

  for (const setting of defaultSettings) {
    const existing = await this.findOne({
      'metadata.name': setting.metadata.name
    });
    if (!existing) {
      await this.create(setting);
    }
  }

  return true;
};

const CommissionSettings = mongoose.model('CommissionSettings', commissionSettingsSchema);

module.exports = CommissionSettings;
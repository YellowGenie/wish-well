const { mongoose } = require('../config/mongodb');

const packageFeatureSchema = new mongoose.Schema({
  feature_key: {
    type: String,
    required: true,
    enum: [
      'job_posts',
      'featured_listings',
      'priority_support',
      'analytics_dashboard',
      'bulk_posting',
      'advanced_filtering',
      'direct_messaging',
      'contract_templates',
      'payment_protection',
      'dispute_resolution',
      'extended_visibility',
      'premium_badge',
      'api_access',
      'custom_branding'
    ]
  },
  feature_name: {
    type: String,
    required: true
  },
  feature_value: {
    type: mongoose.Schema.Types.Mixed, // number for quantities, boolean for features, string for descriptions
    required: true
  },
  feature_description: {
    type: String,
    required: true
  }
});

const discountRuleSchema = new mongoose.Schema({
  discount_type: {
    type: String,
    enum: ['percentage', 'fixed_amount', 'bulk_tier'],
    required: true
  },
  discount_value: {
    type: Number,
    required: true
  },
  min_quantity: {
    type: Number,
    default: 1
  },
  max_quantity: {
    type: Number
  },
  conditions: {
    user_type: {
      type: String,
      enum: ['talent', 'manager', 'both']
    },
    first_time_buyer: Boolean,
    minimum_account_age_days: Number,
    required_user_tier: String
  }
});

const paymentPackageSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  slug: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    maxlength: 500
  },
  package_type: {
    type: String,
    enum: [
      'job_posting',
      'featured_listing',
      'talent_subscription',
      'manager_subscription',
      'enterprise_plan',
      'one_time_credit',
      'bulk_package',
      'premium_features'
    ],
    required: true
  },
  target_audience: {
    type: String,
    enum: ['talent', 'manager', 'both'],
    required: true
  },
  pricing: {
    base_price: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      default: 'usd'
    },
    billing_cycle: {
      type: String,
      enum: ['one_time', 'monthly', 'quarterly', 'yearly'],
      default: 'one_time'
    },
    setup_fee: {
      type: Number,
      default: 0
    }
  },
  features: [packageFeatureSchema],
  discount_rules: [discountRuleSchema],
  availability: {
    is_active: {
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
    limited_quantity: {
      type: Number
    },
    purchased_quantity: {
      type: Number,
      default: 0
    }
  },
  distribution: {
    auto_assign_to_managers: {
      type: Boolean,
      default: false
    },
    manager_distribution_type: {
      type: String,
      enum: ['all', 'new_signups', 'premium_tier', 'specific_users'],
      default: 'all'
    },
    specific_user_ids: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    post_cost_to_manager: {
      type: Boolean,
      default: false
    },
    manager_cost_percentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    }
  },
  analytics: {
    view_count: {
      type: Number,
      default: 0
    },
    purchase_count: {
      type: Number,
      default: 0
    },
    conversion_rate: {
      type: Number,
      default: 0
    },
    total_revenue: {
      type: Number,
      default: 0
    }
  },
  metadata: {
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    last_updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    tags: [String],
    internal_notes: String,
    priority_level: {
      type: Number,
      default: 1,
      min: 1,
      max: 10
    }
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Indexes
paymentPackageSchema.index({ slug: 1 }, { unique: true });
paymentPackageSchema.index({ package_type: 1 });
paymentPackageSchema.index({ target_audience: 1 });
paymentPackageSchema.index({ 'availability.is_active': 1 });
paymentPackageSchema.index({ 'pricing.base_price': 1 });
paymentPackageSchema.index({ created_at: -1 });

// Virtual for availability status
paymentPackageSchema.virtual('is_available').get(function() {
  if (!this.availability.is_active) return false;

  const now = new Date();
  if (this.availability.start_date > now) return false;
  if (this.availability.end_date && this.availability.end_date < now) return false;

  if (this.availability.limited_quantity) {
    return this.availability.purchased_quantity < this.availability.limited_quantity;
  }

  return true;
});

// Virtual for calculated price with discounts
paymentPackageSchema.virtual('calculated_price').get(function() {
  let price = this.pricing.base_price;

  // Apply discount rules if any
  if (this.discount_rules && this.discount_rules.length > 0) {
    // This would be calculated based on user context in the actual method
    // For now, return base price
  }

  return price;
});

// Static methods
paymentPackageSchema.statics.create = async function(packageData) {
  // Generate slug from name if not provided
  if (!packageData.slug) {
    packageData.slug = packageData.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  const packageDoc = new this(packageData);
  const savedPackage = await packageDoc.save();
  return savedPackage._id;
};

paymentPackageSchema.statics.findAvailable = async function(targetAudience = null, packageType = null) {
  const query = {
    'availability.is_active': true,
    'availability.start_date': { $lte: new Date() },
    $or: [
      { 'availability.end_date': { $exists: false } },
      { 'availability.end_date': null },
      { 'availability.end_date': { $gt: new Date() } }
    ]
  };

  if (targetAudience) {
    query.$or = [
      { target_audience: targetAudience },
      { target_audience: 'both' }
    ];
  }

  if (packageType) {
    query.package_type = packageType;
  }

  return await this.find(query)
    .populate('metadata.created_by', 'first_name last_name')
    .sort({ 'metadata.priority_level': -1, created_at: -1 });
};

paymentPackageSchema.statics.findBySlug = async function(slug) {
  return await this.findOne({ slug, 'availability.is_active': true })
    .populate('metadata.created_by', 'first_name last_name')
    .populate('metadata.last_updated_by', 'first_name last_name');
};

paymentPackageSchema.statics.calculatePrice = async function(packageId, userId, quantity = 1, promoCode = null) {
  const packageDoc = await this.findById(packageId);
  if (!packageDoc || !packageDoc.is_available) {
    throw new Error('Package not available');
  }

  let totalPrice = packageDoc.pricing.base_price * quantity;
  let discount = 0;
  let appliedRules = [];

  // Apply discount rules
  for (const rule of packageDoc.discount_rules) {
    if (quantity >= rule.min_quantity && (!rule.max_quantity || quantity <= rule.max_quantity)) {
      let ruleDiscount = 0;

      if (rule.discount_type === 'percentage') {
        ruleDiscount = totalPrice * (rule.discount_value / 100);
      } else if (rule.discount_type === 'fixed_amount') {
        ruleDiscount = rule.discount_value * quantity;
      } else if (rule.discount_type === 'bulk_tier') {
        // Tiered bulk discount
        ruleDiscount = totalPrice * (rule.discount_value / 100);
      }

      if (ruleDiscount > discount) {
        discount = ruleDiscount;
        appliedRules = [rule];
      }
    }
  }

  const finalPrice = Math.max(0, totalPrice - discount);

  return {
    base_price: packageDoc.pricing.base_price,
    quantity,
    subtotal: totalPrice,
    discount,
    final_price: finalPrice,
    setup_fee: packageDoc.pricing.setup_fee,
    total: finalPrice + packageDoc.pricing.setup_fee,
    applied_rules: appliedRules
  };
};

paymentPackageSchema.statics.recordPurchase = async function(packageId, quantity = 1, revenue = 0) {
  const update = {
    $inc: {
      'analytics.purchase_count': 1,
      'analytics.total_revenue': revenue,
      'availability.purchased_quantity': quantity
    }
  };

  await this.updateOne({ _id: packageId }, update);

  // Update conversion rate
  const packageDoc = await this.findById(packageId);
  if (packageDoc && packageDoc.analytics.view_count > 0) {
    const conversionRate = (packageDoc.analytics.purchase_count / packageDoc.analytics.view_count) * 100;
    await this.updateOne({ _id: packageId }, { 'analytics.conversion_rate': conversionRate });
  }
};

paymentPackageSchema.statics.recordView = async function(packageId) {
  await this.updateOne(
    { _id: packageId },
    { $inc: { 'analytics.view_count': 1 } }
  );
};

paymentPackageSchema.statics.getForManager = async function(managerId) {
  return await this.find({
    'availability.is_active': true,
    $or: [
      { 'distribution.auto_assign_to_managers': true },
      { 'distribution.specific_user_ids': managerId }
    ]
  }).sort({ 'metadata.priority_level': -1 });
};

paymentPackageSchema.statics.getAnalytics = async function(packageId = null, startDate = null, endDate = null) {
  const match = {};

  if (packageId) {
    match._id = packageId;
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
        total_packages: { $sum: 1 },
        total_purchases: { $sum: '$analytics.purchase_count' },
        total_revenue: { $sum: '$analytics.total_revenue' },
        total_views: { $sum: '$analytics.view_count' },
        avg_conversion_rate: { $avg: '$analytics.conversion_rate' }
      }
    }
  ];

  const result = await this.aggregate(pipeline);
  return result[0] || {
    total_packages: 0,
    total_purchases: 0,
    total_revenue: 0,
    total_views: 0,
    avg_conversion_rate: 0
  };
};

const PaymentPackage = mongoose.model('PaymentPackage', paymentPackageSchema);

module.exports = PaymentPackage;
const { mongoose } = require('../config/mongodb');

const paymentSettingsSchema = new mongoose.Schema({
  setting_key: {
    type: String,
    required: true,
    enum: [
      'payment_system_enabled',
      'maintenance_mode',
      'emergency_shutdown',
      'maintenance_message',
      'minimum_job_fee',
      'maximum_job_fee',
      'default_job_fee',
      'platform_commission_talent',
      'platform_commission_manager',
      'commission_enabled_talent',
      'commission_enabled_manager',
      'escrow_release_delay_hours',
      'payment_retry_attempts',
      'refund_policy_days',
      'dispute_resolution_enabled',
      'auto_release_milestones',
      'featured_listing_multiplier'
    ]
  },
  setting_value: {
    type: mongoose.Schema.Types.Mixed, // Can store string, number, boolean, object
    required: true
  },
  data_type: {
    type: String,
    enum: ['boolean', 'number', 'string', 'object'],
    required: true
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['system', 'pricing', 'commission', 'escrow', 'policies'],
    required: true
  },
  updated_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  is_active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Indexes
paymentSettingsSchema.index({ setting_key: 1 }, { unique: true });
paymentSettingsSchema.index({ category: 1 });
paymentSettingsSchema.index({ is_active: 1 });

// Static methods
paymentSettingsSchema.statics.getSetting = async function(key) {
  const setting = await this.findOne({ setting_key: key, is_active: true });
  return setting ? setting.setting_value : null;
};

paymentSettingsSchema.statics.setSetting = async function(key, value, updatedBy) {
  const setting = await this.findOne({ setting_key: key });

  if (setting) {
    setting.setting_value = value;
    setting.updated_by = updatedBy;
    await setting.save();
    return setting._id;
  }

  return null;
};

paymentSettingsSchema.statics.getAllSettings = async function(category = null) {
  const query = { is_active: true };
  if (category) query.category = category;

  const settings = await this.find(query)
    .populate('updated_by', 'first_name last_name email')
    .sort({ category: 1, setting_key: 1 });

  return settings;
};

paymentSettingsSchema.statics.getSettingsByCategory = async function(category) {
  return await this.find({
    category: category,
    is_active: true
  }).sort({ setting_key: 1 });
};

paymentSettingsSchema.statics.initializeDefaults = async function(adminUserId) {
  const defaultSettings = [
    {
      setting_key: 'payment_system_enabled',
      setting_value: true,
      data_type: 'boolean',
      description: 'Master toggle for entire payment system',
      category: 'system',
      updated_by: adminUserId
    },
    {
      setting_key: 'maintenance_mode',
      setting_value: false,
      data_type: 'boolean',
      description: 'Put payment system in maintenance mode',
      category: 'system',
      updated_by: adminUserId
    },
    {
      setting_key: 'emergency_shutdown',
      setting_value: false,
      data_type: 'boolean',
      description: 'Emergency shutdown of all payment processing',
      category: 'system',
      updated_by: adminUserId
    },
    {
      setting_key: 'maintenance_message',
      setting_value: 'Payment system is currently under maintenance. Please try again later.',
      data_type: 'string',
      description: 'Message shown during maintenance mode',
      category: 'system',
      updated_by: adminUserId
    },
    {
      setting_key: 'minimum_job_fee',
      setting_value: 1, // $0.01 in cents
      data_type: 'number',
      description: 'Minimum job posting fee in cents',
      category: 'pricing',
      updated_by: adminUserId
    },
    {
      setting_key: 'maximum_job_fee',
      setting_value: 100000, // $1000.00 in cents
      data_type: 'number',
      description: 'Maximum job posting fee in cents',
      category: 'pricing',
      updated_by: adminUserId
    },
    {
      setting_key: 'default_job_fee',
      setting_value: 1, // $0.01 in cents
      data_type: 'number',
      description: 'Default job posting fee in cents',
      category: 'pricing',
      updated_by: adminUserId
    },
    {
      setting_key: 'platform_commission_talent',
      setting_value: 5.0,
      data_type: 'number',
      description: 'Platform commission percentage for talent',
      category: 'commission',
      updated_by: adminUserId
    },
    {
      setting_key: 'platform_commission_manager',
      setting_value: 3.0,
      data_type: 'number',
      description: 'Platform commission percentage for managers',
      category: 'commission',
      updated_by: adminUserId
    },
    {
      setting_key: 'commission_enabled_talent',
      setting_value: true,
      data_type: 'boolean',
      description: 'Enable commission collection from talent',
      category: 'commission',
      updated_by: adminUserId
    },
    {
      setting_key: 'commission_enabled_manager',
      setting_value: true,
      data_type: 'boolean',
      description: 'Enable commission collection from managers',
      category: 'commission',
      updated_by: adminUserId
    },
    {
      setting_key: 'escrow_release_delay_hours',
      setting_value: 72,
      data_type: 'number',
      description: 'Hours to wait before auto-releasing escrow funds',
      category: 'escrow',
      updated_by: adminUserId
    },
    {
      setting_key: 'payment_retry_attempts',
      setting_value: 3,
      data_type: 'number',
      description: 'Number of retry attempts for failed payments',
      category: 'system',
      updated_by: adminUserId
    },
    {
      setting_key: 'refund_policy_days',
      setting_value: 30,
      data_type: 'number',
      description: 'Number of days for refund policy',
      category: 'policies',
      updated_by: adminUserId
    },
    {
      setting_key: 'dispute_resolution_enabled',
      setting_value: true,
      data_type: 'boolean',
      description: 'Enable automated dispute resolution system',
      category: 'escrow',
      updated_by: adminUserId
    },
    {
      setting_key: 'auto_release_milestones',
      setting_value: true,
      data_type: 'boolean',
      description: 'Automatically release milestone payments when completed',
      category: 'escrow',
      updated_by: adminUserId
    },
    {
      setting_key: 'featured_listing_multiplier',
      setting_value: 3.0,
      data_type: 'number',
      description: 'Multiplier for featured listing fees',
      category: 'pricing',
      updated_by: adminUserId
    }
  ];

  for (const setting of defaultSettings) {
    const existing = await this.findOne({ setting_key: setting.setting_key });
    if (!existing) {
      await this.create(setting);
    }
  }

  return true;
};

paymentSettingsSchema.statics.isPaymentSystemEnabled = async function() {
  const enabled = await this.getSetting('payment_system_enabled');
  const maintenance = await this.getSetting('maintenance_mode');
  const emergency = await this.getSetting('emergency_shutdown');

  return enabled && !maintenance && !emergency;
};

paymentSettingsSchema.statics.getSystemStatus = async function() {
  const [enabled, maintenance, emergency, message] = await Promise.all([
    this.getSetting('payment_system_enabled'),
    this.getSetting('maintenance_mode'),
    this.getSetting('emergency_shutdown'),
    this.getSetting('maintenance_message')
  ]);

  let status = 'active';
  let statusMessage = 'Payment system is operational';

  if (emergency) {
    status = 'emergency_shutdown';
    statusMessage = 'Payment system is in emergency shutdown mode';
  } else if (maintenance) {
    status = 'maintenance';
    statusMessage = message || 'Payment system is under maintenance';
  } else if (!enabled) {
    status = 'disabled';
    statusMessage = 'Payment system is disabled';
  }

  return {
    status,
    message: statusMessage,
    enabled,
    maintenance,
    emergency
  };
};

const PaymentSettings = mongoose.model('PaymentSettings', paymentSettingsSchema);

module.exports = PaymentSettings;
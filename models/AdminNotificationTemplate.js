const { mongoose } = require('../config/mongodb');

const adminNotificationTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true
  },
  notification_type: {
    type: String,
    enum: ['modal', 'chatbot', 'both'],
    default: 'modal'
  },
  target_audience: {
    type: String,
    enum: ['talent', 'manager', 'both', 'specific_users'],
    default: 'both'
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  display_settings: {
    theme: {
      type: String,
      enum: ['info', 'success', 'warning', 'error'],
      default: 'info'
    },
    dismissible: {
      type: Boolean,
      default: true
    },
    autoClose: {
      type: mongoose.Schema.Types.Mixed, // can be boolean or number
      default: false
    },
    showIcon: {
      type: Boolean,
      default: true
    },
    actionButtons: [{
      text: String,
      action: {
        type: String,
        enum: ['dismiss', 'redirect']
      },
      url: String,
      variant: {
        type: String,
        enum: ['default', 'destructive', 'outline', 'secondary'],
        default: 'default'
      }
    }]
  },
  modal_size: {
    type: String,
    enum: ['small', 'medium', 'large'],
    default: 'medium'
  },
  variables: [{
    name: String,
    description: String,
    type: {
      type: String,
      enum: ['text', 'number', 'date', 'boolean'],
      default: 'text'
    },
    required: {
      type: Boolean,
      default: false
    }
  }],
  category: {
    type: String,
    enum: ['welcome', 'system', 'feature', 'maintenance', 'marketing', 'alert'],
    default: 'system'
  },
  is_active: {
    type: Boolean,
    default: true
  },
  usage_count: {
    type: Number,
    default: 0
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  last_used_at: Date
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

// Indexes
adminNotificationTemplateSchema.index({ name: 1 });
adminNotificationTemplateSchema.index({ category: 1 });
adminNotificationTemplateSchema.index({ is_active: 1 });
adminNotificationTemplateSchema.index({ created_by: 1 });

// Static methods
adminNotificationTemplateSchema.statics.findActive = function() {
  return this.find({ is_active: true }).sort({ name: 1 });
};

adminNotificationTemplateSchema.statics.findByCategory = function(category) {
  return this.find({ category, is_active: true }).sort({ name: 1 });
};

adminNotificationTemplateSchema.statics.incrementUsage = async function(id) {
  await this.findByIdAndUpdate(id, {
    $inc: { usage_count: 1 },
    $set: { last_used_at: new Date() }
  });
};

const AdminNotificationTemplate = mongoose.model('AdminNotificationTemplate', adminNotificationTemplateSchema);

module.exports = AdminNotificationTemplate;
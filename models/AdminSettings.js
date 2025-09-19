const { mongoose } = require('../config/mongodb');

// Admin Settings Schema
const adminSettingsSchema = new mongoose.Schema({
  setting_key: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  setting_value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  description: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    enum: ['job_approval', 'user_management', 'payment', 'notification', 'system'],
    default: 'system'
  },
  updated_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

// Indexes
adminSettingsSchema.index({ setting_key: 1 });
adminSettingsSchema.index({ category: 1 });

// Static methods
adminSettingsSchema.statics.getSetting = async function(key, defaultValue = null) {
  try {
    const setting = await this.findOne({ setting_key: key });
    return setting ? setting.setting_value : defaultValue;
  } catch (error) {
    console.error('Error getting admin setting:', error);
    return defaultValue;
  }
};

adminSettingsSchema.statics.setSetting = async function(key, value, updatedBy, description = '', category = 'system') {
  try {
    const result = await this.findOneAndUpdate(
      { setting_key: key },
      {
        setting_value: value,
        description,
        category,
        updated_by: updatedBy,
        updated_at: new Date()
      },
      {
        upsert: true,
        new: true,
        runValidators: true
      }
    );
    return result;
  } catch (error) {
    console.error('Error setting admin setting:', error);
    throw error;
  }
};

adminSettingsSchema.statics.getJobApprovalSettings = async function() {
  try {
    const autoApproval = await this.getSetting('job_auto_approval', false);
    const requiresReview = await this.getSetting('job_requires_manual_review', true);
    const reviewTimeHours = await this.getSetting('job_review_time_hours', 12);

    return {
      auto_approval: autoApproval,
      requires_manual_review: requiresReview,
      review_time_hours: reviewTimeHours
    };
  } catch (error) {
    console.error('Error getting job approval settings:', error);
    return {
      auto_approval: false,
      requires_manual_review: true,
      review_time_hours: 12
    };
  }
};

adminSettingsSchema.statics.updateJobApprovalSettings = async function(settings, updatedBy) {
  try {
    const promises = [];

    if (settings.auto_approval !== undefined) {
      promises.push(this.setSetting(
        'job_auto_approval',
        settings.auto_approval,
        updatedBy,
        'Whether jobs should be automatically approved',
        'job_approval'
      ));
    }

    if (settings.requires_manual_review !== undefined) {
      promises.push(this.setSetting(
        'job_requires_manual_review',
        settings.requires_manual_review,
        updatedBy,
        'Whether jobs require manual admin review',
        'job_approval'
      ));
    }

    if (settings.review_time_hours !== undefined) {
      promises.push(this.setSetting(
        'job_review_time_hours',
        settings.review_time_hours,
        updatedBy,
        'Hours to review job posts before approval',
        'job_approval'
      ));
    }

    await Promise.all(promises);
    return await this.getJobApprovalSettings();
  } catch (error) {
    console.error('Error updating job approval settings:', error);
    throw error;
  }
};

adminSettingsSchema.statics.getAllSettings = async function(category = null) {
  try {
    const query = category ? { category } : {};
    const settings = await this.find(query)
      .populate('updated_by', 'first_name last_name email')
      .sort({ category: 1, setting_key: 1 });

    return settings.map(setting => ({
      key: setting.setting_key,
      value: setting.setting_value,
      description: setting.description,
      category: setting.category,
      updated_by: setting.updated_by,
      updated_at: setting.updated_at
    }));
  } catch (error) {
    console.error('Error getting all admin settings:', error);
    throw error;
  }
};

// Initialize default settings
adminSettingsSchema.statics.initializeDefaults = async function(adminUserId) {
  try {
    const defaults = [
      {
        key: 'job_auto_approval',
        value: false,
        description: 'Whether jobs should be automatically approved',
        category: 'job_approval'
      },
      {
        key: 'job_requires_manual_review',
        value: true,
        description: 'Whether jobs require manual admin review',
        category: 'job_approval'
      },
      {
        key: 'job_review_time_hours',
        value: 12,
        description: 'Hours to review job posts before approval',
        category: 'job_approval'
      }
    ];

    for (const setting of defaults) {
      await this.setSetting(
        setting.key,
        setting.value,
        adminUserId,
        setting.description,
        setting.category
      );
    }
  } catch (error) {
    console.error('Error initializing default admin settings:', error);
  }
};

const AdminSettings = mongoose.model('AdminSettings', adminSettingsSchema);

module.exports = AdminSettings;
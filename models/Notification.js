const { mongoose } = require('../config/mongodb');

// Notification Schema
const notificationSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['email', 'push', 'both'],
    default: 'email'
  },
  template_name: {
    type: String
  },
  recipient_email: {
    type: String
  },
  subject: {
    type: String
  },
  content: {
    type: String,
    required: true
  },
  template_variables: {
    type: mongoose.Schema.Types.Mixed
  },
  status: {
    type: String,
    enum: ['pending', 'sending', 'sent', 'failed', 'scheduled'],
    default: 'pending'
  },
  scheduled_for: {
    type: Date
  },
  sent_at: {
    type: Date
  },
  failed_reason: {
    type: String
  },
  retry_count: {
    type: Number,
    default: 0
  },
  max_retries: {
    type: Number,
    default: 3
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  }
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

// Indexes
notificationSchema.index({ user_id: 1 });
notificationSchema.index({ status: 1 });
notificationSchema.index({ scheduled_for: 1 });
notificationSchema.index({ user_id: 1, type: 1 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
const { mongoose } = require('../config/mongodb');

const adminNotificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'active', 'completed', 'cancelled'],
    default: 'draft'
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  target_audience: {
    type: String,
    enum: ['talent', 'manager', 'both', 'specific_users'],
    required: true
  },
  target_users: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  scheduled_at: Date,
  delivered_count: {
    type: Number,
    default: 0
  },
  read_count: {
    type: Number,
    default: 0
  },
  template_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AdminNotificationTemplate'
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  delivery_logs: [{
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    delivered_at: Date,
    read_at: Date,
    status: {
      type: String,
      enum: ['pending', 'delivered', 'read', 'failed']
    }
  }]
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Indexes
adminNotificationSchema.index({ status: 1, scheduled_at: 1 });
adminNotificationSchema.index({ target_audience: 1 });
adminNotificationSchema.index({ created_by: 1 });

// Static methods for findAll with filtering
adminNotificationSchema.statics.findAll = async function(options = {}) {
  const {
    limit = 20,
    offset = 0,
    status,
    priority,
    target_audience,
    search,
    sort_by = 'created_at',
    sort_order = 'DESC'
  } = options;

  let query = {};
  
  if (status) query.status = status;
  if (priority) query.priority = priority;
  if (target_audience) query.target_audience = target_audience;
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { message: { $regex: search, $options: 'i' } }
    ];
  }

  const sortObj = {};
  sortObj[sort_by] = sort_order === 'ASC' ? 1 : -1;

  return this.find(query)
    .sort(sortObj)
    .limit(parseInt(limit))
    .skip(parseInt(offset))
    .populate('created_by', 'first_name last_name email')
    .populate('template_id', 'name');
};

// Static method to get scheduled notifications
adminNotificationSchema.statics.getScheduledNotifications = async function(limit = 10) {
  return this.find({
    status: 'scheduled',
    scheduled_at: { $lte: new Date() }
  })
  .limit(parseInt(limit))
  .populate('created_by', 'first_name last_name email');
};

// Static method to mark as delivered
adminNotificationSchema.statics.markAsDelivered = async function(notificationId, userId, deliveryData = {}) {
  return this.findByIdAndUpdate(
    notificationId,
    {
      $push: {
        delivery_logs: {
          user_id: userId,
          delivered_at: new Date(),
          status: 'delivered',
          ...deliveryData
        }
      },
      $inc: { delivered_count: 1 }
    },
    { new: true }
  );
};

// Static method to get analytics
adminNotificationSchema.statics.getAnalytics = async function(notificationId, dateRange) {
  const notification = await this.findById(notificationId);
  if (!notification) return null;

  return {
    delivered_count: notification.delivered_count,
    read_count: notification.read_count,
    delivery_logs: notification.delivery_logs
  };
};

const AdminNotification = mongoose.model('AdminNotification', adminNotificationSchema);
module.exports = AdminNotification;
const express = require('express');
const router = express.Router();
const AdminNotification = require('../models/AdminNotification');
const AdminNotificationTemplate = require('../models/AdminNotificationTemplate');
const User = require('../models/User');
const { auth, requireAdmin } = require('../middleware/auth');
const { body, query, validationResult } = require('express-validator');

// Middleware to ensure only admins can access these routes
router.use(auth);
router.use(requireAdmin);

// Get all admin notifications with filtering and pagination
router.get('/', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['draft', 'scheduled', 'active', 'completed', 'cancelled']),
  query('priority').optional().isIn(['low', 'normal', 'high', 'urgent']),
  query('target_audience').optional().isIn(['talent', 'manager', 'both', 'specific_users']),
  query('search').optional().isLength({ max: 255 }),
  query('sort_by').optional().isIn(['created_at', 'updated_at', 'scheduled_at', 'title', 'priority']),
  query('sort_order').optional().isIn(['ASC', 'DESC'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const {
      page = 1,
      limit = 20,
      status,
      priority,
      target_audience,
      search,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;

    const notifications = await AdminNotification.findAll({
      limit: parseInt(limit),
      offset,
      status,
      priority,
      target_audience,
      search,
      sort_by,
      sort_order
    });

    // Get total count for pagination
    const totalQuery = await AdminNotification.findAll({ limit: 1000000 }); // Get all for count
    const total = totalQuery.length;

    res.json({
      success: true,
      data: {
        notifications,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching admin notifications:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get a specific notification
router.get('/:id', async (req, res) => {
  try {
    const notification = await AdminNotification.findById(req.params.id);
    
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.json({ success: true, data: notification });
  } catch (error) {
    console.error('Error fetching notification:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Create a new notification
router.post('/', [
  body('title').notEmpty().trim().isLength({ max: 255 }),
  body('message').notEmpty().trim(),
  body('notification_type').optional().isIn(['modal', 'chatbot', 'both']),
  body('target_audience').optional().isIn(['talent', 'manager', 'both', 'specific_users']),
  body('target_user_ids').optional().isArray(),
  body('priority').optional().isIn(['low', 'normal', 'high', 'urgent']),
  body('display_settings').optional().isObject(),
  body('modal_size').optional().isIn(['small', 'medium', 'large']),
  body('schedule_type').optional().isIn(['immediate', 'scheduled', 'recurring']),
  body('scheduled_at').optional().isISO8601(),
  body('timezone').optional().isLength({ max: 50 }),
  body('recurring_pattern').optional().isIn(['daily', 'weekly', 'monthly']),
  body('recurring_interval').optional().isInt({ min: 1 }),
  body('recurring_days_of_week').optional().isArray(),
  body('recurring_end_date').optional().isISO8601(),
  body('max_occurrences').optional().isInt({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const notificationData = {
      ...req.body,
      created_by: req.user.id
    };

    // Validate target_user_ids if specific_users is selected
    if (notificationData.target_audience === 'specific_users') {
      if (!notificationData.target_user_ids || notificationData.target_user_ids.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'target_user_ids is required when target_audience is specific_users' 
        });
      }
    }

    const notificationId = await AdminNotification.create(notificationData);

    // If immediate, start processing
    if (notificationData.schedule_type === 'immediate') {
      // Trigger immediate processing (you might want to use a queue for this)
      setImmediate(() => {
        processNotification(notificationId);
      });
    }

    res.status(201).json({
      success: true,
      data: { id: notificationId },
      message: 'Notification created successfully'
    });
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Update a notification
router.put('/:id', [
  body('title').optional().trim().isLength({ max: 255 }),
  body('message').optional().trim(),
  body('notification_type').optional().isIn(['modal', 'chatbot', 'both']),
  body('target_audience').optional().isIn(['talent', 'manager', 'both', 'specific_users']),
  body('target_user_ids').optional().isArray(),
  body('priority').optional().isIn(['low', 'normal', 'high', 'urgent']),
  body('display_settings').optional().isObject(),
  body('modal_size').optional().isIn(['small', 'medium', 'large']),
  body('schedule_type').optional().isIn(['immediate', 'scheduled', 'recurring']),
  body('scheduled_at').optional().isISO8601(),
  body('status').optional().isIn(['draft', 'scheduled', 'active', 'completed', 'cancelled']),
  body('is_active').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const updated = await AdminNotification.update(req.params.id, req.body);
    
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.json({ success: true, message: 'Notification updated successfully' });
  } catch (error) {
    console.error('Error updating notification:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Delete a notification
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await AdminNotification.delete(req.params.id);
    
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.json({ success: true, message: 'Notification deleted successfully' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get notification analytics
router.get('/:id/analytics', [
  query('dateRange').optional().isIn(['7', '30', '90', '365'])
], async (req, res) => {
  try {
    const { dateRange = '30' } = req.query;
    
    const analytics = await AdminNotification.getAnalytics(req.params.id, dateRange);
    
    res.json({ success: true, data: analytics });
  } catch (error) {
    console.error('Error fetching notification analytics:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Send test notification
router.post('/:id/test', [
  body('test_user_id').notEmpty().isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const notification = await AdminNotification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    const testUser = await User.findById(req.body.test_user_id);
    if (!testUser) {
      return res.status(404).json({ success: false, message: 'Test user not found' });
    }

    // Send test notification (implement your real-time notification logic here)
    await sendNotificationToUser(notification, testUser, { isTest: true });

    res.json({ success: true, message: 'Test notification sent successfully' });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get scheduled notifications ready for processing
router.get('/scheduled/pending', async (req, res) => {
  try {
    const notifications = await AdminNotification.getScheduledNotifications(50);
    res.json({ success: true, data: notifications });
  } catch (error) {
    console.error('Error fetching scheduled notifications:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Process scheduled notifications (trigger manually)
router.post('/process-scheduled', async (req, res) => {
  try {
    const notifications = await AdminNotification.getScheduledNotifications(20);
    
    let processed = 0;
    for (const notification of notifications) {
      try {
        await processNotification(notification.id);
        processed++;
      } catch (error) {
        console.error(`Error processing notification ${notification.id}:`, error);
      }
    }

    res.json({ 
      success: true, 
      message: `Processed ${processed} notifications`,
      processed,
      total: notifications.length
    });
  } catch (error) {
    console.error('Error processing scheduled notifications:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Helper function to process a notification
async function processNotification(notificationId) {
  try {
    const notification = await AdminNotification.findById(notificationId);
    if (!notification) return;

    // Get target users
    let targetUsers = [];
    
    if (notification.target_audience === 'specific_users') {
      // Get specific users
      for (const userId of notification.target_user_ids) {
        const user = await User.findById(userId);
        if (user) targetUsers.push(user);
      }
    } else {
      // Get users by role
      const roleFilter = notification.target_audience === 'both' ? null : notification.target_audience;
      const result = await User.getAllUsers(roleFilter, 1, 1000);
      targetUsers = result.users;
    }

    // Send notifications to each user
    for (const user of targetUsers) {
      await sendNotificationToUser(notification, user);
      await AdminNotification.markAsDelivered(notificationId, user.id, {
        delivery_method: notification.notification_type,
        device_type: 'web',
        user_agent: 'server-sent',
        ip_address: 'system'
      });
    }

    // Update notification status
    await AdminNotification.update(notificationId, {
      status: 'active',
      total_sent: targetUsers.length
    });

  } catch (error) {
    console.error('Error in processNotification:', error);
    throw error;
  }
}

// Helper function to send notification to a user (you'll integrate with Socket.io)
async function sendNotificationToUser(notification, user, options = {}) {
  try {
    // This is where you'd integrate with your Socket.io setup
    // For now, we'll just log it
    console.log(`Sending notification to user ${user.id}:`, {
      notification_id: notification.id,
      title: notification.title,
      message: notification.message,
      type: notification.notification_type,
      priority: notification.priority,
      user: user.email,
      isTest: options.isTest || false
    });

    // In a real implementation, you would:
    // 1. Get the user's socket connection
    // 2. Emit the notification via Socket.io
    // 3. Store in their notification queue if they're offline
    
  } catch (error) {
    console.error('Error sending notification to user:', error);
    throw error;
  }
}

module.exports = router;
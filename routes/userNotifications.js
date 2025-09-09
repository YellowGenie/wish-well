const express = require('express');
const router = express.Router();
const AdminNotification = require('../models/AdminNotification');
const { auth } = require('../middleware/auth');
const { body, query, validationResult } = require('express-validator');

// All routes require authentication
router.use(auth);

// Get active notifications for current user
router.get('/active', async (req, res) => {
  try {
    // Check if admin notifications table exists first
    const { pool } = require('../config/database');
    
    try {
      // Test if the table exists by running a simple query
      await pool.execute('SELECT 1 FROM admin_notifications LIMIT 1');
    } catch (tableError) {
      console.log('Admin notifications table does not exist yet, returning empty array');
      return res.json({
        success: true,
        data: []
      });
    }

    const notifications = await AdminNotification.getActiveNotificationsForUser(
      req.user.id, 
      req.user.role
    );

    res.json({
      success: true,
      data: notifications
    });
  } catch (error) {
    console.error('Error fetching active notifications:', error);
    console.error('Error details:', error.message, error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Mark notification as viewed
router.post('/:id/view', [
  body('interaction_data').optional().isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { interaction_data = {} } = req.body;

    await AdminNotification.markAsViewed(
      req.params.id,
      req.user.id,
      interaction_data
    );

    res.json({ success: true, message: 'Notification marked as viewed' });
  } catch (error) {
    console.error('Error marking notification as viewed:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Mark notification as dismissed
router.post('/:id/dismiss', [
  body('interaction_data').optional().isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { interaction_data = {} } = req.body;

    await AdminNotification.markAsDismissed(
      req.params.id,
      req.user.id,
      interaction_data
    );

    res.json({ success: true, message: 'Notification dismissed' });
  } catch (error) {
    console.error('Error dismissing notification:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Mark notification as clicked (for tracking button clicks)
router.post('/:id/click', [
  body('click_data').optional().isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { click_data = {} } = req.body;

    await AdminNotification.markAsClicked(
      req.params.id,
      req.user.id,
      click_data
    );

    res.json({ success: true, message: 'Notification click tracked' });
  } catch (error) {
    console.error('Error tracking notification click:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get user's notification preferences
router.get('/preferences', async (req, res) => {
  try {
    const { pool } = require('../config/database');
    
    try {
      // Test if the table exists
      await pool.execute('SELECT 1 FROM user_admin_notification_preferences LIMIT 1');
    } catch (tableError) {
      console.log('User admin notification preferences table does not exist yet, returning defaults');
      return res.json({
        success: true,
        data: {
          receive_admin_notifications: true,
          preferred_delivery_method: 'both',
          auto_dismiss_timeout: 0,
          sound_enabled: true,
          animation_enabled: true,
          respect_quiet_hours: true,
          quiet_hours_start: '22:00:00',
          quiet_hours_end: '08:00:00',
          min_priority_level: 'low'
        }
      });
    }
    
    const [rows] = await pool.execute(`
      SELECT * FROM user_admin_notification_preferences 
      WHERE user_id = ?
    `, [req.user.id]);

    let preferences;
    if (rows.length === 0) {
      // Create default preferences
      await pool.execute(`
        INSERT INTO user_admin_notification_preferences (user_id)
        VALUES (?)
      `, [req.user.id]);

      // Fetch the newly created preferences
      const [newRows] = await pool.execute(`
        SELECT * FROM user_admin_notification_preferences 
        WHERE user_id = ?
      `, [req.user.id]);
      
      preferences = newRows[0];
    } else {
      preferences = rows[0];
    }

    res.json({
      success: true,
      data: preferences
    });
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    console.error('Error details:', error.message, error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update user's notification preferences
router.put('/preferences', [
  body('receive_admin_notifications').optional().isBoolean(),
  body('preferred_delivery_method').optional().isIn(['modal', 'chatbot', 'both']),
  body('auto_dismiss_timeout').optional().isInt({ min: 0 }),
  body('sound_enabled').optional().isBoolean(),
  body('animation_enabled').optional().isBoolean(),
  body('respect_quiet_hours').optional().isBoolean(),
  body('quiet_hours_start').optional().matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/),
  body('quiet_hours_end').optional().matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/),
  body('min_priority_level').optional().isIn(['low', 'normal', 'high', 'urgent'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { pool } = require('../config/database');

    const allowedFields = [
      'receive_admin_notifications',
      'preferred_delivery_method',
      'auto_dismiss_timeout',
      'sound_enabled',
      'animation_enabled',
      'respect_quiet_hours',
      'quiet_hours_start',
      'quiet_hours_end',
      'min_priority_level'
    ];

    const fields = [];
    const values = [];

    Object.keys(req.body).forEach(key => {
      if (allowedFields.includes(key) && req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(req.body[key]);
      }
    });

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update' });
    }

    values.push(req.user.id);

    await pool.execute(`
      UPDATE user_admin_notification_preferences 
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP 
      WHERE user_id = ?
    `, values);

    res.json({ success: true, message: 'Preferences updated successfully' });
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get notification history for user
router.get('/history', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('include_dismissed').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const {
      page = 1,
      limit = 20,
      include_dismissed = true
    } = req.query;

    const offset = (page - 1) * limit;
    const { pool } = require('../config/database');

    let query = `
      SELECT an.*, und.delivered_at, und.viewed_at, und.dismissed_at, und.clicked_at
      FROM user_notification_deliveries und
      JOIN admin_notifications an ON und.admin_notification_id = an.id
      WHERE und.user_id = ?
    `;

    const params = [req.user.id];

    if (!include_dismissed) {
      query += ' AND und.dismissed_at IS NULL';
    }

    query += ' ORDER BY und.delivered_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [rows] = await pool.execute(query, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total
      FROM user_notification_deliveries und
      WHERE und.user_id = ?
    `;
    const countParams = [req.user.id];

    if (!include_dismissed) {
      countQuery += ' AND und.dismissed_at IS NULL';
    }

    const [countRows] = await pool.execute(countQuery, countParams);
    const total = countRows[0].total;

    const notifications = rows.map(row => ({
      ...row,
      target_user_ids: row.target_user_ids ? JSON.parse(row.target_user_ids) : null,
      display_settings: row.display_settings ? JSON.parse(row.display_settings) : null,
      recurring_days_of_week: row.recurring_days_of_week ? JSON.parse(row.recurring_days_of_week) : null
    }));

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
    console.error('Error fetching notification history:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Mark all notifications as dismissed for current user
router.post('/dismiss-all', async (req, res) => {
  try {
    const { pool } = require('../config/database');
    
    await pool.execute(`
      UPDATE user_notification_deliveries 
      SET dismissed_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND dismissed_at IS NULL
    `, [req.user.id]);

    res.json({ success: true, message: 'All notifications dismissed' });
  } catch (error) {
    console.error('Error dismissing all notifications:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get notification count (unread/undismissed)
router.get('/count', async (req, res) => {
  try {
    const { pool } = require('../config/database');
    
    const [rows] = await pool.execute(`
      SELECT 
        COUNT(*) as total_active,
        COUNT(CASE WHEN und.viewed_at IS NULL THEN 1 END) as unviewed,
        COUNT(CASE WHEN und.dismissed_at IS NULL THEN 1 END) as undismissed
      FROM user_notification_deliveries und
      JOIN admin_notifications an ON und.admin_notification_id = an.id
      WHERE und.user_id = ? 
      AND an.is_active = TRUE 
      AND an.status = 'active'
    `, [req.user.id]);

    res.json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error('Error fetching notification count:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
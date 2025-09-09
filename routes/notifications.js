const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { auth: authenticate, requireAdmin: authorize } = require('../middleware/auth');
const emailService = require('../services/emailService');
const pushService = require('../services/pushService');
const { Notification, EmailTemplate, UnsubscribeToken, UserNotificationPreferences } = require('../models/Notification');
const { pool } = require('../config/database');

const router = express.Router();

// Middleware to check validation results
const checkValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// Get notification settings (Admin only)
router.get('/settings', authenticate, authorize, async (req, res) => {
  try {
    const { pool } = require('../config/database');
    const [settings] = await pool.execute(`
      SELECT setting_key, setting_value, description 
      FROM notification_settings 
      ORDER BY setting_key
    `);
    
    res.json({ settings });
  } catch (error) {
    console.error('Error fetching notification settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update notification settings (Admin only)
router.put('/settings', 
  authenticate, 
  authorize,
  [
    body('settings').isObject().withMessage('Settings must be an object')
  ],
  checkValidation,
  async (req, res) => {
    try {
      const { settings } = req.body;
      
      await emailService.updateSettings(settings);
      
      if (settings.push_public_key || settings.push_private_key) {
        await pushService.loadSettings();
      }
      
      res.json({ message: 'Settings updated successfully' });
    } catch (error) {
      console.error('Error updating notification settings:', error);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  }
);

// Generate VAPID keys for push notifications (Admin only)
router.post('/push/generate-keys', authenticate, authorize, async (req, res) => {
  try {
    const publicKey = await pushService.generateVapidKeys();
    res.json({ 
      message: 'VAPID keys generated successfully',
      publicKey 
    });
  } catch (error) {
    console.error('Error generating VAPID keys:', error);
    res.status(500).json({ error: 'Failed to generate VAPID keys' });
  }
});

// Get VAPID public key for push subscriptions
router.get('/push/public-key', authenticate, async (req, res) => {
  try {
    const publicKey = pushService.getPublicKey();
    res.json({ publicKey });
  } catch (error) {
    console.error('Error getting VAPID public key:', error);
    res.status(500).json({ error: 'Failed to get public key' });
  }
});

// Subscribe to push notifications
router.post('/push/subscribe',
  authenticate,
  [
    body('endpoint').notEmpty().withMessage('Endpoint is required'),
    body('keys.p256dh').notEmpty().withMessage('P256DH key is required'),
    body('keys.auth').notEmpty().withMessage('Auth key is required')
  ],
  checkValidation,
  async (req, res) => {
    try {
      const { endpoint, keys } = req.body;
      await pushService.subscribe(req.user.id, { endpoint, keys });
      res.json({ message: 'Subscribed to push notifications' });
    } catch (error) {
      console.error('Error subscribing to push notifications:', error);
      res.status(500).json({ error: 'Failed to subscribe' });
    }
  }
);

// Unsubscribe from push notifications
router.delete('/push/subscribe', authenticate, async (req, res) => {
  try {
    const { endpoint } = req.body;
    await pushService.unsubscribe(req.user.id, endpoint);
    res.json({ message: 'Unsubscribed from push notifications' });
  } catch (error) {
    console.error('Error unsubscribing from push notifications:', error);
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

// Get user's notification preferences
router.get('/preferences', authenticate, async (req, res) => {
  try {
    const preferences = await UserNotificationPreferences.findByUser(req.user.id);
    res.json({ preferences });
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

// Update user's notification preferences
router.put('/preferences',
  authenticate,
  [
    body('preferences').isObject().withMessage('Preferences must be an object')
  ],
  checkValidation,
  async (req, res) => {
    try {
      const { preferences } = req.body;
      await UserNotificationPreferences.update(req.user.id, preferences);
      res.json({ message: 'Notification preferences updated successfully' });
    } catch (error) {
      console.error('Error updating notification preferences:', error);
      res.status(500).json({ error: 'Failed to update preferences' });
    }
  }
);

// Get user's notifications
router.get('/my-notifications',
  authenticate,
  [
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative'),
    query('status').optional().isIn(['pending', 'sent', 'failed', 'scheduled']).withMessage('Invalid status'),
    query('type').optional().isIn(['email', 'push', 'both']).withMessage('Invalid type')
  ],
  checkValidation,
  async (req, res) => {
    try {
      const { limit = 20, offset = 0, status, type } = req.query;
      const notifications = await Notification.findByUser(req.user.id, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        status,
        type
      });
      
      res.json({ notifications });
    } catch (error) {
      console.error('Error fetching user notifications:', error);
      res.status(500).json({ error: 'Failed to fetch notifications' });
    }
  }
);

// Send test notification (Admin only)
router.post('/test',
  authenticate,
  authorize,
  [
    body('userId').isInt().withMessage('User ID must be an integer'),
    body('type').isIn(['email', 'push', 'both']).withMessage('Invalid type'),
    body('subject').optional().notEmpty().withMessage('Subject cannot be empty'),
    body('content').notEmpty().withMessage('Content is required')
  ],
  checkValidation,
  async (req, res) => {
    try {
      const { userId, type, subject, content } = req.body;
      
      // Get user details
      const { pool } = require('../config/database');
      const [users] = await pool.execute('SELECT * FROM users WHERE id = ?', [userId]);
      
      if (users.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const user = users[0];
      const notificationId = await Notification.create({
        userId,
        type,
        subject: subject || 'Test Notification',
        content,
        recipientEmail: user.email,
        priority: 'normal'
      });
      
      res.json({ 
        message: 'Test notification queued successfully',
        notificationId 
      });
    } catch (error) {
      console.error('Error sending test notification:', error);
      res.status(500).json({ error: 'Failed to send test notification' });
    }
  }
);

// Get all email templates (Admin only)
router.get('/templates', authenticate, authorize, async (req, res) => {
  try {
    const templates = await EmailTemplate.findAll();
    res.json({ templates });
  } catch (error) {
    console.error('Error fetching email templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Create email template (Admin only)
router.post('/templates',
  authenticate,
  authorize,
  [
    body('name').notEmpty().withMessage('Template name is required'),
    body('subject').notEmpty().withMessage('Subject is required'),
    body('html_template').notEmpty().withMessage('HTML template is required'),
    body('text_template').optional(),
    body('variables').optional().isArray().withMessage('Variables must be an array'),
    body('is_active').optional().isBoolean().withMessage('is_active must be boolean')
  ],
  checkValidation,
  async (req, res) => {
    try {
      const { name, subject, html_template, text_template, variables, is_active } = req.body;
      
      const templateId = await EmailTemplate.create({
        name,
        subject,
        htmlTemplate: html_template,
        textTemplate: text_template,
        variables,
        isActive: is_active
      });
      
      res.status(201).json({ 
        message: 'Email template created successfully',
        templateId 
      });
    } catch (error) {
      console.error('Error creating email template:', error);
      res.status(500).json({ error: 'Failed to create template' });
    }
  }
);

// Update email template (Admin only)
router.put('/templates/:id',
  authenticate,
  authorize,
  [
    body('name').optional().notEmpty().withMessage('Template name cannot be empty'),
    body('subject').optional().notEmpty().withMessage('Subject cannot be empty'),
    body('html_template').optional().notEmpty().withMessage('HTML template cannot be empty'),
    body('text_template').optional(),
    body('variables').optional().isArray().withMessage('Variables must be an array'),
    body('is_active').optional().isBoolean().withMessage('is_active must be boolean')
  ],
  checkValidation,
  async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      await EmailTemplate.update(id, updates);
      res.json({ message: 'Email template updated successfully' });
    } catch (error) {
      console.error('Error updating email template:', error);
      res.status(500).json({ error: 'Failed to update template' });
    }
  }
);

// Delete email template (Admin only)
router.delete('/templates/:id', authenticate, authorize, async (req, res) => {
  try {
    const { id } = req.params;
    await EmailTemplate.delete(id);
    res.json({ message: 'Email template deleted successfully' });
  } catch (error) {
    console.error('Error deleting email template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// Process pending notifications (Admin only) - can be called manually or via cron
router.post('/process-queue', authenticate, authorize, async (req, res) => {
  try {
    const { limit = 10 } = req.body;
    const results = await emailService.processPendingNotifications(limit);
    res.json({ 
      message: 'Notification queue processed',
      results 
    });
  } catch (error) {
    console.error('Error processing notification queue:', error);
    res.status(500).json({ error: 'Failed to process queue' });
  }
});

// Get notification statistics (Admin only)
router.get('/stats', authenticate, authorize, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const stats = await Notification.getStats(parseInt(days));
    res.json({ stats });
  } catch (error) {
    console.error('Error fetching notification stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Unsubscribe from emails via token
router.get('/unsubscribe/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const unsubscribeData = await UnsubscribeToken.findByToken(token);
    
    if (!unsubscribeData) {
      return res.status(404).send(`
        <html>
          <body>
            <h1>Invalid Link</h1>
            <p>This unsubscribe link is invalid or has expired.</p>
          </body>
        </html>
      `);
    }
    
    // Update user preferences to disable emails
    await UserNotificationPreferences.update(unsubscribeData.user_id, {
      email_marketing: false,
      email_job_updates: false,
      email_new_posts: false
    });
    
    res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 20px; text-align: center;">
          <h1>Successfully Unsubscribed</h1>
          <p>Hello ${unsubscribeData.first_name},</p>
          <p>You have been successfully unsubscribed from Dozyr email notifications.</p>
          <p>You can update your notification preferences anytime by logging into your account.</p>
          <a href="${process.env.CLIENT_URL || 'http://localhost:3001'}/auth/login" 
             style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
            Login to Account
          </a>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error processing unsubscribe:', error);
    res.status(500).send(`
      <html>
        <body>
          <h1>Error</h1>
          <p>An error occurred while processing your unsubscribe request.</p>
        </body>
      </html>
    `);
  }
});

// Clean up old notifications (Admin only)
router.delete('/cleanup', authenticate, authorize, async (req, res) => {
  try {
    const { days = 90 } = req.query;
    const deletedCount = await Notification.cleanup(parseInt(days));
    const expiredSubscriptions = await pushService.cleanupExpiredSubscriptions();
    
    res.json({ 
      message: 'Cleanup completed successfully',
      deletedNotifications: deletedCount,
      deletedSubscriptions: expiredSubscriptions
    });
  } catch (error) {
    console.error('Error during cleanup:', error);
    res.status(500).json({ error: 'Failed to cleanup' });
  }
});

// Mailing List Management Routes

// Get all mailing lists (Admin only)
router.get('/mailing-lists', authenticate, authorize, async (req, res) => {
  try {
    const [lists] = await pool.execute(`
      SELECT ml.*, u.first_name, u.last_name,
             COUNT(mls.id) as subscriber_count
      FROM mailing_lists ml
      LEFT JOIN users u ON ml.created_by = u.id
      LEFT JOIN mailing_list_subscribers mls ON ml.id = mls.list_id AND mls.status = 'subscribed'
      GROUP BY ml.id
      ORDER BY ml.created_at DESC
    `);
    
    res.json({ lists });
  } catch (error) {
    console.error('Error fetching mailing lists:', error);
    res.status(500).json({ error: 'Failed to fetch mailing lists' });
  }
});

// Create mailing list (Admin only)
router.post('/mailing-lists',
  authenticate,
  authorize,
  [
    body('name').notEmpty().withMessage('List name is required'),
    body('description').optional()
  ],
  checkValidation,
  async (req, res) => {
    try {
      const { name, description } = req.body;
      
      const [result] = await pool.execute(`
        INSERT INTO mailing_lists (name, description, created_by)
        VALUES (?, ?, ?)
      `, [name, description, req.user.id]);
      
      res.status(201).json({
        message: 'Mailing list created successfully',
        listId: result.insertId
      });
    } catch (error) {
      console.error('Error creating mailing list:', error);
      res.status(500).json({ error: 'Failed to create mailing list' });
    }
  }
);

// Update mailing list (Admin only)
router.put('/mailing-lists/:id',
  authenticate,
  authorize,
  [
    body('name').optional().notEmpty().withMessage('List name cannot be empty'),
    body('description').optional(),
    body('is_active').optional().isBoolean().withMessage('is_active must be boolean')
  ],
  checkValidation,
  async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const updateFields = [];
      const params = [];
      
      for (const [key, value] of Object.entries(updates)) {
        if (['name', 'description', 'is_active'].includes(key)) {
          updateFields.push(`${key} = ?`);
          params.push(value);
        }
      }
      
      if (updateFields.length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }
      
      params.push(id);
      
      await pool.execute(`
        UPDATE mailing_lists 
        SET ${updateFields.join(', ')}, updated_at = NOW()
        WHERE id = ?
      `, params);
      
      res.json({ message: 'Mailing list updated successfully' });
    } catch (error) {
      console.error('Error updating mailing list:', error);
      res.status(500).json({ error: 'Failed to update mailing list' });
    }
  }
);

// Delete mailing list (Admin only)
router.delete('/mailing-lists/:id', authenticate, authorize, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM mailing_lists WHERE id = ?', [id]);
    res.json({ message: 'Mailing list deleted successfully' });
  } catch (error) {
    console.error('Error deleting mailing list:', error);
    res.status(500).json({ error: 'Failed to delete mailing list' });
  }
});

// Get subscribers for a mailing list (Admin only)
router.get('/mailing-lists/:id/subscribers', authenticate, authorize, async (req, res) => {
  try {
    const { id } = req.params;
    
    const [subscribers] = await pool.execute(`
      SELECT mls.*, u.first_name, u.last_name, u.email, u.role
      FROM mailing_list_subscribers mls
      JOIN users u ON mls.user_id = u.id
      WHERE mls.list_id = ?
      ORDER BY mls.subscribed_at DESC
    `, [id]);
    
    res.json({ subscribers });
  } catch (error) {
    console.error('Error fetching mailing list subscribers:', error);
    res.status(500).json({ error: 'Failed to fetch subscribers' });
  }
});

// Add subscriber to mailing list (Admin only)
router.post('/mailing-lists/:id/subscribers',
  authenticate,
  authorize,
  [
    body('user_id').isInt().withMessage('User ID must be an integer')
  ],
  checkValidation,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { user_id } = req.body;
      
      // Get user email
      const [users] = await pool.execute('SELECT email FROM users WHERE id = ?', [user_id]);
      if (users.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const userEmail = users[0].email;
      
      await pool.execute(`
        INSERT INTO mailing_list_subscribers (list_id, user_id, email)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          status = 'subscribed',
          unsubscribed_at = NULL
      `, [id, user_id, userEmail]);
      
      res.json({ message: 'Subscriber added successfully' });
    } catch (error) {
      console.error('Error adding subscriber:', error);
      res.status(500).json({ error: 'Failed to add subscriber' });
    }
  }
);

// Remove subscriber from mailing list (Admin only)
router.delete('/mailing-lists/:id/subscribers/:userId', authenticate, authorize, async (req, res) => {
  try {
    const { id, userId } = req.params;
    
    await pool.execute(`
      UPDATE mailing_list_subscribers 
      SET status = 'unsubscribed', unsubscribed_at = NOW()
      WHERE list_id = ? AND user_id = ?
    `, [id, userId]);
    
    res.json({ message: 'Subscriber removed successfully' });
  } catch (error) {
    console.error('Error removing subscriber:', error);
    res.status(500).json({ error: 'Failed to remove subscriber' });
  }
});

// Send email campaign to mailing list (Admin only)
router.post('/mailing-lists/:id/send-campaign',
  authenticate,
  authorize,
  [
    body('subject').notEmpty().withMessage('Subject is required'),
    body('content').notEmpty().withMessage('Content is required'),
    body('template_id').optional().isInt().withMessage('Template ID must be an integer')
  ],
  checkValidation,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { subject, content, template_id } = req.body;
      
      // Get active subscribers
      const [subscribers] = await pool.execute(`
        SELECT mls.user_id, u.email, u.first_name, u.last_name
        FROM mailing_list_subscribers mls
        JOIN users u ON mls.user_id = u.id
        WHERE mls.list_id = ? AND mls.status = 'subscribed' AND u.is_active = true
      `, [id]);
      
      if (subscribers.length === 0) {
        return res.status(400).json({ error: 'No active subscribers found' });
      }
      
      // Create campaign record
      const [campaignResult] = await pool.execute(`
        INSERT INTO email_campaigns (name, subject, template_id, mailing_list_id, content, created_by, total_recipients)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [`Campaign ${new Date().toISOString()}`, subject, template_id, id, content, req.user.id, subscribers.length]);
      
      // Queue notifications for each subscriber
      let queuedCount = 0;
      for (const subscriber of subscribers) {
        try {
          await emailService.queueNotification({
            userId: subscriber.user_id,
            type: 'email',
            subject,
            content,
            recipientEmail: subscriber.email,
            variables: {
              firstName: subscriber.first_name,
              lastName: subscriber.last_name
            },
            priority: 'normal'
          });
          queuedCount++;
        } catch (error) {
          console.error(`Failed to queue notification for user ${subscriber.user_id}:`, error);
        }
      }
      
      // Update campaign with sent count
      await pool.execute(`
        UPDATE email_campaigns 
        SET sent_count = ?, status = 'sending'
        WHERE id = ?
      `, [queuedCount, campaignResult.insertId]);
      
      res.json({
        message: 'Email campaign queued successfully',
        campaignId: campaignResult.insertId,
        totalRecipients: subscribers.length,
        queuedCount
      });
    } catch (error) {
      console.error('Error sending email campaign:', error);
      res.status(500).json({ error: 'Failed to send email campaign' });
    }
  }
);

// Get email campaigns (Admin only)
router.get('/email-campaigns', authenticate, authorize, async (req, res) => {
  try {
    const [campaigns] = await pool.execute(`
      SELECT ec.*, ml.name as mailing_list_name, u.first_name, u.last_name
      FROM email_campaigns ec
      LEFT JOIN mailing_lists ml ON ec.mailing_list_id = ml.id
      LEFT JOIN users u ON ec.created_by = u.id
      ORDER BY ec.created_at DESC
    `);
    
    res.json({ campaigns });
  } catch (error) {
    console.error('Error fetching email campaigns:', error);
    res.status(500).json({ error: 'Failed to fetch email campaigns' });
  }
});

module.exports = router;
const { pool } = require('../config/database');
const crypto = require('crypto');

class Notification {
  static async create({ userId, type, templateName, recipientEmail, subject, content, variables, priority = 'normal', scheduledFor = null }) {
    try {
      const [result] = await pool.execute(`
        INSERT INTO notifications (
          user_id, type, template_name, recipient_email, subject,
          content, template_variables, priority, scheduled_for, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        userId, type, templateName, recipientEmail, subject,
        content, JSON.stringify(variables || {}), priority,
        scheduledFor, scheduledFor ? 'scheduled' : 'pending'
      ]);

      return result.insertId;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  static async findById(id) {
    try {
      const [rows] = await pool.execute(`
        SELECT n.*, u.email as user_email, u.first_name, u.last_name
        FROM notifications n
        JOIN users u ON n.user_id = u.id
        WHERE n.id = ?
      `, [id]);

      if (rows.length === 0) return null;

      const notification = rows[0];
      notification.template_variables = JSON.parse(notification.template_variables || '{}');
      return notification;
    } catch (error) {
      console.error('Error finding notification:', error);
      throw error;
    }
  }

  static async findByUser(userId, options = {}) {
    try {
      const { limit = 50, offset = 0, status, type } = options;
      
      let query = `
        SELECT * FROM notifications 
        WHERE user_id = ?
      `;
      let params = [userId];

      if (status) {
        query += ' AND status = ?';
        params.push(status);
      }

      if (type) {
        query += ' AND type = ?';
        params.push(type);
      }

      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const [rows] = await pool.execute(query, params);
      
      return rows.map(row => ({
        ...row,
        template_variables: JSON.parse(row.template_variables || '{}')
      }));
    } catch (error) {
      console.error('Error finding user notifications:', error);
      throw error;
    }
  }

  static async updateStatus(id, status, additionalData = {}) {
    try {
      let query = 'UPDATE notifications SET status = ?, updated_at = NOW()';
      let params = [status];

      if (status === 'sent') {
        query += ', sent_at = NOW()';
      }

      if (additionalData.failedReason) {
        query += ', failed_reason = ?';
        params.push(additionalData.failedReason);
      }

      if (additionalData.retryCount !== undefined) {
        query += ', retry_count = ?';
        params.push(additionalData.retryCount);
      }

      query += ' WHERE id = ?';
      params.push(id);

      await pool.execute(query, params);
      return true;
    } catch (error) {
      console.error('Error updating notification status:', error);
      throw error;
    }
  }

  static async getPendingNotifications(limit = 10) {
    try {
      const [rows] = await pool.execute(`
        SELECT n.*, u.email as user_email, u.first_name, u.last_name
        FROM notifications n
        JOIN users u ON n.user_id = u.id
        WHERE n.status = 'pending' 
        OR (n.status = 'scheduled' AND n.scheduled_for <= NOW())
        ORDER BY 
          CASE n.priority 
            WHEN 'urgent' THEN 1
            WHEN 'high' THEN 2  
            WHEN 'normal' THEN 3
            WHEN 'low' THEN 4
          END ASC,
          n.created_at ASC
        LIMIT ?
      `, [limit]);

      return rows.map(row => ({
        ...row,
        template_variables: JSON.parse(row.template_variables || '{}')
      }));
    } catch (error) {
      console.error('Error getting pending notifications:', error);
      throw error;
    }
  }

  static async getStats(days = 30) {
    try {
      const [rows] = await pool.execute(`
        SELECT 
          status,
          type,
          COUNT(*) as count,
          DATE(created_at) as date
        FROM notifications 
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        GROUP BY status, type, DATE(created_at)
        ORDER BY date DESC, status, type
      `, [days]);

      return rows;
    } catch (error) {
      console.error('Error getting notification stats:', error);
      throw error;
    }
  }

  static async cleanup(olderThanDays = 90) {
    try {
      const [result] = await pool.execute(`
        DELETE FROM notifications 
        WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
        AND status IN ('sent', 'failed')
      `, [olderThanDays]);

      return result.affectedRows;
    } catch (error) {
      console.error('Error cleaning up old notifications:', error);
      throw error;
    }
  }
}

class EmailTemplate {
  static async create({ name, subject, htmlTemplate, textTemplate, variables, isActive = true }) {
    try {
      const [result] = await pool.execute(`
        INSERT INTO email_templates (name, subject, html_template, text_template, variables, is_active)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [name, subject, htmlTemplate, textTemplate, JSON.stringify(variables || []), isActive]);

      return result.insertId;
    } catch (error) {
      console.error('Error creating email template:', error);
      throw error;
    }
  }

  static async findByName(name) {
    try {
      const [rows] = await pool.execute(`
        SELECT * FROM email_templates WHERE name = ? AND is_active = true
      `, [name]);

      if (rows.length === 0) return null;

      const template = rows[0];
      template.variables = JSON.parse(template.variables || '[]');
      return template;
    } catch (error) {
      console.error('Error finding email template:', error);
      throw error;
    }
  }

  static async findAll() {
    try {
      const [rows] = await pool.execute(`
        SELECT * FROM email_templates ORDER BY name
      `);

      return rows.map(template => {
        let variables = [];
        try {
          variables = JSON.parse(template.variables || '[]');
        } catch (jsonError) {
          console.error('Error parsing template variables for template ID:', template.id, 'Error:', jsonError.message);
          console.error('Invalid JSON data:', template.variables);
          // Try to fix common JSON issues
          if (typeof template.variables === 'string') {
            // If it looks like a comma-separated list, convert to array
            if (template.variables.includes(',') && !template.variables.includes('[')) {
              variables = template.variables.split(',').map(v => v.trim()).filter(v => v.length > 0);
            } else {
              variables = [];
            }
          }
        }
        
        return {
          ...template,
          variables
        };
      });
    } catch (error) {
      console.error('Error finding all email templates:', error);
      throw error;
    }
  }

  static async update(id, updates) {
    try {
      const allowedFields = ['name', 'subject', 'html_template', 'text_template', 'variables', 'is_active'];
      const updateFields = [];
      const params = [];

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          updateFields.push(`${key} = ?`);
          params.push(key === 'variables' ? JSON.stringify(value) : value);
        }
      }

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      params.push(id);
      
      await pool.execute(`
        UPDATE email_templates 
        SET ${updateFields.join(', ')}, updated_at = NOW()
        WHERE id = ?
      `, params);

      return true;
    } catch (error) {
      console.error('Error updating email template:', error);
      throw error;
    }
  }

  static async delete(id) {
    try {
      await pool.execute('DELETE FROM email_templates WHERE id = ?', [id]);
      return true;
    } catch (error) {
      console.error('Error deleting email template:', error);
      throw error;
    }
  }
}

class UnsubscribeToken {
  static async create(userId, email, type = 'all', specificType = null) {
    try {
      const token = crypto.randomBytes(32).toString('hex');
      
      await pool.execute(`
        INSERT INTO email_unsubscribes (user_id, email, unsubscribe_token, unsubscribed_from, specific_type)
        VALUES (?, ?, ?, ?, ?)
      `, [userId, email, token, type, specificType]);

      return token;
    } catch (error) {
      console.error('Error creating unsubscribe token:', error);
      throw error;
    }
  }

  static async findByToken(token) {
    try {
      const [rows] = await pool.execute(`
        SELECT u.*, us.first_name, us.last_name
        FROM email_unsubscribes u
        JOIN users us ON u.user_id = us.id
        WHERE u.unsubscribe_token = ?
      `, [token]);

      return rows[0] || null;
    } catch (error) {
      console.error('Error finding unsubscribe token:', error);
      throw error;
    }
  }

  static async isUnsubscribed(userId, type = 'all') {
    try {
      const [rows] = await pool.execute(`
        SELECT 1 FROM email_unsubscribes 
        WHERE user_id = ? AND (unsubscribed_from = 'all' OR unsubscribed_from = ?)
      `, [userId, type]);

      return rows.length > 0;
    } catch (error) {
      console.error('Error checking unsubscribe status:', error);
      throw error;
    }
  }
}

class UserNotificationPreferences {
  static async create(userId, preferences = {}) {
    try {
      const defaultPrefs = {
        email_welcome: true,
        email_verification: true,
        email_invoices: true,
        email_job_feedback: true,
        email_new_posts: true,
        email_job_updates: true,
        email_proposal_updates: true,
        email_messages: true,
        email_marketing: false,
        push_notifications: true,
        push_job_updates: true,
        push_messages: true
      };

      const finalPrefs = { ...defaultPrefs, ...preferences };
      
      const [result] = await pool.execute(`
        INSERT INTO user_notification_preferences (
          user_id, email_welcome, email_verification, email_invoices,
          email_job_feedback, email_new_posts, email_job_updates,
          email_proposal_updates, email_messages, email_marketing,
          push_notifications, push_job_updates, push_messages
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          email_welcome = VALUES(email_welcome),
          email_verification = VALUES(email_verification),
          email_invoices = VALUES(email_invoices),
          email_job_feedback = VALUES(email_job_feedback),
          email_new_posts = VALUES(email_new_posts),
          email_job_updates = VALUES(email_job_updates),
          email_proposal_updates = VALUES(email_proposal_updates),
          email_messages = VALUES(email_messages),
          email_marketing = VALUES(email_marketing),
          push_notifications = VALUES(push_notifications),
          push_job_updates = VALUES(push_job_updates),
          push_messages = VALUES(push_messages),
          updated_at = NOW()
      `, [
        userId, finalPrefs.email_welcome, finalPrefs.email_verification,
        finalPrefs.email_invoices, finalPrefs.email_job_feedback,
        finalPrefs.email_new_posts, finalPrefs.email_job_updates,
        finalPrefs.email_proposal_updates, finalPrefs.email_messages,
        finalPrefs.email_marketing, finalPrefs.push_notifications,
        finalPrefs.push_job_updates, finalPrefs.push_messages
      ]);

      return result.insertId;
    } catch (error) {
      console.error('Error creating notification preferences:', error);
      throw error;
    }
  }

  static async findByUser(userId) {
    try {
      const [rows] = await pool.execute(`
        SELECT * FROM user_notification_preferences WHERE user_id = ?
      `, [userId]);

      if (rows.length === 0) {
        await this.create(userId);
        return this.findByUser(userId);
      }

      return rows[0];
    } catch (error) {
      console.error('Error finding notification preferences:', error);
      throw error;
    }
  }

  static async update(userId, preferences) {
    try {
      const allowedFields = [
        'email_welcome', 'email_verification', 'email_invoices',
        'email_job_feedback', 'email_new_posts', 'email_job_updates',
        'email_proposal_updates', 'email_messages', 'email_marketing',
        'push_notifications', 'push_job_updates', 'push_messages'
      ];

      const updateFields = [];
      const params = [];

      for (const [key, value] of Object.entries(preferences)) {
        if (allowedFields.includes(key)) {
          updateFields.push(`${key} = ?`);
          params.push(value);
        }
      }

      if (updateFields.length === 0) {
        throw new Error('No valid preferences to update');
      }

      params.push(userId);

      await pool.execute(`
        UPDATE user_notification_preferences 
        SET ${updateFields.join(', ')}, updated_at = NOW()
        WHERE user_id = ?
      `, params);

      return true;
    } catch (error) {
      console.error('Error updating notification preferences:', error);
      throw error;
    }
  }
}

module.exports = {
  Notification,
  EmailTemplate,
  UnsubscribeToken,
  UserNotificationPreferences
};
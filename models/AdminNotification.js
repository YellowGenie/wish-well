const { pool } = require('../config/database');

class AdminNotification {
  static async create(notificationData) {
    const {
      created_by,
      title,
      message,
      notification_type = 'modal',
      target_audience = 'both',
      target_user_ids = null,
      priority = 'normal',
      display_settings = null,
      modal_size = 'medium',
      schedule_type = 'immediate',
      scheduled_at = null,
      timezone = 'UTC',
      recurring_pattern = null,
      recurring_interval = 1,
      recurring_days_of_week = null,
      recurring_end_date = null,
      max_occurrences = null
    } = notificationData;

    try {
      const [result] = await pool.execute(`
        INSERT INTO admin_notifications (
          created_by, title, message, notification_type, target_audience,
          target_user_ids, priority, display_settings, modal_size,
          schedule_type, scheduled_at, timezone, recurring_pattern,
          recurring_interval, recurring_days_of_week, recurring_end_date,
          max_occurrences, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        created_by, title, message, notification_type, target_audience,
        JSON.stringify(target_user_ids), priority, JSON.stringify(display_settings),
        modal_size, schedule_type, scheduled_at, timezone, recurring_pattern,
        recurring_interval, JSON.stringify(recurring_days_of_week),
        recurring_end_date, max_occurrences,
        schedule_type === 'immediate' ? 'active' : 'scheduled'
      ]);

      return result.insertId;
    } catch (error) {
      console.error('Error creating admin notification:', error);
      throw error;
    }
  }

  static async findById(id) {
    try {
      const [rows] = await pool.execute(`
        SELECT an.*, u.first_name, u.last_name, u.email as creator_email
        FROM admin_notifications an
        JOIN users u ON an.created_by = u.id
        WHERE an.id = ?
      `, [id]);

      if (rows.length === 0) return null;

      const notification = rows[0];
      notification.target_user_ids = notification.target_user_ids ? JSON.parse(notification.target_user_ids) : null;
      notification.display_settings = notification.display_settings ? JSON.parse(notification.display_settings) : null;
      notification.recurring_days_of_week = notification.recurring_days_of_week ? JSON.parse(notification.recurring_days_of_week) : null;

      return notification;
    } catch (error) {
      console.error('Error finding admin notification:', error);
      throw error;
    }
  }

  static async findAll(options = {}) {
    const {
      limit = 50,
      offset = 0,
      status = null,
      created_by = null,
      target_audience = null,
      priority = null,
      search = null,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = options;

    try {
      let query = `
        SELECT an.*, u.first_name, u.last_name, u.email as creator_email,
               COUNT(und.id) as total_deliveries,
               COUNT(CASE WHEN und.viewed_at IS NOT NULL THEN 1 END) as total_views,
               COUNT(CASE WHEN und.dismissed_at IS NOT NULL THEN 1 END) as total_dismissals
        FROM admin_notifications an
        JOIN users u ON an.created_by = u.id
        LEFT JOIN user_notification_deliveries und ON an.id = und.admin_notification_id
        WHERE 1=1
      `;
      const params = [];

      if (status) {
        query += ' AND an.status = ?';
        params.push(status);
      }

      if (created_by) {
        query += ' AND an.created_by = ?';
        params.push(created_by);
      }

      if (target_audience) {
        query += ' AND an.target_audience = ?';
        params.push(target_audience);
      }

      if (priority) {
        query += ' AND an.priority = ?';
        params.push(priority);
      }

      if (search) {
        query += ' AND (an.title LIKE ? OR an.message LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }

      query += ` GROUP BY an.id ORDER BY an.${sort_by} ${sort_order} LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const [rows] = await pool.execute(query, params);

      return rows.map(notification => ({
        ...notification,
        target_user_ids: notification.target_user_ids ? JSON.parse(notification.target_user_ids) : null,
        display_settings: notification.display_settings ? JSON.parse(notification.display_settings) : null,
        recurring_days_of_week: notification.recurring_days_of_week ? JSON.parse(notification.recurring_days_of_week) : null
      }));
    } catch (error) {
      console.error('Error finding admin notifications:', error);
      throw error;
    }
  }

  static async update(id, updateData) {
    const allowedFields = [
      'title', 'message', 'notification_type', 'target_audience',
      'target_user_ids', 'priority', 'display_settings', 'modal_size',
      'schedule_type', 'scheduled_at', 'timezone', 'recurring_pattern',
      'recurring_interval', 'recurring_days_of_week', 'recurring_end_date',
      'max_occurrences', 'status', 'is_active'
    ];

    const fields = [];
    const values = [];

    Object.keys(updateData).forEach(key => {
      if (allowedFields.includes(key) && updateData[key] !== undefined) {
        fields.push(`${key} = ?`);
        
        // JSON fields need to be stringified
        if (['target_user_ids', 'display_settings', 'recurring_days_of_week'].includes(key)) {
          values.push(JSON.stringify(updateData[key]));
        } else {
          values.push(updateData[key]);
        }
      }
    });

    if (fields.length === 0) return false;

    values.push(id);

    try {
      const [result] = await pool.execute(
        `UPDATE admin_notifications SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        values
      );

      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error updating admin notification:', error);
      throw error;
    }
  }

  static async delete(id) {
    try {
      const [result] = await pool.execute(
        'DELETE FROM admin_notifications WHERE id = ?',
        [id]
      );

      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error deleting admin notification:', error);
      throw error;
    }
  }

  static async getActiveNotificationsForUser(userId, userRole) {
    try {
      const [rows] = await pool.execute(`
        SELECT an.*, und.delivered_at, und.viewed_at, und.dismissed_at
        FROM admin_notifications an
        LEFT JOIN user_notification_deliveries und ON (
          an.id = und.admin_notification_id AND und.user_id = ?
        )
        WHERE an.is_active = TRUE 
        AND an.status = 'active'
        AND (
          an.target_audience = 'both' 
          OR an.target_audience = ?
          OR (an.target_audience = 'specific_users' AND JSON_CONTAINS(an.target_user_ids, JSON_QUOTE(?)))
        )
        AND (
          und.id IS NULL 
          OR (an.schedule_type = 'recurring' AND und.dismissed_at IS NOT NULL)
        )
        ORDER BY 
          CASE an.priority 
            WHEN 'urgent' THEN 1
            WHEN 'high' THEN 2
            WHEN 'normal' THEN 3
            WHEN 'low' THEN 4
          END ASC,
          an.created_at DESC
      `, [userId, userRole, userId.toString()]);

      return rows.map(notification => ({
        ...notification,
        target_user_ids: notification.target_user_ids ? JSON.parse(notification.target_user_ids) : null,
        display_settings: notification.display_settings ? JSON.parse(notification.display_settings) : null,
        recurring_days_of_week: notification.recurring_days_of_week ? JSON.parse(notification.recurring_days_of_week) : null
      }));
    } catch (error) {
      console.error('Error getting active notifications for user:', error);
      throw error;
    }
  }

  static async markAsDelivered(notificationId, userId, deliveryData = {}) {
    const {
      delivery_method = 'modal',
      device_type = null,
      user_agent = null,
      ip_address = null
    } = deliveryData;

    try {
      await pool.execute(`
        INSERT INTO user_notification_deliveries (
          admin_notification_id, user_id, delivery_method,
          device_type, user_agent, ip_address
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          delivered_at = CURRENT_TIMESTAMP,
          delivery_method = VALUES(delivery_method),
          device_type = VALUES(device_type),
          user_agent = VALUES(user_agent),
          ip_address = VALUES(ip_address)
      `, [notificationId, userId, delivery_method, device_type, user_agent, ip_address]);

      // Update notification stats
      await pool.execute(`
        UPDATE admin_notifications 
        SET total_delivered = total_delivered + 1 
        WHERE id = ? AND (
          SELECT COUNT(*) FROM user_notification_deliveries 
          WHERE admin_notification_id = ? AND user_id = ? AND delivered_at = (
            SELECT MAX(delivered_at) FROM user_notification_deliveries 
            WHERE admin_notification_id = ? AND user_id = ?
          )
        ) = 1
      `, [notificationId, notificationId, userId, notificationId, userId]);

    } catch (error) {
      console.error('Error marking notification as delivered:', error);
      throw error;
    }
  }

  static async markAsViewed(notificationId, userId, interactionData = {}) {
    try {
      await pool.execute(`
        UPDATE user_notification_deliveries 
        SET viewed_at = CURRENT_TIMESTAMP, interaction_data = ?
        WHERE admin_notification_id = ? AND user_id = ? AND viewed_at IS NULL
      `, [JSON.stringify(interactionData), notificationId, userId]);

      // Update notification stats
      await pool.execute(`
        UPDATE admin_notifications 
        SET total_viewed = total_viewed + 1 
        WHERE id = ?
      `, [notificationId]);

    } catch (error) {
      console.error('Error marking notification as viewed:', error);
      throw error;
    }
  }

  static async markAsDismissed(notificationId, userId, interactionData = {}) {
    try {
      await pool.execute(`
        UPDATE user_notification_deliveries 
        SET dismissed_at = CURRENT_TIMESTAMP, interaction_data = JSON_MERGE(COALESCE(interaction_data, '{}'), ?)
        WHERE admin_notification_id = ? AND user_id = ?
      `, [JSON.stringify(interactionData), notificationId, userId]);

      // Update notification stats
      await pool.execute(`
        UPDATE admin_notifications 
        SET total_dismissed = total_dismissed + 1 
        WHERE id = ?
      `, [notificationId]);

    } catch (error) {
      console.error('Error marking notification as dismissed:', error);
      throw error;
    }
  }

  static async markAsClicked(notificationId, userId, clickData = {}) {
    try {
      await pool.execute(`
        UPDATE user_notification_deliveries 
        SET clicked_at = CURRENT_TIMESTAMP, interaction_data = JSON_MERGE(COALESCE(interaction_data, '{}'), ?)
        WHERE admin_notification_id = ? AND user_id = ?
      `, [JSON.stringify({ click_data: clickData }), notificationId, userId]);

      // Update notification stats
      await pool.execute(`
        UPDATE admin_notifications 
        SET total_clicked = total_clicked + 1 
        WHERE id = ?
      `, [notificationId]);

    } catch (error) {
      console.error('Error marking notification as clicked:', error);
      throw error;
    }
  }

  static async getScheduledNotifications(limit = 50) {
    try {
      // Check if table exists first
      try {
        await pool.execute('SELECT 1 FROM admin_notifications LIMIT 1');
      } catch (tableError) {
        console.log('Admin notifications table does not exist yet, returning empty array');
        return [];
      }

      // Ensure limit is a number and within bounds
      const safeLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 1000);
      
      const query = `
        SELECT * FROM admin_notifications 
        WHERE status = 'scheduled' 
        AND scheduled_at <= NOW()
        AND is_active = TRUE
        ORDER BY 
          CASE priority 
            WHEN 'urgent' THEN 1
            WHEN 'high' THEN 2
            WHEN 'normal' THEN 3
            WHEN 'low' THEN 4
          END ASC, 
          scheduled_at ASC
        LIMIT ?
      `;
      
      const [rows] = await pool.execute(query, [safeLimit]);

      return rows.map(notification => {
        try {
          return {
            ...notification,
            target_user_ids: notification.target_user_ids ? JSON.parse(notification.target_user_ids) : null,
            display_settings: notification.display_settings ? JSON.parse(notification.display_settings) : null,
            recurring_days_of_week: notification.recurring_days_of_week ? JSON.parse(notification.recurring_days_of_week) : null
          };
        } catch (jsonError) {
          console.error('Error parsing JSON for notification:', notification.id, jsonError);
          return {
            ...notification,
            target_user_ids: null,
            display_settings: null,
            recurring_days_of_week: null
          };
        }
      });
    } catch (error) {
      console.error('Error getting scheduled notifications:', error);
      return []; // Return empty array instead of throwing
    }
  }

  static async getAnalytics(notificationId, dateRange = '30') {
    try {
      const [rows] = await pool.execute(`
        SELECT 
          DATE(und.delivered_at) as date,
          COUNT(und.id) as deliveries,
          COUNT(CASE WHEN und.viewed_at IS NOT NULL THEN 1 END) as views,
          COUNT(CASE WHEN und.dismissed_at IS NOT NULL THEN 1 END) as dismissals,
          COUNT(CASE WHEN und.clicked_at IS NOT NULL THEN 1 END) as clicks,
          AVG(TIMESTAMPDIFF(SECOND, und.delivered_at, und.viewed_at)) as avg_time_to_view,
          AVG(TIMESTAMPDIFF(SECOND, und.viewed_at, und.dismissed_at)) as avg_view_duration
        FROM user_notification_deliveries und
        WHERE und.admin_notification_id = ?
        AND und.delivered_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        GROUP BY DATE(und.delivered_at)
        ORDER BY date DESC
      `, [notificationId, parseInt(dateRange)]);

      return rows;
    } catch (error) {
      console.error('Error getting notification analytics:', error);
      throw error;
    }
  }
}

module.exports = AdminNotification;
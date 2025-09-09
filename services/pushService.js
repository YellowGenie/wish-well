const webpush = require('web-push');
const { pool } = require('../config/database');

class PushService {
  constructor() {
    this.vapidKeys = null;
    this.isConfigured = false;
  }

  async loadSettings() {
    try {
      const [rows] = await pool.execute(`
        SELECT setting_key, setting_value 
        FROM notification_settings 
        WHERE setting_key IN ('push_public_key', 'push_private_key')
      `);
      
      const settings = rows.reduce((acc, row) => {
        acc[row.setting_key] = row.setting_value;
        return acc;
      }, {});
      
      if (settings.push_public_key && settings.push_private_key) {
        this.vapidKeys = {
          publicKey: settings.push_public_key,
          privateKey: settings.push_private_key
        };
        
        webpush.setVapidDetails(
          'mailto:admin@dozyr.com',
          this.vapidKeys.publicKey,
          this.vapidKeys.privateKey
        );
        
        this.isConfigured = true;
        console.log('✅ Push notification service configured');
      } else {
        console.warn('⚠️ Push notification VAPID keys not configured');
      }
    } catch (error) {
      console.error('Error loading push settings:', error);
      throw error;
    }
  }

  async generateVapidKeys() {
    try {
      const vapidKeys = webpush.generateVAPIDKeys();
      
      await pool.execute(`
        INSERT INTO notification_settings (setting_key, setting_value) 
        VALUES (?, ?), (?, ?)
        ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
      `, [
        'push_public_key', vapidKeys.publicKey,
        'push_private_key', vapidKeys.privateKey
      ]);
      
      await this.loadSettings();
      return vapidKeys.publicKey;
    } catch (error) {
      console.error('Error generating VAPID keys:', error);
      throw error;
    }
  }

  async subscribe(userId, subscription) {
    try {
      const { endpoint, keys } = subscription;
      
      await pool.execute(`
        INSERT INTO push_subscriptions (user_id, endpoint, p256dh_key, auth_key)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          p256dh_key = VALUES(p256dh_key),
          auth_key = VALUES(auth_key),
          is_active = true,
          updated_at = NOW()
      `, [userId, endpoint, keys.p256dh, keys.auth]);
      
      console.log(`✅ Push subscription added for user ${userId}`);
      return true;
    } catch (error) {
      console.error('Error saving push subscription:', error);
      throw error;
    }
  }

  async unsubscribe(userId, endpoint = null) {
    try {
      let query = 'UPDATE push_subscriptions SET is_active = false WHERE user_id = ?';
      let params = [userId];
      
      if (endpoint) {
        query += ' AND endpoint = ?';
        params.push(endpoint);
      }
      
      await pool.execute(query, params);
      console.log(`✅ Push subscription deactivated for user ${userId}`);
      return true;
    } catch (error) {
      console.error('Error unsubscribing from push notifications:', error);
      throw error;
    }
  }

  async getUserSubscriptions(userId) {
    try {
      const [rows] = await pool.execute(`
        SELECT endpoint, p256dh_key, auth_key
        FROM push_subscriptions 
        WHERE user_id = ? AND is_active = true
      `, [userId]);
      
      return rows.map(row => ({
        endpoint: row.endpoint,
        keys: {
          p256dh: row.p256dh_key,
          auth: row.auth_key
        }
      }));
    } catch (error) {
      console.error('Error fetching user subscriptions:', error);
      throw error;
    }
  }

  async sendNotification(userId, payload) {
    try {
      if (!this.isConfigured) {
        console.warn('Push notifications not configured');
        return { success: false, error: 'Push service not configured' };
      }

      const subscriptions = await this.getUserSubscriptions(userId);
      if (subscriptions.length === 0) {
        return { success: false, error: 'No active subscriptions found' };
      }

      const results = [];
      const payloadString = JSON.stringify(payload);

      for (const subscription of subscriptions) {
        try {
          await webpush.sendNotification(subscription, payloadString);
          results.push({ endpoint: subscription.endpoint, success: true });
        } catch (error) {
          console.error('Push notification failed:', error);
          results.push({ 
            endpoint: subscription.endpoint, 
            success: false, 
            error: error.message 
          });

          if (error.statusCode === 410 || error.statusCode === 404) {
            await this.unsubscribe(userId, subscription.endpoint);
          }
        }
      }

      return { 
        success: results.some(r => r.success), 
        results 
      };
    } catch (error) {
      console.error('Error sending push notification:', error);
      return { success: false, error: error.message };
    }
  }

  async sendJobUpdateNotification(userId, jobData) {
    const payload = {
      title: 'Job Update',
      body: `Update on "${jobData.title}"`,
      icon: '/icons/job-update.png',
      badge: '/icons/badge.png',
      tag: `job-${jobData.id}`,
      data: {
        type: 'job_update',
        jobId: jobData.id,
        url: `/jobs/${jobData.id}`
      }
    };

    return await this.sendNotification(userId, payload);
  }

  async sendMessageNotification(userId, messageData) {
    const payload = {
      title: 'New Message',
      body: `${messageData.senderName}: ${messageData.message.substring(0, 50)}...`,
      icon: '/icons/message.png',
      badge: '/icons/badge.png',
      tag: `message-${messageData.jobId}`,
      data: {
        type: 'message',
        jobId: messageData.jobId,
        senderId: messageData.senderId,
        url: `/jobs/${messageData.jobId}/messages`
      }
    };

    return await this.sendNotification(userId, payload);
  }

  async sendProposalNotification(userId, proposalData) {
    const payload = {
      title: 'Proposal Update',
      body: `Your proposal for "${proposalData.jobTitle}" has been ${proposalData.status}`,
      icon: '/icons/proposal.png',
      badge: '/icons/badge.png',
      tag: `proposal-${proposalData.id}`,
      data: {
        type: 'proposal_update',
        proposalId: proposalData.id,
        jobId: proposalData.jobId,
        url: `/proposals/${proposalData.id}`
      }
    };

    return await this.sendNotification(userId, payload);
  }

  getPublicKey() {
    return this.vapidKeys?.publicKey || null;
  }

  async cleanupExpiredSubscriptions() {
    try {
      const [result] = await pool.execute(`
        DELETE FROM push_subscriptions 
        WHERE updated_at < DATE_SUB(NOW(), INTERVAL 30 DAY) 
        AND is_active = false
      `);
      
      console.log(`Cleaned up ${result.affectedRows} expired push subscriptions`);
      return result.affectedRows;
    } catch (error) {
      console.error('Error cleaning up expired subscriptions:', error);
      throw error;
    }
  }
}

module.exports = new PushService();
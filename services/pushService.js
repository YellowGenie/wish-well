const webpush = require('web-push');

class PushService {
  constructor() {
    this.initialized = false;
    console.log('✅ PushService initialized (simplified for MongoDB migration)');
  }

  async initialize() {
    try {
      // Set VAPID details from environment variables
      if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        webpush.setVapidDetails(
          process.env.VAPID_SUBJECT || 'mailto:admin@dozyr.com',
          process.env.VAPID_PUBLIC_KEY,
          process.env.VAPID_PRIVATE_KEY
        );
        this.initialized = true;
        console.log('✅ Push service initialized with VAPID keys');
      } else {
        console.log('⚠️ VAPID keys not configured, push notifications disabled');
      }
    } catch (error) {
      console.error('❌ Error initializing push service:', error);
    }
  }

  async sendPushNotification(subscription, payload) {
    if (!this.initialized) {
      console.log('⚠️ Push service not initialized, skipping notification');
      return { success: false, error: 'Push service not configured' };
    }

    try {
      const result = await webpush.sendNotification(subscription, JSON.stringify(payload));
      console.log('✅ Push notification sent successfully');
      return { success: true, result };
    } catch (error) {
      console.error('❌ Error sending push notification:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new PushService();
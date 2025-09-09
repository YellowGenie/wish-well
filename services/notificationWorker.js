const emailService = require('./emailService');

class NotificationWorker {
  constructor() {
    this.isRunning = false;
    this.interval = null;
    this.processInterval = 30000; // 30 seconds
  }

  start() {
    if (this.isRunning) {
      console.log('📧 Notification worker is already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting notification worker...');
    
    // Process notifications immediately on start
    this.processQueue();
    
    // Set up interval to process queue regularly
    this.interval = setInterval(() => {
      this.processQueue();
    }, this.processInterval);
  }

  stop() {
    if (!this.isRunning) {
      console.log('📧 Notification worker is not running');
      return;
    }

    this.isRunning = false;
    
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    
    console.log('🛑 Notification worker stopped');
  }

  async processQueue() {
    try {
      const results = await emailService.processPendingNotifications(20);
      
      if (results.length > 0) {
        const sent = results.filter(r => r.status === 'sent').length;
        const failed = results.filter(r => r.status === 'failed').length;
        const retries = results.filter(r => r.status === 'retry').length;
        
        console.log(`📧 Processed ${results.length} notifications: ${sent} sent, ${failed} failed, ${retries} retrying`);
      }
    } catch (error) {
      console.error('❌ Error in notification worker:', error);
    }
  }

  setProcessInterval(milliseconds) {
    this.processInterval = milliseconds;
    
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      processInterval: this.processInterval,
      nextProcessIn: this.isRunning ? this.processInterval : null
    };
  }
}

// Create singleton instance
const notificationWorker = new NotificationWorker();

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('📧 Shutting down notification worker...');
  notificationWorker.stop();
});

process.on('SIGINT', () => {
  console.log('📧 Shutting down notification worker...');
  notificationWorker.stop();
});

module.exports = notificationWorker;
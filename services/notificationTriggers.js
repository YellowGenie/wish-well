const emailService = require('./emailService');
const pushService = require('./pushService');

class NotificationTriggers {
  constructor() {
    console.log('✅ NotificationTriggers service initialized (simplified for MongoDB migration)');
  }

  async triggerWelcomeEmail(userId, userData) {
    console.log('⚠️ NotificationTriggers: Welcome email trigger not yet implemented for MongoDB');
    return { success: true };
  }

  async triggerJobPostedNotification(jobId, jobData) {
    console.log('⚠️ NotificationTriggers: Job posted notification not yet implemented for MongoDB');
    return { success: true };
  }

  async triggerProposalNotification(proposalId, proposalData) {
    console.log('⚠️ NotificationTriggers: Proposal notification not yet implemented for MongoDB');
    return { success: true };
  }

  async triggerEmailVerification(email, verificationCode, firstName) {
    try {
      return await emailService.sendVerificationEmail(email, verificationCode, firstName);
    } catch (error) {
      console.error('❌ Error triggering email verification:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new NotificationTriggers();
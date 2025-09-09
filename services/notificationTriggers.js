const emailService = require('./emailService');
const pushService = require('./pushService');
const { UserNotificationPreferences } = require('../models/Notification');

class NotificationTriggers {
  async onUserRegistration(user) {
    try {
      // Create default notification preferences for new user
      await UserNotificationPreferences.create(user.id);
      
      // Send welcome email
      const preferences = await UserNotificationPreferences.findByUser(user.id);
      if (preferences.email_welcome) {
        await emailService.sendWelcomeEmail(user);
        console.log(`✅ Welcome email queued for user ${user.id}`);
      }
    } catch (error) {
      console.error('Error in user registration notification trigger:', error);
    }
  }

  async onEmailVerificationRequest(user, verificationToken) {
    try {
      const preferences = await UserNotificationPreferences.findByUser(user.id);
      if (preferences.email_verification) {
        await emailService.sendVerificationEmail(user, verificationToken);
        console.log(`✅ Email verification queued for user ${user.id}`);
      }
    } catch (error) {
      console.error('Error in email verification notification trigger:', error);
    }
  }

  async onJobPostCreated(manager, job) {
    try {
      const preferences = await UserNotificationPreferences.findByUser(manager.id);
      
      // Send confirmation email to manager
      if (preferences.email_job_updates) {
        const variables = {
          firstName: manager.first_name,
          jobTitle: job.title,
          jobUrl: `${process.env.CLIENT_URL || 'http://localhost:3001'}/jobs/${job.id}`,
          status: 'created'
        };

        await emailService.queueNotification({
          userId: manager.id,
          templateName: 'job_feedback',
          recipientEmail: manager.email,
          variables,
          priority: 'normal'
        });
      }

      // Send push notification
      if (preferences.push_job_updates) {
        await pushService.sendJobUpdateNotification(manager.id, {
          id: job.id,
          title: job.title,
          message: 'Your job post has been created successfully'
        });
      }
    } catch (error) {
      console.error('Error in job post created notification trigger:', error);
    }
  }

  async onJobPostApproved(manager, job) {
    try {
      const preferences = await UserNotificationPreferences.findByUser(manager.id);
      
      if (preferences.email_new_posts) {
        await emailService.sendNewPostApprovedEmail(manager, job);
      }

      if (preferences.push_job_updates) {
        await pushService.sendJobUpdateNotification(manager.id, {
          id: job.id,
          title: job.title,
          message: 'Your job post has been approved and is now live!'
        });
      }
      
      console.log(`✅ Job approval notifications sent for job ${job.id}`);
    } catch (error) {
      console.error('Error in job approval notification trigger:', error);
    }
  }

  async onProposalSubmitted(talent, manager, job, proposal) {
    try {
      const managerPreferences = await UserNotificationPreferences.findByUser(manager.id);
      
      // Notify manager about new proposal
      if (managerPreferences.email_job_updates) {
        const variables = {
          firstName: manager.first_name,
          jobTitle: job.title,
          talentName: `${talent.first_name} ${talent.last_name}`,
          proposalAmount: proposal.bid_amount,
          proposalUrl: `${process.env.CLIENT_URL || 'http://localhost:3001'}/jobs/${job.id}/proposals`
        };

        await emailService.queueNotification({
          userId: manager.id,
          subject: `New proposal for "${job.title}"`,
          content: `
            <h1>New Proposal Received</h1>
            <p>Hi ${manager.first_name},</p>
            <p>${talent.first_name} ${talent.last_name} has submitted a proposal for your job "${job.title}".</p>
            <p><strong>Bid Amount:</strong> $${proposal.bid_amount}</p>
            <p><strong>Timeline:</strong> ${proposal.timeline_days} days</p>
            <a href="${variables.proposalUrl}">View Proposal</a>
          `,
          recipientEmail: manager.email,
          variables,
          priority: 'normal'
        });
      }

      if (managerPreferences.push_job_updates) {
        await pushService.sendJobUpdateNotification(manager.id, {
          id: job.id,
          title: job.title,
          message: `New proposal from ${talent.first_name} ${talent.last_name}`
        });
      }

      console.log(`✅ Proposal submission notifications sent for proposal ${proposal.id}`);
    } catch (error) {
      console.error('Error in proposal submission notification trigger:', error);
    }
  }

  async onProposalStatusUpdated(talent, manager, job, proposal, oldStatus, newStatus) {
    try {
      const talentPreferences = await UserNotificationPreferences.findByUser(talent.id);
      
      if (talentPreferences.email_proposal_updates) {
        await emailService.sendJobFeedbackEmail(talent, {
          jobTitle: job.title,
          status: newStatus,
          message: `Your proposal has been ${newStatus}.`,
          jobUrl: `${process.env.CLIENT_URL || 'http://localhost:3001'}/jobs/${job.id}`
        });
      }

      if (talentPreferences.push_job_updates) {
        await pushService.sendProposalNotification(talent.id, {
          id: proposal.id,
          jobId: job.id,
          jobTitle: job.title,
          status: newStatus
        });
      }

      console.log(`✅ Proposal status update notifications sent for proposal ${proposal.id}`);
    } catch (error) {
      console.error('Error in proposal status update notification trigger:', error);
    }
  }

  async onMessageSent(sender, receiver, job, message) {
    try {
      const receiverPreferences = await UserNotificationPreferences.findByUser(receiver.id);
      
      if (receiverPreferences.email_messages) {
        const variables = {
          firstName: receiver.first_name,
          senderName: `${sender.first_name} ${sender.last_name}`,
          jobTitle: job.title,
          messagePreview: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
          conversationUrl: `${process.env.CLIENT_URL || 'http://localhost:3001'}/jobs/${job.id}/messages`
        };

        await emailService.queueNotification({
          userId: receiver.id,
          subject: `New message from ${sender.first_name} ${sender.last_name}`,
          content: `
            <h1>New Message</h1>
            <p>Hi ${receiver.first_name},</p>
            <p>You received a new message from ${sender.first_name} ${sender.last_name} regarding "${job.title}":</p>
            <blockquote style="border-left: 3px solid #007bff; padding-left: 15px; margin: 15px 0;">
              ${variables.messagePreview}
            </blockquote>
            <a href="${variables.conversationUrl}">View Conversation</a>
          `,
          recipientEmail: receiver.email,
          variables,
          priority: 'normal'
        });
      }

      if (receiverPreferences.push_messages) {
        await pushService.sendMessageNotification(receiver.id, {
          jobId: job.id,
          senderId: sender.id,
          senderName: `${sender.first_name} ${sender.last_name}`,
          message
        });
      }

      console.log(`✅ Message notifications sent from user ${sender.id} to user ${receiver.id}`);
    } catch (error) {
      console.error('Error in message notification trigger:', error);
    }
  }

  async onPaymentProcessed(user, payment, job = null) {
    try {
      const preferences = await UserNotificationPreferences.findByUser(user.id);
      
      if (preferences.email_invoices) {
        await emailService.sendInvoiceEmail(user, {
          jobTitle: job ? job.title : 'Payment',
          amount: (payment.amount / 100).toFixed(2), // Convert from cents
          invoiceUrl: `${process.env.CLIENT_URL || 'http://localhost:3001'}/payments/${payment.id}`
        });
      }

      if (preferences.push_notifications) {
        await pushService.sendNotification(user.id, {
          title: 'Payment Processed',
          body: `Your payment of $${(payment.amount / 100).toFixed(2)} has been processed successfully`,
          icon: '/icons/payment.png',
          tag: `payment-${payment.id}`,
          data: {
            type: 'payment',
            paymentId: payment.id,
            url: `/payments/${payment.id}`
          }
        });
      }

      console.log(`✅ Payment notifications sent for payment ${payment.id}`);
    } catch (error) {
      console.error('Error in payment notification trigger:', error);
    }
  }

  async onJobStatusChanged(job, manager, oldStatus, newStatus) {
    try {
      const preferences = await UserNotificationPreferences.findByUser(manager.id);
      
      if (preferences.email_job_updates) {
        const variables = {
          firstName: manager.first_name,
          jobTitle: job.title,
          status: newStatus,
          message: `Your job status has been updated to ${newStatus}.`,
          jobUrl: `${process.env.CLIENT_URL || 'http://localhost:3001'}/jobs/${job.id}`
        };

        await emailService.sendJobFeedbackEmail(manager, variables);
      }

      if (preferences.push_job_updates) {
        await pushService.sendJobUpdateNotification(manager.id, {
          id: job.id,
          title: job.title,
          message: `Job status updated to ${newStatus}`
        });
      }

      console.log(`✅ Job status change notifications sent for job ${job.id}`);
    } catch (error) {
      console.error('Error in job status change notification trigger:', error);
    }
  }

  async onUserInactive(user, daysSinceLastLogin) {
    try {
      const preferences = await UserNotificationPreferences.findByUser(user.id);
      
      if (preferences.email_marketing) {
        const variables = {
          firstName: user.first_name,
          daysSinceLogin: daysSinceLastLogin,
          loginUrl: `${process.env.CLIENT_URL || 'http://localhost:3001'}/auth/login`,
          dashboardUrl: `${process.env.CLIENT_URL || 'http://localhost:3001'}/dashboard`
        };

        await emailService.queueNotification({
          userId: user.id,
          subject: "We miss you at Dozyr!",
          content: `
            <h1>Welcome back, ${user.first_name}!</h1>
            <p>We noticed you haven't been active on Dozyr for ${daysSinceLastLogin} days.</p>
            <p>There are new opportunities waiting for you!</p>
            <ul>
              <li>New job posts in your skill areas</li>
              <li>Messages from potential clients</li>
              <li>Updates on your applications</li>
            </ul>
            <a href="${variables.dashboardUrl}" style="background:#007bff;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">
              Check Your Dashboard
            </a>
          `,
          recipientEmail: user.email,
          variables,
          priority: 'low'
        });
      }

      console.log(`✅ User inactive notification sent for user ${user.id}`);
    } catch (error) {
      console.error('Error in user inactive notification trigger:', error);
    }
  }

  async sendBulkNotification(userIds, subject, content, type = 'email', priority = 'normal') {
    try {
      const { pool } = require('../config/database');
      const [users] = await pool.execute(`
        SELECT u.*, unp.email_marketing, unp.push_notifications
        FROM users u
        LEFT JOIN user_notification_preferences unp ON u.id = unp.user_id
        WHERE u.id IN (${userIds.map(() => '?').join(',')})
        AND u.is_active = true
      `, userIds);

      let queuedCount = 0;
      
      for (const user of users) {
        const canSendEmail = type === 'email' && user.email_marketing;
        const canSendPush = type === 'push' && user.push_notifications;
        const canSendBoth = type === 'both' && (user.email_marketing || user.push_notifications);
        
        if (canSendEmail || canSendPush || canSendBoth) {
          await emailService.queueNotification({
            userId: user.id,
            type,
            subject,
            content,
            recipientEmail: user.email,
            priority
          });
          queuedCount++;
        }
      }

      console.log(`✅ Bulk notification queued for ${queuedCount} users`);
      return queuedCount;
    } catch (error) {
      console.error('Error sending bulk notification:', error);
      throw error;
    }
  }
}

module.exports = new NotificationTriggers();
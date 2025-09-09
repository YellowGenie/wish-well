const nodemailer = require('nodemailer');
const { pool } = require('../config/database');

class EmailService {
  constructor() {
    this.transporter = null;
    this.settings = {};
  }

  async loadSettings() {
    try {
      const [rows] = await pool.execute(`
        SELECT setting_key, setting_value 
        FROM notification_settings 
        WHERE setting_key IN (
          'smtp_host', 'smtp_port', 'smtp_username', 'smtp_password', 
          'smtp_secure', 'from_email', 'from_name'
        )
      `);
      
      this.settings = rows.reduce((acc, row) => {
        acc[row.setting_key] = row.setting_value;
        return acc;
      }, {});
      
      await this.createTransporter();
    } catch (error) {
      console.error('Error loading email settings:', error);
      throw error;
    }
  }

  async createTransporter() {
    if (!this.settings.smtp_host) {
      console.warn('SMTP settings not configured');
      return;
    }

    const config = {
      host: this.settings.smtp_host,
      port: parseInt(this.settings.smtp_port) || 587,
      secure: this.settings.smtp_secure === 'true',
      auth: {
        user: this.settings.smtp_username,
        pass: this.settings.smtp_password
      }
    };

    this.transporter = nodemailer.createTransporter(config);

    try {
      await this.transporter.verify();
      console.log('✅ SMTP connection verified successfully');
    } catch (error) {
      console.error('❌ SMTP connection failed:', error.message);
      this.transporter = null;
    }
  }

  async updateSettings(newSettings) {
    try {
      for (const [key, value] of Object.entries(newSettings)) {
        await pool.execute(`
          INSERT INTO notification_settings (setting_key, setting_value) 
          VALUES (?, ?) 
          ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
        `, [key, value]);
      }
      
      await this.loadSettings();
      return true;
    } catch (error) {
      console.error('Error updating email settings:', error);
      throw error;
    }
  }

  async getTemplate(templateName) {
    try {
      const [rows] = await pool.execute(`
        SELECT * FROM email_templates 
        WHERE name = ? AND is_active = true
      `, [templateName]);
      
      return rows[0] || null;
    } catch (error) {
      console.error('Error fetching email template:', error);
      throw error;
    }
  }

  replaceVariables(template, variables) {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, value || '');
    }
    return result;
  }

  async sendEmail({ to, subject, html, text, templateName, variables = {} }) {
    try {
      let finalSubject = subject;
      let finalHtml = html;
      let finalText = text;

      if (templateName) {
        const template = await this.getTemplate(templateName);
        if (!template) {
          throw new Error(`Template '${templateName}' not found`);
        }

        finalSubject = this.replaceVariables(template.subject, variables);
        finalHtml = this.replaceVariables(template.html_template, variables);
        finalText = this.replaceVariables(template.text_template || '', variables);
      }

      const mailOptions = {
        from: `${this.settings.from_name} <${this.settings.from_email}>`,
        to,
        subject: finalSubject,
        html: finalHtml,
        text: finalText
      };

      // Development mode: Log email instead of sending if no transporter
      if (!this.transporter) {
        console.log('\n📧 ===== EMAIL WOULD BE SENT =====');
        console.log('From:', mailOptions.from);
        console.log('To:', mailOptions.to);
        console.log('Subject:', mailOptions.subject);
        console.log('HTML:', mailOptions.html);
        console.log('Text:', mailOptions.text);
        console.log('===============================\n');
        return { success: true, messageId: 'dev-mode-' + Date.now() };
      }

      const info = await this.transporter.sendMail(mailOptions);
      console.log('✅ Email sent successfully:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('❌ Email sending failed:', error);
      return { success: false, error: error.message };
    }
  }

  async queueNotification({ userId, type = 'email', templateName, recipientEmail, subject, content, variables = {}, priority = 'normal', scheduledFor = null }) {
    try {
      const [result] = await pool.execute(`
        INSERT INTO notifications (
          user_id, type, template_name, recipient_email, subject, 
          content, template_variables, priority, scheduled_for, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        userId, type, templateName || null, recipientEmail || null, subject || null,
        content || '', JSON.stringify(variables), priority,
        scheduledFor, scheduledFor ? 'scheduled' : 'pending'
      ]);

      return result.insertId;
    } catch (error) {
      console.error('Error queueing notification:', error);
      throw error;
    }
  }

  async processPendingNotifications(limit = 10) {
    try {
      // Validate and sanitize limit parameter to prevent SQL injection
      const safeLimit = Math.max(1, Math.min(parseInt(limit) || 10, 100));
      
      const [notifications] = await pool.execute(`
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
        LIMIT ${safeLimit}
      `);

      const results = [];
      
      for (const notification of notifications) {
        try {
          await pool.execute(`
            UPDATE notifications 
            SET status = 'sending', updated_at = NOW() 
            WHERE id = ?
          `, [notification.id]);

          const variables = typeof notification.template_variables === 'string' 
            ? JSON.parse(notification.template_variables || '{}') 
            : notification.template_variables || {};
          variables.firstName = notification.first_name;
          variables.lastName = notification.last_name;

          const result = await this.sendEmail({
            to: notification.recipient_email || notification.user_email,
            subject: notification.subject,
            html: notification.content,
            templateName: notification.template_name,
            variables
          });

          if (result.success) {
            await pool.execute(`
              UPDATE notifications 
              SET status = 'sent', sent_at = NOW(), updated_at = NOW()
              WHERE id = ?
            `, [notification.id]);
            results.push({ id: notification.id, status: 'sent' });
          } else {
            const retryCount = notification.retry_count + 1;
            const maxRetries = notification.max_retries;
            
            if (retryCount < maxRetries) {
              await pool.execute(`
                UPDATE notifications 
                SET status = 'pending', retry_count = ?, failed_reason = ?, updated_at = NOW()
                WHERE id = ?
              `, [retryCount, result.error, notification.id]);
              results.push({ id: notification.id, status: 'retry', attempt: retryCount });
            } else {
              await pool.execute(`
                UPDATE notifications 
                SET status = 'failed', failed_reason = ?, updated_at = NOW()
                WHERE id = ?
              `, [result.error, notification.id]);
              results.push({ id: notification.id, status: 'failed', error: result.error });
            }
          }
        } catch (error) {
          console.error(`Error processing notification ${notification.id}:`, error);
          await pool.execute(`
            UPDATE notifications 
            SET status = 'failed', failed_reason = ?, updated_at = NOW()
            WHERE id = ?
          `, [error.message, notification.id]);
          results.push({ id: notification.id, status: 'failed', error: error.message });
        }
      }

      return results;
    } catch (error) {
      console.error('Error processing pending notifications:', error);
      throw error;
    }
  }

  async sendWelcomeEmail(user) {
    const variables = {
      firstName: user.first_name,
      loginUrl: `${process.env.CLIENT_URL || 'http://localhost:3001'}/auth/login`
    };

    return await this.queueNotification({
      userId: user.id,
      templateName: 'welcome',
      recipientEmail: user.email,
      variables,
      priority: 'normal'
    });
  }

  async sendVerificationEmail(user, verificationCode) {
    const variables = {
      firstName: user.first_name,
      verificationCode: verificationCode
    };

    return await this.queueNotification({
      userId: user.id,
      templateName: 'email_verification',
      recipientEmail: user.email,
      subject: 'Verify your Dozyr account',
      content: '', // Empty string instead of null
      variables,
      priority: 'high'
    });
  }

  async sendInvoiceEmail(user, invoiceData) {
    const variables = {
      firstName: user.first_name,
      jobTitle: invoiceData.jobTitle,
      amount: invoiceData.amount,
      invoiceUrl: invoiceData.invoiceUrl
    };

    return await this.queueNotification({
      userId: user.id,
      templateName: 'invoice',
      recipientEmail: user.email,
      variables,
      priority: 'normal'
    });
  }

  async sendJobFeedbackEmail(user, feedbackData) {
    const variables = {
      firstName: user.first_name,
      jobTitle: feedbackData.jobTitle,
      status: feedbackData.status,
      message: feedbackData.message,
      jobUrl: feedbackData.jobUrl
    };

    return await this.queueNotification({
      userId: user.id,
      templateName: 'job_feedback',
      recipientEmail: user.email,
      variables,
      priority: 'normal'
    });
  }

  async sendNewPostApprovedEmail(user, jobData) {
    const variables = {
      firstName: user.first_name,
      jobTitle: jobData.title,
      jobUrl: `${process.env.CLIENT_URL || 'http://localhost:3001'}/jobs/${jobData.id}`
    };

    return await this.queueNotification({
      userId: user.id,
      templateName: 'new_post_approved',
      recipientEmail: user.email,
      variables,
      priority: 'normal'
    });
  }

  async getNotificationStats() {
    try {
      const [stats] = await pool.execute(`
        SELECT 
          status,
          COUNT(*) as count,
          DATE(created_at) as date
        FROM notifications 
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY status, DATE(created_at)
        ORDER BY date DESC
      `);

      return stats;
    } catch (error) {
      console.error('Error fetching notification stats:', error);
      throw error;
    }
  }
}

module.exports = new EmailService();
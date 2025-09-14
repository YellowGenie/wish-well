const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
    this.settings = {};
  }

  async loadSettings() {
    try {
      // Load email settings from environment variables
      this.settings = {
        smtp_host: process.env.SMTP_HOST || 'smtp.gmail.com',
        smtp_port: process.env.SMTP_PORT || 587,
        smtp_username: process.env.SMTP_USERNAME || '',
        smtp_password: process.env.SMTP_PASSWORD || '',
        smtp_secure: process.env.SMTP_SECURE || 'false',
        from_email: process.env.FROM_EMAIL || 'noreply@dozyr.com',
        from_name: process.env.FROM_NAME || 'Dozyr'
      };
      
      console.log('✅ Email settings loaded:', {
        smtp_host: this.settings.smtp_host,
        smtp_port: this.settings.smtp_port,
        smtp_username: this.settings.smtp_username ? '***masked***' : 'MISSING',
        smtp_password: this.settings.smtp_password ? '***masked***' : 'MISSING',
        smtp_secure: this.settings.smtp_secure,
        from_email: this.settings.from_email
      });
    } catch (error) {
      console.error('❌ Error loading email settings:', error);
    }
  }

  async initializeTransporter() {
    console.log('🔧 Initializing email transporter...');
    await this.loadSettings();
    
    if (!this.settings.smtp_username || !this.settings.smtp_password) {
      console.log('⚠️ SMTP credentials not configured, skipping email setup');
      console.log('Debug - smtp_username:', this.settings.smtp_username);
      console.log('Debug - smtp_password:', this.settings.smtp_password ? 'EXISTS' : 'MISSING');
      return;
    }

    try {
      const transporterConfig = {
        host: this.settings.smtp_host,
        port: parseInt(this.settings.smtp_port),
        secure: this.settings.smtp_secure === 'true',
        auth: {
          user: this.settings.smtp_username,
          pass: this.settings.smtp_password
        }
      };

      console.log('📧 Creating transporter with config:', {
        host: transporterConfig.host,
        port: transporterConfig.port,
        secure: transporterConfig.secure,
        auth: { user: transporterConfig.auth.user, pass: '***masked***' }
      });

      this.transporter = nodemailer.createTransport(transporterConfig);

      console.log('✅ Email transporter initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing email transporter:', error);
    }
  }

  async sendEmail({ to, subject, html, text }) {
    if (!this.transporter) {
      console.log('⚠️ Email transporter not configured, skipping email send');
      return { success: false, error: 'Email not configured' };
    }

    try {
      const mailOptions = {
        from: `${this.settings.from_name} <${this.settings.from_email}>`,
        to,
        subject,
        html,
        text
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('✅ Email sent successfully:', result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending email:', error);
      return { success: false, error: error.message };
    }
  }

  async sendVerificationEmail(email, verificationCode, firstName) {
    const subject = 'Verify your Dozyr account';
    const html = `
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Verify your email</h1>
          <p>Hi ${firstName || 'there'},</p>
          <p>Please enter this 4-digit verification code to verify your email address:</p>
          <div style="background:#f5f5f5;padding:20px;text-align:center;font-size:24px;font-weight:bold;letter-spacing:4px;margin:20px 0;">
            ${verificationCode}
          </div>
          <p>This code will expire in 15 minutes.</p>
        </body>
      </html>
    `;
    const text = `Hi ${firstName || 'there'}, your verification code is: ${verificationCode}. This code expires in 15 minutes.`;

    return await this.sendEmail({ to: email, subject, html, text });
  }

  async sendPasswordResetEmail(email, resetToken, firstName) {
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/reset-password?token=${resetToken}`;

    const subject = 'Reset Your Dozyr Password';
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reset Your Password</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 600;">Reset Your Password</h1>
            </div>

            <!-- Content -->
            <div style="padding: 40px 30px;">
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Hi <strong>${firstName || 'there'}</strong>,
              </p>

              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                We received a request to reset your Dozyr password. Click the button below to create a new password:
              </p>

              <!-- Reset Button -->
              <div style="text-align: center; margin: 30px 0;">
                <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
                  <tr>
                    <td style="background-color: #667eea; border-radius: 8px; text-align: center;">
                      <a href="${resetUrl}"
                         style="background-color: #667eea;
                                color: #ffffff;
                                text-decoration: none;
                                padding: 16px 32px;
                                border-radius: 8px;
                                font-weight: 600;
                                font-size: 16px;
                                display: inline-block;
                                font-family: Arial, sans-serif;
                                line-height: 1.4;
                                text-align: center;">
                        🔑 Reset My Password
                      </a>
                    </td>
                  </tr>
                </table>
              </div>

              <!-- Alternative Link -->
              <div style="margin: 30px 0; padding: 20px; background-color: #f9fafb; border-radius: 8px; border-left: 4px solid #3b82f6;">
                <p style="color: #374151; font-size: 14px; line-height: 1.6; margin: 0 0 10px 0;">
                  <strong>Can't click the button?</strong> Copy and paste this link into your browser:
                </p>
                <p style="color: #3b82f6; font-size: 14px; word-break: break-all; margin: 0;">
                  ${resetUrl}
                </p>
              </div>

              <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0;">
                <strong>Security Notice:</strong> This password reset link will expire in 1 hour for your security.
                If you didn't request a password reset, please ignore this email or contact our support team.
              </p>
            </div>

            <!-- Footer -->
            <div style="background-color: #f9fafb; padding: 20px 30px; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; font-size: 12px; text-align: center; margin: 0;">
                © ${new Date().getFullYear()} Dozyr. All rights reserved.<br>
                This email was sent to ${email}
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
Hi ${firstName || 'there'},

We received a request to reset your Dozyr password. Click the link below to create a new password:

${resetUrl}

This link will expire in 1 hour for your security.

If you didn't request a password reset, please ignore this email.

© ${new Date().getFullYear()} Dozyr. All rights reserved.
    `;

    return await this.sendEmail({ to: email, subject, html, text });
  }

  async testConnection() {
    if (!this.transporter) {
      console.log('❌ Email transporter not initialized');
      return { success: false, error: 'Transporter not initialized' };
    }

    try {
      console.log('🔍 Testing email connection...');
      await this.transporter.verify();
      console.log('✅ Email connection test successful!');
      return { success: true, message: 'Connection verified successfully' };
    } catch (error) {
      console.error('❌ Email connection test failed:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new EmailService();
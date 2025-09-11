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
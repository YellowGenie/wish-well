const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixDatabaseConstraints() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    console.log('Fixing database foreign key constraints...');

    // Disable foreign key checks temporarily
    await pool.execute('SET FOREIGN_KEY_CHECKS = 0');

    // Drop problematic tables in correct order
    const tablesToDrop = [
      'email_campaigns',
      'mailing_list_subscribers', 
      'mailing_lists',
      'push_subscriptions',
      'email_unsubscribes',
      'notifications',
      'user_notification_preferences',
      'notification_settings',
      'email_logs', // Drop this first since it references email_templates
      'email_templates'
    ];

    for (const table of tablesToDrop) {
      try {
        await pool.execute(`DROP TABLE IF EXISTS ${table}`);
        console.log(`✅ Dropped table: ${table}`);
      } catch (e) {
        console.log(`Warning: Could not drop ${table}:`, e.message.substring(0, 100));
      }
    }

    // Re-enable foreign key checks
    await pool.execute('SET FOREIGN_KEY_CHECKS = 1');

    // Now create the email_templates table with proper structure
    await pool.execute(`
      CREATE TABLE email_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        subject VARCHAR(255) NOT NULL,
        html_template TEXT NOT NULL,
        text_template TEXT,
        variables JSON,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Created email_templates table');

    // Create notification_settings table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS notification_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(100) UNIQUE NOT NULL,
        setting_value TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Created notification_settings table');

    // Create user_notification_preferences table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS user_notification_preferences (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        email_welcome BOOLEAN DEFAULT true,
        email_verification BOOLEAN DEFAULT true,
        email_invoices BOOLEAN DEFAULT true,
        email_job_feedback BOOLEAN DEFAULT true,
        email_new_posts BOOLEAN DEFAULT true,
        email_job_updates BOOLEAN DEFAULT true,
        email_proposal_updates BOOLEAN DEFAULT true,
        email_messages BOOLEAN DEFAULT true,
        email_marketing BOOLEAN DEFAULT false,
        push_notifications BOOLEAN DEFAULT true,
        push_job_updates BOOLEAN DEFAULT true,
        push_messages BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_preferences (user_id)
      )
    `);
    console.log('✅ Created user_notification_preferences table');

    // Create notifications table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        type ENUM('email', 'push', 'both') DEFAULT 'email',
        template_name VARCHAR(100),
        recipient_email VARCHAR(255),
        subject VARCHAR(255),
        content TEXT NOT NULL,
        template_variables JSON,
        status ENUM('pending', 'sending', 'sent', 'failed', 'scheduled') DEFAULT 'pending',
        scheduled_for TIMESTAMP NULL,
        sent_at TIMESTAMP NULL,
        failed_reason TEXT,
        retry_count INT DEFAULT 0,
        max_retries INT DEFAULT 3,
        priority ENUM('low', 'normal', 'high', 'urgent') DEFAULT 'normal',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_status (status),
        INDEX idx_scheduled (scheduled_for),
        INDEX idx_user_type (user_id, type)
      )
    `);
    console.log('✅ Created notifications table');

    // Create email_logs table (now that email_templates exists)
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS email_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        template_id INT NULL,
        user_id INT NULL,
        recipient_email VARCHAR(255) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        status ENUM('sent', 'failed', 'pending') DEFAULT 'pending',
        sent_at TIMESTAMP NULL,
        failed_reason TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (template_id) REFERENCES email_templates(id) ON DELETE SET NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_recipient (recipient_email),
        INDEX idx_status (status),
        INDEX idx_sent_at (sent_at)
      )
    `);
    console.log('✅ Created email_logs table');

    // Insert default email templates
    console.log('Inserting default email templates...');
    await pool.execute(`
      INSERT IGNORE INTO email_templates (name, subject, html_template, text_template, variables) VALUES
      (?, ?, ?, ?, ?),
      (?, ?, ?, ?, ?),
      (?, ?, ?, ?, ?),
      (?, ?, ?, ?, ?),
      (?, ?, ?, ?, ?)
    `, [
      'welcome', 'Welcome to Dozyr!', 
      '<!DOCTYPE html><html><body><h1>Welcome {{firstName}}!</h1><p>Thank you for joining Dozyr, the premier remote job marketplace.</p><p>Your account has been created successfully.</p><a href="{{loginUrl}}">Login to your account</a></body></html>',
      'Welcome {{firstName}}! Thank you for joining Dozyr. Login at: {{loginUrl}}',
      JSON.stringify(["firstName", "loginUrl"]),
      
      'email_verification', 'Verify your Dozyr account', 
      '<!DOCTYPE html><html><body><h1>Verify your email</h1><p>Hi {{firstName}},</p><p>Please enter this 4-digit verification code to verify your email address:</p><div style="background:#f5f5f5;padding:20px;text-align:center;font-size:24px;font-weight:bold;letter-spacing:4px;margin:20px 0;">{{verificationCode}}</div><p>This code will expire in 15 minutes.</p></body></html>',
      'Hi {{firstName}}, your verification code is: {{verificationCode}}. This code expires in 15 minutes.',
      JSON.stringify(["firstName", "verificationCode"]),
      
      'invoice', 'Your Dozyr Invoice', 
      '<!DOCTYPE html><html><body><h1>Invoice for {{jobTitle}}</h1><p>Hi {{firstName}},</p><p>Your invoice is ready.</p><p>Amount: ${{amount}}</p><p>Job: {{jobTitle}}</p><a href="{{invoiceUrl}}">View Invoice</a></body></html>',
      'Invoice for {{jobTitle}} - Amount: ${{amount}}. View at: {{invoiceUrl}}',
      JSON.stringify(["firstName", "jobTitle", "amount", "invoiceUrl"]),
      
      'job_feedback', 'Feedback on your job application', 
      '<!DOCTYPE html><html><body><h1>Application Update</h1><p>Hi {{firstName}},</p><p>There is an update on your application for: {{jobTitle}}</p><p>Status: {{status}}</p><p>{{message}}</p><a href="{{jobUrl}}">View Job</a></body></html>',
      'Application update for {{jobTitle}} - Status: {{status}}. {{message}}',
      JSON.stringify(["firstName", "jobTitle", "status", "message", "jobUrl"]),
      
      'new_post_approved', 'Your job post has been approved', 
      '<!DOCTYPE html><html><body><h1>Job Post Approved!</h1><p>Hi {{firstName}},</p><p>Your job post "{{jobTitle}}" has been approved and is now live on Dozyr.</p><a href="{{jobUrl}}">View your job post</a></body></html>',
      'Your job post "{{jobTitle}}" has been approved! View at: {{jobUrl}}',
      JSON.stringify(["firstName", "jobTitle", "jobUrl"])
    ]);

    // Insert default notification settings
    await pool.execute(`
      INSERT IGNORE INTO notification_settings (setting_key, setting_value, description) VALUES
      ('smtp_host', '', 'SMTP server hostname'),
      ('smtp_port', '587', 'SMTP server port'),
      ('smtp_username', '', 'SMTP authentication username'),
      ('smtp_password', '', 'SMTP authentication password'),
      ('smtp_secure', 'false', 'Use SSL/TLS encryption'),
      ('from_email', 'noreply@dozyr.com', 'Default from email address'),
      ('from_name', 'Dozyr', 'Default from name'),
      ('push_public_key', '', 'VAPID public key for push notifications'),
      ('push_private_key', '', 'VAPID private key for push notifications'),
      ('max_retry_attempts', '3', 'Maximum retry attempts for failed notifications'),
      ('retry_delay_minutes', '60', 'Delay between retry attempts in minutes')
    `);

    console.log('✅ Default email templates and settings inserted');
    console.log('🎉 Database constraints fixed successfully!');

  } catch (error) {
    console.error('Error fixing database constraints:', error);
  } finally {
    await pool.end();
  }
}

fixDatabaseConstraints();
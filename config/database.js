const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

const createTables = async () => {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role ENUM('talent', 'manager', 'admin') NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        profile_image VARCHAR(500),
        is_active BOOLEAN DEFAULT true,
        email_verified BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS talent_profiles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNIQUE NOT NULL,
        title VARCHAR(255),
        bio TEXT,
        hourly_rate DECIMAL(10,2),
        availability ENUM('full-time', 'part-time', 'contract') DEFAULT 'contract',
        location VARCHAR(255),
        portfolio_description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS manager_profiles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNIQUE NOT NULL,
        company_name VARCHAR(255),
        company_description TEXT,
        company_size ENUM('1-10', '11-50', '51-200', '201-500', '500+'),
        industry VARCHAR(255),
        location VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS skills (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        category VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS talent_skills (
        id INT AUTO_INCREMENT PRIMARY KEY,
        talent_id INT NOT NULL,
        skill_id INT NOT NULL,
        proficiency ENUM('beginner', 'intermediate', 'expert') DEFAULT 'intermediate',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (talent_id) REFERENCES talent_profiles(id) ON DELETE CASCADE,
        FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
        UNIQUE KEY unique_talent_skill (talent_id, skill_id)
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS jobs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        manager_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        budget_type ENUM('fixed', 'hourly') NOT NULL,
        budget_min DECIMAL(10,2),
        budget_max DECIMAL(10,2),
        currency VARCHAR(3) DEFAULT 'USD',
        status ENUM('open', 'in_progress', 'completed', 'cancelled') DEFAULT 'open',
        category VARCHAR(100),
        deadline DATE,
        experience_level ENUM('entry', 'intermediate', 'expert') DEFAULT 'intermediate',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (manager_id) REFERENCES manager_profiles(id) ON DELETE CASCADE
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS job_skills (
        id INT AUTO_INCREMENT PRIMARY KEY,
        job_id INT NOT NULL,
        skill_id INT NOT NULL,
        is_required BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
        UNIQUE KEY unique_job_skill (job_id, skill_id)
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS proposals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        job_id INT NOT NULL,
        talent_id INT NOT NULL,
        cover_letter TEXT NOT NULL,
        bid_amount DECIMAL(10,2) NOT NULL,
        timeline_days INT,
        status ENUM('pending', 'accepted', 'rejected', 'withdrawn') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (talent_id) REFERENCES talent_profiles(id) ON DELETE CASCADE,
        UNIQUE KEY unique_talent_job_proposal (job_id, talent_id)
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        job_id INT NOT NULL,
        sender_id INT NOT NULL,
        receiver_id INT NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        stripe_customer_id VARCHAR(255),
        stripe_payment_intent_id VARCHAR(255) UNIQUE NOT NULL,
        amount INT NOT NULL,
        currency VARCHAR(3) DEFAULT 'usd',
        status ENUM('pending', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
        job_id INT,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS customer_cards (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        stripe_customer_id VARCHAR(255) NOT NULL,
        stripe_payment_method_id VARCHAR(255) UNIQUE NOT NULL,
        last_four CHAR(4) NOT NULL,
        brand VARCHAR(50) NOT NULL,
        exp_month TINYINT NOT NULL,
        exp_year SMALLINT NOT NULL,
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Add profile_image column to existing users table if it doesn't exist
    try {
      await pool.execute(`
        ALTER TABLE users 
        ADD COLUMN profile_image VARCHAR(500)
      `);
      console.log('Added profile_image column to users table');
    } catch (error) {
      // Column might already exist, which is fine
      if (error.code !== 'ER_DUP_FIELDNAME') {
        console.warn('Could not add profile_image column:', error.message);
      }
    }

    // Create notification system tables (only create if they don't exist)
    console.log('Setting up notification tables...');
    
    console.log('Creating email_templates table...');
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS email_templates (
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
    console.log('✅ email_templates table created');

    console.log('Creating notification_settings table...');
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

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS email_unsubscribes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        email VARCHAR(255) NOT NULL,
        unsubscribe_token VARCHAR(255) UNIQUE NOT NULL,
        unsubscribed_from ENUM('all', 'marketing', 'transactional', 'specific') DEFAULT 'all',
        specific_type VARCHAR(100),
        unsubscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ip_address VARCHAR(45),
        user_agent TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_token (unsubscribe_token),
        INDEX idx_email (email)
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        endpoint TEXT NOT NULL,
        p256dh_key TEXT NOT NULL,
        auth_key TEXT NOT NULL,
        user_agent TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_endpoint (user_id, endpoint(255))
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS mailing_lists (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        created_by INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS mailing_list_subscribers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        list_id INT NOT NULL,
        user_id INT NOT NULL,
        email VARCHAR(255) NOT NULL,
        status ENUM('subscribed', 'unsubscribed', 'bounced', 'complained') DEFAULT 'subscribed',
        subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        unsubscribed_at TIMESTAMP NULL,
        FOREIGN KEY (list_id) REFERENCES mailing_lists(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_list_user (list_id, user_id)
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS email_campaigns (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        template_id INT,
        mailing_list_id INT,
        content TEXT NOT NULL,
        status ENUM('draft', 'scheduled', 'sending', 'sent', 'cancelled') DEFAULT 'draft',
        scheduled_for TIMESTAMP NULL,
        sent_at TIMESTAMP NULL,
        created_by INT NOT NULL,
        total_recipients INT DEFAULT 0,
        sent_count INT DEFAULT 0,
        failed_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (template_id) REFERENCES email_templates(id) ON DELETE SET NULL,
        FOREIGN KEY (mailing_list_id) REFERENCES mailing_lists(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

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

    // Create email verification codes table
    console.log('Creating email_verification_codes table...');
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS email_verification_codes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        email VARCHAR(255) NOT NULL,
        verification_code VARCHAR(4) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_code (user_id, verification_code),
        INDEX idx_expires (expires_at)
      )
    `);
    console.log('✅ email_verification_codes table created');

    // Create deleted users table for soft deletes
    console.log('Creating deleted_users table...');
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS deleted_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        original_user_id INT NOT NULL,
        email VARCHAR(255) NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        role ENUM('talent', 'manager', 'admin') NOT NULL,
        profile_image VARCHAR(500),
        user_data JSON,
        profile_data JSON,
        deletion_reason VARCHAR(500),
        deleted_by INT NOT NULL,
        deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        original_created_at TIMESTAMP,
        FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE RESTRICT,
        INDEX idx_original_user_id (original_user_id),
        INDEX idx_deleted_by (deleted_by),
        INDEX idx_deleted_at (deleted_at)
      )
    `);
    console.log('✅ deleted_users table created');

    console.log('✅ Database tables created successfully');
    console.log('✅ Default email templates inserted');
    console.log('✅ Default notification settings inserted');
  } catch (error) {
    console.error('Error creating tables:', error);
    throw error;
  }
};

module.exports = {
  pool,
  createTables
};
-- Notification System Database Schema for Dozyr

-- Email templates for different notification types
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
);

-- Notification configurations and SMTP settings
CREATE TABLE IF NOT EXISTS notification_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- User notification preferences
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
);

-- Notification queue for email and push notifications
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
);

-- Email unsubscribe tokens and management
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
);

-- Mailing lists and campaigns
CREATE TABLE IF NOT EXISTS mailing_lists (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Mailing list subscribers
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
);

-- Email campaigns
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
);

-- Push notification subscriptions (for web push)
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
);

-- Notification analytics and tracking
CREATE TABLE IF NOT EXISTS notification_analytics (
  id INT AUTO_INCREMENT PRIMARY KEY,
  notification_id INT NOT NULL,
  event_type ENUM('sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed') NOT NULL,
  event_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent TEXT,
  metadata JSON,
  FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
  INDEX idx_notification_event (notification_id, event_type),
  INDEX idx_timestamp (event_timestamp)
);

-- Insert default email templates
INSERT IGNORE INTO email_templates (name, subject, html_template, text_template, variables) VALUES
('welcome', 'Welcome to Dozyr!', 
'<!DOCTYPE html><html><body><h1>Welcome {{firstName}}!</h1><p>Thank you for joining Dozyr, the premier remote job marketplace.</p><p>Your account has been created successfully.</p><a href="{{loginUrl}}">Login to your account</a></body></html>',
'Welcome {{firstName}}! Thank you for joining Dozyr. Login at: {{loginUrl}}',
'["firstName", "loginUrl"]'),

('email_verification', 'Verify your Dozyr account', 
'<!DOCTYPE html><html><body><h1>Verify your email</h1><p>Hi {{firstName}},</p><p>Please click the button below to verify your email address:</p><a href="{{verificationUrl}}" style="background:#007bff;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">Verify Email</a></body></html>',
'Hi {{firstName}}, please verify your email by clicking: {{verificationUrl}}',
'["firstName", "verificationUrl"]'),

('invoice', 'Your Dozyr Invoice', 
'<!DOCTYPE html><html><body><h1>Invoice for {{jobTitle}}</h1><p>Hi {{firstName}},</p><p>Your invoice is ready.</p><p>Amount: ${{amount}}</p><p>Job: {{jobTitle}}</p><a href="{{invoiceUrl}}">View Invoice</a></body></html>',
'Invoice for {{jobTitle}} - Amount: ${{amount}}. View at: {{invoiceUrl}}',
'["firstName", "jobTitle", "amount", "invoiceUrl"]'),

('job_feedback', 'Feedback on your job application', 
'<!DOCTYPE html><html><body><h1>Application Update</h1><p>Hi {{firstName}},</p><p>There is an update on your application for: {{jobTitle}}</p><p>Status: {{status}}</p><p>{{message}}</p><a href="{{jobUrl}}">View Job</a></body></html>',
'Application update for {{jobTitle}} - Status: {{status}}. {{message}}',
'["firstName", "jobTitle", "status", "message", "jobUrl"]'),

('new_post_approved', 'Your job post has been approved', 
'<!DOCTYPE html><html><body><h1>Job Post Approved!</h1><p>Hi {{firstName}},</p><p>Your job post "{{jobTitle}}" has been approved and is now live on Dozyr.</p><a href="{{jobUrl}}">View your job post</a></body></html>',
'Your job post "{{jobTitle}}" has been approved! View at: {{jobUrl}}',
'["firstName", "jobTitle", "jobUrl"]');

-- Insert default notification settings
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
('retry_delay_minutes', '60', 'Delay between retry attempts in minutes');
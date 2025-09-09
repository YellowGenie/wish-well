-- Admin Dashboard Database Migration
-- Run this script to create the required tables for the admin dashboard features

-- Pricing Packages Table
CREATE TABLE IF NOT EXISTS pricing_packages (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL DEFAULT 0,
    post_credits INT NOT NULL DEFAULT 0,
    featured_credits INT NOT NULL DEFAULT 0,
    duration_days INT NOT NULL DEFAULT 30,
    features JSON,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_pricing_active (is_active),
    INDEX idx_pricing_price (price)
);

-- User Package Subscriptions
CREATE TABLE IF NOT EXISTS user_packages (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    package_id INT NOT NULL,
    status ENUM('active', 'expired', 'cancelled', 'pending') DEFAULT 'pending',
    credits_remaining INT DEFAULT 0,
    featured_credits_remaining INT DEFAULT 0,
    expires_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (package_id) REFERENCES pricing_packages(id) ON DELETE CASCADE,
    INDEX idx_user_packages_user (user_id),
    INDEX idx_user_packages_status (status),
    INDEX idx_user_packages_expires (expires_at)
);

-- Discounts Table
CREATE TABLE IF NOT EXISTS discounts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    type ENUM('percentage', 'fixed_amount') NOT NULL,
    value DECIMAL(10,2) NOT NULL,
    min_purchase_amount DECIMAL(10,2) NULL,
    max_uses INT NULL,
    expires_at TIMESTAMP NULL,
    applicable_to JSON,
    user_restrictions JSON,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_discounts_code (code),
    INDEX idx_discounts_active (is_active),
    INDEX idx_discounts_expires (expires_at)
);

-- User Discounts (assigned discounts)
CREATE TABLE IF NOT EXISTS user_discounts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    discount_id INT NOT NULL,
    assigned_by INT NOT NULL,
    status ENUM('available', 'used', 'expired') DEFAULT 'available',
    used_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (discount_id) REFERENCES discounts(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_discounts_user (user_id),
    INDEX idx_user_discounts_status (status),
    UNIQUE KEY unique_user_discount (user_id, discount_id)
);

-- User Sessions for Analytics
CREATE TABLE IF NOT EXISTS user_sessions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    session_id VARCHAR(255) NOT NULL,
    login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    logout_time TIMESTAMP NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    device_type VARCHAR(50),
    browser VARCHAR(50),
    os VARCHAR(50),
    country VARCHAR(100),
    city VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_sessions_user (user_id),
    INDEX idx_sessions_active (is_active),
    INDEX idx_sessions_login_time (login_time)
);

-- User Activity Logs
CREATE TABLE IF NOT EXISTS user_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    action_type VARCHAR(100) NOT NULL,
    action_details JSON,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_logs_user (user_id),
    INDEX idx_user_logs_action (action_type),
    INDEX idx_user_logs_created (created_at)
);

-- Admin Activity Logs
CREATE TABLE IF NOT EXISTS admin_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    admin_id INT NOT NULL,
    action VARCHAR(100) NOT NULL,
    details JSON,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_admin_logs_admin (admin_id),
    INDEX idx_admin_logs_action (action),
    INDEX idx_admin_logs_created (created_at)
);

-- Email Templates
CREATE TABLE IF NOT EXISTS email_templates (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) UNIQUE NOT NULL,
    subject VARCHAR(200) NOT NULL,
    html_content TEXT NOT NULL,
    text_content TEXT,
    variables JSON,
    category ENUM('welcome', 'verification', 'password_reset', 'notification', 'marketing', 'system') DEFAULT 'system',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email_templates_category (category),
    INDEX idx_email_templates_active (is_active)
);

-- Email Logs
CREATE TABLE IF NOT EXISTS email_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    template_id INT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    recipient_user_id INT NULL,
    subject VARCHAR(200) NOT NULL,
    status ENUM('pending', 'sent', 'delivered', 'bounced', 'failed') DEFAULT 'pending',
    sent_at TIMESTAMP NULL,
    error_message TEXT NULL,
    provider_id VARCHAR(255) NULL,
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (template_id) REFERENCES email_templates(id) ON DELETE SET NULL,
    FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_email_logs_recipient (recipient_email),
    INDEX idx_email_logs_user (recipient_user_id),
    INDEX idx_email_logs_status (status),
    INDEX idx_email_logs_sent (sent_at)
);

-- Payment Invoices
CREATE TABLE IF NOT EXISTS invoices (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status ENUM('draft', 'sent', 'paid', 'overdue', 'cancelled') DEFAULT 'draft',
    due_date DATE,
    paid_at TIMESTAMP NULL,
    items JSON,
    notes TEXT,
    stripe_invoice_id VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_invoices_user (user_id),
    INDEX idx_invoices_status (status),
    INDEX idx_invoices_number (invoice_number),
    INDEX idx_invoices_due_date (due_date)
);

-- Deleted Users Table (for soft deletes)
CREATE TABLE IF NOT EXISTS deleted_users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    original_user_id INT NOT NULL,
    email VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role ENUM('talent', 'manager', 'admin') DEFAULT 'talent',
    profile_image VARCHAR(255),
    user_data JSON,
    profile_data JSON,
    deletion_reason TEXT,
    deleted_by INT NOT NULL,
    deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    original_created_at TIMESTAMP NULL,
    FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_deleted_users_original_id (original_user_id),
    INDEX idx_deleted_users_email (email),
    INDEX idx_deleted_users_deleted_by (deleted_by),
    INDEX idx_deleted_users_deleted_at (deleted_at)
);

-- Add missing columns to existing tables
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS login_count INT DEFAULT 0;

-- Insert default email templates
INSERT IGNORE INTO email_templates (name, subject, html_content, text_content, category, variables) VALUES
('welcome', 'Welcome to Dozyr!', 
 '<h1>Welcome {{first_name}}!</h1><p>Thank you for joining Dozyr. We\'re excited to have you on board!</p>', 
 'Welcome {{first_name}}! Thank you for joining Dozyr. We\'re excited to have you on board!',
 'welcome', 
 '["first_name", "last_name", "email"]'),
 
('email_verification', 'Verify your email address',
 '<h1>Please verify your email</h1><p>Click <a href="{{verification_url}}">here</a> to verify your email address.</p>',
 'Please verify your email by clicking this link: {{verification_url}}',
 'verification',
 '["first_name", "verification_url"]'),
 
('password_reset', 'Reset your password',
 '<h1>Reset your password</h1><p>Click <a href="{{reset_url}}">here</a> to reset your password. This link expires in 1 hour.</p>',
 'Reset your password by clicking this link: {{reset_url}}. This link expires in 1 hour.',
 'password_reset',
 '["first_name", "reset_url"]'),
 
('job_application_received', 'New job application received',
 '<h1>New Application</h1><p>You have received a new application for your job posting "{{job_title}}".</p>',
 'You have received a new application for your job posting "{{job_title}}".',
 'notification',
 '["first_name", "job_title", "applicant_name"]'),
 
('job_application_accepted', 'Your application was accepted!',
 '<h1>Congratulations!</h1><p>Your application for "{{job_title}}" has been accepted by {{manager_name}}.</p>',
 'Congratulations! Your application for "{{job_title}}" has been accepted by {{manager_name}}.',
 'notification',
 '["first_name", "job_title", "manager_name"]');

-- Insert default pricing packages
INSERT IGNORE INTO pricing_packages (name, description, price, post_credits, featured_credits, duration_days, features) VALUES
('Basic', 'Perfect for small businesses', 29.99, 10, 2, 30, '["10 job posts", "2 featured posts", "Basic support", "30-day validity"]'),
('Professional', 'Best for growing companies', 79.99, 50, 10, 30, '["50 job posts", "10 featured posts", "Priority support", "Analytics dashboard", "30-day validity"]'),
('Enterprise', 'For large organizations', 199.99, 200, 50, 30, '["200 job posts", "50 featured posts", "Dedicated support", "Advanced analytics", "Custom branding", "30-day validity"]');

-- Insert sample discounts
INSERT IGNORE INTO discounts (code, name, description, type, value, expires_at, applicable_to) VALUES
('WELCOME10', 'Welcome Discount', '10% off for new users', 'percentage', 10.00, DATE_ADD(NOW(), INTERVAL 6 MONTH), '{"packages": ["all"]}'),
('SAVE20', 'Save 20', '$20 off orders over $50', 'fixed_amount', 20.00, DATE_ADD(NOW(), INTERVAL 3 MONTH), '{"min_amount": 50}'),
('ENTERPRISE50', 'Enterprise 50% Off', '50% off Enterprise package', 'percentage', 50.00, DATE_ADD(NOW(), INTERVAL 1 MONTH), '{"packages": ["Enterprise"]}');
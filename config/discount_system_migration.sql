-- Enhanced Discount System Migration
-- Adds support for comprehensive discount management with lifecycle tracking

-- Update discounts table with new fields and types
ALTER TABLE discounts 
ADD COLUMN IF NOT EXISTS status ENUM('valid', 'expired', 'suspended', 'gift') NOT NULL DEFAULT 'valid' AFTER is_active,
ADD COLUMN IF NOT EXISTS usage_count INT NOT NULL DEFAULT 0 AFTER max_uses,
ADD COLUMN IF NOT EXISTS created_by INT NULL AFTER updated_at,
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP NULL AFTER created_by,
ADD COLUMN IF NOT EXISTS archived_by INT NULL AFTER archived_at;

-- Update the type enum to include new discount types
ALTER TABLE discounts 
MODIFY COLUMN type ENUM('percentage', 'fixed_amount', 'free_posts') NOT NULL;

-- Add foreign key constraints for created_by and archived_by
ALTER TABLE discounts 
ADD CONSTRAINT fk_discounts_created_by 
FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE discounts 
ADD CONSTRAINT fk_discounts_archived_by 
FOREIGN KEY (archived_by) REFERENCES users(id) ON DELETE SET NULL;

-- Add new indexes for better performance
ALTER TABLE discounts 
ADD INDEX idx_discounts_status (status),
ADD INDEX idx_discounts_created_by (created_by),
ADD INDEX idx_discounts_usage_count (usage_count),
ADD INDEX idx_discounts_archived (archived_at);

-- Create discount usage tracking table
CREATE TABLE IF NOT EXISTS discount_usage_log (
    id INT PRIMARY KEY AUTO_INCREMENT,
    discount_id INT NOT NULL,
    user_id INT NOT NULL,
    package_id INT NULL,
    original_amount DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) NOT NULL,
    final_amount DECIMAL(10,2) NOT NULL,
    used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45) NULL,
    user_agent TEXT NULL,
    FOREIGN KEY (discount_id) REFERENCES discounts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (package_id) REFERENCES pricing_packages(id) ON DELETE SET NULL,
    INDEX idx_discount_usage_discount (discount_id),
    INDEX idx_discount_usage_user (user_id),
    INDEX idx_discount_usage_date (used_at)
);

-- Update user_discounts table to support the new system
ALTER TABLE user_discounts 
ADD COLUMN IF NOT EXISTS discount_usage_log_id INT NULL AFTER used_at,
ADD COLUMN IF NOT EXISTS notes TEXT NULL AFTER discount_usage_log_id;

ALTER TABLE user_discounts 
ADD CONSTRAINT fk_user_discounts_usage_log 
FOREIGN KEY (discount_usage_log_id) REFERENCES discount_usage_log(id) ON DELETE SET NULL;

-- Clear existing sample data and insert new comprehensive samples
DELETE FROM discounts WHERE id <= 10; -- Remove old samples

INSERT IGNORE INTO discounts (code, name, description, type, value, max_uses, expires_at, status, applicable_to, created_by) VALUES
('WELCOME10', 'Welcome 10% Off', 'New user welcome discount - 10% off any package', 'percentage', 10.00, 100, DATE_ADD(NOW(), INTERVAL 90 DAY), 'valid', '["all"]', 1),
('SAVE20', '20 Dollar Savings', 'Fixed $20 off for any package over $50', 'fixed_amount', 20.00, 50, DATE_ADD(NOW(), INTERVAL 60 DAY), 'valid', '["all"]', 1),
('FREELANCE50', 'Freelancer Special', '50% off Professional and Enterprise packages', 'percentage', 50.00, 25, DATE_ADD(NOW(), INTERVAL 30 DAY), 'valid', '["Professional Pack", "Enterprise Pack"]', 1),
('FREEPOSTS5', '5 Free Posts', 'Get 5 free job posts - no purchase required', 'free_posts', 5.00, 200, DATE_ADD(NOW(), INTERVAL 120 DAY), 'valid', '["all"]', 1),
('STUDENT25', 'Student Discount', '25% off for verified students', 'percentage', 25.00, NULL, DATE_ADD(NOW(), INTERVAL 365 DAY), 'valid', '["all"]', 1),
('HOLIDAY2024', 'Holiday Special', '30% off all packages - Limited time!', 'percentage', 30.00, 500, DATE_ADD(NOW(), INTERVAL 14 DAY), 'valid', '["all"]', 1),
('LEAKED50', 'Compromised Code', 'This code was leaked and suspended', 'percentage', 50.00, 10, DATE_ADD(NOW(), INTERVAL 30 DAY), 'suspended', '["all"]', 1),
('EXPIRED15', 'Expired Promo', 'This promotion has ended', 'percentage', 15.00, 50, DATE_SUB(NOW(), INTERVAL 5 DAY), 'expired', '["all"]', 1),
('GIFT100', 'VIP Gift Code', 'Special gift code for VIP clients', 'fixed_amount', 100.00, 1, DATE_ADD(NOW(), INTERVAL 365 DAY), 'gift', '["Enterprise Pack"]', 1),
('FREEPOSTS10', '10 Free Posts Gift', 'Premium gift - 10 free job posts', 'free_posts', 10.00, 5, DATE_ADD(NOW(), INTERVAL 180 DAY), 'gift', '["all"]', 1);

-- Insert some sample assigned discounts for testing
INSERT IGNORE INTO user_discounts (user_id, discount_id, assigned_by, status) 
SELECT u.id, d.id, 1, 'available'
FROM users u, discounts d 
WHERE u.role = 'manager' 
AND d.code IN ('WELCOME10', 'STUDENT25') 
AND u.id <= 3
LIMIT 6;
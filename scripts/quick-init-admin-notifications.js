require('dotenv').config();
const mysql = require('mysql2/promise');

async function quickInitAdminNotifications() {
  try {
    console.log('🚀 Quick Admin Notification Setup...');
    
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });

    // Create minimal admin_notifications table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS admin_notifications (
        id INT PRIMARY KEY AUTO_INCREMENT,
        created_by INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        notification_type ENUM('modal', 'chatbot', 'both') DEFAULT 'modal',
        target_audience ENUM('talent', 'manager', 'both', 'specific_users') DEFAULT 'both',
        target_user_ids JSON DEFAULT NULL,
        priority ENUM('low', 'normal', 'high', 'urgent') DEFAULT 'normal',
        display_settings JSON DEFAULT NULL,
        modal_size ENUM('small', 'medium', 'large') DEFAULT 'medium',
        schedule_type ENUM('immediate', 'scheduled', 'recurring') DEFAULT 'immediate',
        scheduled_at DATETIME DEFAULT NULL,
        status ENUM('draft', 'scheduled', 'active', 'completed', 'cancelled') DEFAULT 'draft',
        is_active BOOLEAN DEFAULT TRUE,
        total_sent INT DEFAULT 0,
        total_delivered INT DEFAULT 0,
        total_viewed INT DEFAULT 0,
        total_dismissed INT DEFAULT 0,
        total_clicked INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ admin_notifications table created');

    // Create user preferences table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS user_admin_notification_preferences (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        receive_admin_notifications BOOLEAN DEFAULT TRUE,
        preferred_delivery_method ENUM('modal', 'chatbot', 'both') DEFAULT 'both',
        auto_dismiss_timeout INT DEFAULT 0,
        sound_enabled BOOLEAN DEFAULT TRUE,
        animation_enabled BOOLEAN DEFAULT TRUE,
        respect_quiet_hours BOOLEAN DEFAULT TRUE,
        quiet_hours_start TIME DEFAULT '22:00:00',
        quiet_hours_end TIME DEFAULT '08:00:00',
        min_priority_level ENUM('low', 'normal', 'high', 'urgent') DEFAULT 'low',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_user_preferences (user_id)
      )
    `);
    console.log('✅ user_admin_notification_preferences table created');

    // Create delivery tracking table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS user_notification_deliveries (
        id INT PRIMARY KEY AUTO_INCREMENT,
        admin_notification_id INT NOT NULL,
        user_id INT NOT NULL,
        delivered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        viewed_at TIMESTAMP DEFAULT NULL,
        dismissed_at TIMESTAMP DEFAULT NULL,
        clicked_at TIMESTAMP DEFAULT NULL,
        interaction_data JSON DEFAULT NULL,
        delivery_method ENUM('modal', 'chatbot', 'both') NOT NULL,
        device_type VARCHAR(50) DEFAULT NULL,
        user_agent TEXT DEFAULT NULL,
        ip_address VARCHAR(45) DEFAULT NULL,
        UNIQUE KEY unique_notification_user (admin_notification_id, user_id)
      )
    `);
    console.log('✅ user_notification_deliveries table created');

    await connection.end();
    console.log('🎉 Quick setup complete! You can now test the admin notifications.');
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    throw error;
  }
}

if (require.main === module) {
  quickInitAdminNotifications()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { quickInitAdminNotifications };
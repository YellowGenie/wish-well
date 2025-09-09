require('dotenv').config();
const { pool } = require('../config/database');

async function initializeAdminNotifications() {
  let connection;
  
  try {
    console.log('🔧 Initializing Admin Notification System...');
    
    connection = await pool.getConnection();
    
    console.log('📝 Creating admin_notifications table...');
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
        timezone VARCHAR(50) DEFAULT 'UTC',
        
        recurring_pattern ENUM('daily', 'weekly', 'monthly') DEFAULT NULL,
        recurring_interval INT DEFAULT 1,
        recurring_days_of_week JSON DEFAULT NULL,
        recurring_end_date DATE DEFAULT NULL,
        max_occurrences INT DEFAULT NULL,
        
        status ENUM('draft', 'scheduled', 'active', 'completed', 'cancelled') DEFAULT 'draft',
        is_active BOOLEAN DEFAULT TRUE,
        
        total_sent INT DEFAULT 0,
        total_delivered INT DEFAULT 0,
        total_viewed INT DEFAULT 0,
        total_dismissed INT DEFAULT 0,
        total_clicked INT DEFAULT 0,
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_target_audience (target_audience),
        INDEX idx_status (status),
        INDEX idx_scheduled_at (scheduled_at),
        INDEX idx_created_at (created_at)
      )
    `);

    console.log('📝 Creating user_notification_deliveries table...');
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
        
        FOREIGN KEY (admin_notification_id) REFERENCES admin_notifications(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_notification_user (admin_notification_id, user_id),
        INDEX idx_user_id (user_id),
        INDEX idx_delivered_at (delivered_at),
        INDEX idx_viewed_at (viewed_at)
      )
    `);

    console.log('📝 Creating admin_notification_templates table...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS admin_notification_templates (
        id INT PRIMARY KEY AUTO_INCREMENT,
        created_by INT NOT NULL,
        template_name VARCHAR(255) NOT NULL,
        template_description TEXT DEFAULT NULL,
        
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        notification_type ENUM('modal', 'chatbot', 'both') DEFAULT 'modal',
        display_settings JSON DEFAULT NULL,
        modal_size ENUM('small', 'medium', 'large') DEFAULT 'medium',
        
        default_target_audience ENUM('talent', 'manager', 'both', 'specific_users') DEFAULT 'both',
        default_priority ENUM('low', 'normal', 'high', 'urgent') DEFAULT 'normal',
        
        is_active BOOLEAN DEFAULT TRUE,
        usage_count INT DEFAULT 0,
        last_used_at TIMESTAMP DEFAULT NULL,
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_created_by (created_by),
        INDEX idx_is_active (is_active),
        INDEX idx_template_name (template_name)
      )
    `);

    console.log('📝 Creating user_admin_notification_preferences table...');
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
        
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_preferences (user_id)
      )
    `);

    console.log('📝 Creating default preferences for existing users...');
    await connection.execute(`
      INSERT IGNORE INTO user_admin_notification_preferences (user_id)
      SELECT id FROM users 
      WHERE id NOT IN (SELECT user_id FROM user_admin_notification_preferences)
    `);

    console.log('📝 Creating sample templates...');
    // Check if admin user exists
    const [adminCheck] = await connection.execute(`
      SELECT id FROM users WHERE role = 'admin' LIMIT 1
    `);

    if (adminCheck.length > 0) {
      const adminId = adminCheck[0].id;
      
      const sampleTemplates = [
        {
          template_name: 'System Maintenance',
          template_description: 'Notify users about scheduled system maintenance',
          title: 'Scheduled System Maintenance',
          message: 'We will be performing scheduled maintenance on {date} from {start_time} to {end_time}. During this time, the platform may be temporarily unavailable. We apologize for any inconvenience.',
          notification_type: 'both',
          display_settings: JSON.stringify({
            theme: 'warning',
            dismissible: true,
            autoClose: false,
            showIcon: true,
            actionButtons: [{ text: 'Got it', action: 'dismiss' }]
          }),
          default_priority: 'high'
        },
        {
          template_name: 'Welcome Message',
          template_description: 'Welcome new users to the platform',
          title: 'Welcome to Dozyr!',
          message: 'Welcome {user_name}! We\'re thrilled to have you join our community. Get started by completing your profile and exploring opportunities.',
          notification_type: 'modal',
          display_settings: JSON.stringify({
            theme: 'success',
            dismissible: true,
            autoClose: false,
            showIcon: true,
            actionButtons: [
              { text: 'Complete Profile', action: 'redirect', url: '/profile/edit' },
              { text: 'Explore Jobs', action: 'redirect', url: '/jobs' }
            ]
          }),
          default_priority: 'normal'
        }
      ];

      for (const template of sampleTemplates) {
        await connection.execute(`
          INSERT IGNORE INTO admin_notification_templates (
            created_by, template_name, template_description, title, message,
            notification_type, display_settings, default_target_audience, default_priority
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'both', ?)
        `, [
          adminId,
          template.template_name,
          template.template_description,
          template.title,
          template.message,
          template.notification_type,
          template.display_settings,
          template.default_priority
        ]);
      }
      
      console.log('✅ Sample templates created');
    } else {
      console.log('⚠️ No admin user found, skipping template creation');
    }

    console.log('✅ Admin notification system initialized successfully!');

  } catch (error) {
    console.error('❌ Error initializing admin notifications:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// Run initialization
if (require.main === module) {
  initializeAdminNotifications()
    .then(() => {
      console.log('🎉 Initialization complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Initialization failed:', error);
      process.exit(1);
    });
}

module.exports = { initializeAdminNotifications };
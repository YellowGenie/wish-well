const mysql = require('mysql2/promise');
require('dotenv').config();

async function createAdminNotificationSchema() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    console.log('Creating admin notification system tables...');

    // Admin Notifications Table - For admin-created notifications
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
        
        -- Display preferences
        display_settings JSON DEFAULT NULL, -- {theme: 'info|success|warning|error', dismissible: true/false, autoClose: false/duration}
        modal_size ENUM('small', 'medium', 'large') DEFAULT 'medium',
        
        -- Scheduling options
        schedule_type ENUM('immediate', 'scheduled', 'recurring') DEFAULT 'immediate',
        scheduled_at DATETIME DEFAULT NULL,
        timezone VARCHAR(50) DEFAULT 'UTC',
        
        -- Recurring options
        recurring_pattern ENUM('daily', 'weekly', 'monthly') DEFAULT NULL,
        recurring_interval INT DEFAULT 1, -- every X days/weeks/months
        recurring_days_of_week JSON DEFAULT NULL, -- [0,1,2,3,4,5,6] for Sunday-Saturday
        recurring_end_date DATE DEFAULT NULL,
        max_occurrences INT DEFAULT NULL,
        
        -- Status tracking
        status ENUM('draft', 'scheduled', 'active', 'completed', 'cancelled') DEFAULT 'draft',
        is_active BOOLEAN DEFAULT TRUE,
        
        -- Analytics
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

    // User Notification Deliveries - Track delivery to individual users
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS user_notification_deliveries (
        id INT PRIMARY KEY AUTO_INCREMENT,
        admin_notification_id INT NOT NULL,
        user_id INT NOT NULL,
        
        -- Delivery tracking
        delivered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        viewed_at TIMESTAMP DEFAULT NULL,
        dismissed_at TIMESTAMP DEFAULT NULL,
        clicked_at TIMESTAMP DEFAULT NULL,
        
        -- User interaction data
        interaction_data JSON DEFAULT NULL, -- track clicks, time spent, etc.
        
        -- Delivery metadata
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

    // Notification Templates - For reusable notification templates
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS admin_notification_templates (
        id INT PRIMARY KEY AUTO_INCREMENT,
        created_by INT NOT NULL,
        template_name VARCHAR(255) NOT NULL,
        template_description TEXT DEFAULT NULL,
        
        -- Template content
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        notification_type ENUM('modal', 'chatbot', 'both') DEFAULT 'modal',
        display_settings JSON DEFAULT NULL,
        modal_size ENUM('small', 'medium', 'large') DEFAULT 'medium',
        
        -- Default targeting
        default_target_audience ENUM('talent', 'manager', 'both', 'specific_users') DEFAULT 'both',
        default_priority ENUM('low', 'normal', 'high', 'urgent') DEFAULT 'normal',
        
        -- Template metadata
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

    // Notification Schedule Occurrences - For tracking recurring notification instances
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS notification_schedule_occurrences (
        id INT PRIMARY KEY AUTO_INCREMENT,
        admin_notification_id INT NOT NULL,
        occurrence_number INT NOT NULL,
        scheduled_for DATETIME NOT NULL,
        
        -- Status tracking
        status ENUM('pending', 'processing', 'completed', 'failed', 'skipped') DEFAULT 'pending',
        executed_at TIMESTAMP DEFAULT NULL,
        error_message TEXT DEFAULT NULL,
        
        -- Metrics for this occurrence
        users_targeted INT DEFAULT 0,
        notifications_sent INT DEFAULT 0,
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        FOREIGN KEY (admin_notification_id) REFERENCES admin_notifications(id) ON DELETE CASCADE,
        UNIQUE KEY unique_notification_occurrence (admin_notification_id, occurrence_number),
        INDEX idx_scheduled_for (scheduled_for),
        INDEX idx_status (status)
      )
    `);

    // User Notification Preferences - Enhanced preferences for admin notifications
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS user_admin_notification_preferences (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        
        -- Admin notification preferences
        receive_admin_notifications BOOLEAN DEFAULT TRUE,
        preferred_delivery_method ENUM('modal', 'chatbot', 'both') DEFAULT 'both',
        
        -- Display preferences
        auto_dismiss_timeout INT DEFAULT 0, -- 0 = no auto dismiss, else seconds
        sound_enabled BOOLEAN DEFAULT TRUE,
        animation_enabled BOOLEAN DEFAULT TRUE,
        
        -- Quiet hours for admin notifications
        respect_quiet_hours BOOLEAN DEFAULT TRUE,
        quiet_hours_start TIME DEFAULT '22:00:00',
        quiet_hours_end TIME DEFAULT '08:00:00',
        
        -- Priority filtering
        min_priority_level ENUM('low', 'normal', 'high', 'urgent') DEFAULT 'low',
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_preferences (user_id)
      )
    `);

    // Admin Notification Analytics - For detailed reporting
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS admin_notification_analytics (
        id INT PRIMARY KEY AUTO_INCREMENT,
        admin_notification_id INT NOT NULL,
        date DATE NOT NULL,
        
        -- Daily metrics
        notifications_sent INT DEFAULT 0,
        notifications_delivered INT DEFAULT 0,
        notifications_viewed INT DEFAULT 0,
        notifications_dismissed INT DEFAULT 0,
        notifications_clicked INT DEFAULT 0,
        
        -- Performance metrics
        avg_view_time DECIMAL(10,2) DEFAULT 0, -- in seconds
        bounce_rate DECIMAL(5,2) DEFAULT 0, -- percentage
        
        -- Audience breakdown
        talent_recipients INT DEFAULT 0,
        manager_recipients INT DEFAULT 0,
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        FOREIGN KEY (admin_notification_id) REFERENCES admin_notifications(id) ON DELETE CASCADE,
        UNIQUE KEY unique_notification_date (admin_notification_id, date),
        INDEX idx_date (date)
      )
    `);

    console.log('✅ Admin notification schema created successfully!');

    // Insert default notification preferences for existing users
    await connection.execute(`
      INSERT INTO user_admin_notification_preferences (user_id)
      SELECT id FROM users 
      WHERE id NOT IN (SELECT user_id FROM user_admin_notification_preferences)
    `);

    console.log('✅ Default preferences created for existing users');

    // Create some sample notification templates
    const sampleTemplates = [
      {
        template_name: 'System Maintenance',
        template_description: 'Notify users about scheduled system maintenance',
        title: 'Scheduled System Maintenance',
        message: 'We will be performing scheduled maintenance on {date} from {start_time} to {end_time}. During this time, the platform may be temporarily unavailable.',
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
        template_name: 'New Feature Announcement',
        template_description: 'Announce new features to users',
        title: 'New Feature: {feature_name}',
        message: 'We\'re excited to introduce {feature_name}! {feature_description}. Try it out now and let us know what you think.',
        notification_type: 'modal',
        display_settings: JSON.stringify({
          theme: 'success',
          dismissible: true,
          autoClose: false,
          showIcon: true,
          actionButtons: [
            { text: 'Try Now', action: 'redirect', url: '{feature_url}' },
            { text: 'Later', action: 'dismiss' }
          ]
        }),
        default_priority: 'normal'
      },
      {
        template_name: 'Important Update',
        template_description: 'Share important updates with users',
        title: 'Important Update',
        message: '{update_message}',
        notification_type: 'both',
        display_settings: JSON.stringify({
          theme: 'info',
          dismissible: true,
          autoClose: false,
          showIcon: true,
          actionButtons: [{ text: 'Acknowledge', action: 'dismiss' }]
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
        INSERT INTO admin_notification_templates (
          created_by, template_name, template_description, title, message,
          notification_type, display_settings, default_target_audience, default_priority
        ) VALUES (
          (SELECT id FROM users WHERE role = 'admin' LIMIT 1),
          ?, ?, ?, ?, ?, ?, 'both', ?
        )
      `, [
        template.template_name,
        template.template_description,
        template.title,
        template.message,
        template.notification_type,
        template.display_settings,
        template.default_priority
      ]);
    }

    console.log('✅ Sample notification templates created');

  } catch (error) {
    console.error('❌ Error creating admin notification schema:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

// Run the schema creation
if (require.main === module) {
  createAdminNotificationSchema()
    .then(() => {
      console.log('🎉 Admin notification system setup completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Setup failed:', error);
      process.exit(1);
    });
}

module.exports = { createAdminNotificationSchema };
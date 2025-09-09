require('dotenv').config();
const mysql = require('mysql2/promise');

async function createAdminTemplatesTable() {
  try {
    console.log('🔧 Creating admin notification templates table...');
    
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });

    // Create admin_notification_templates table
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS admin_notification_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        created_by INT NOT NULL,
        template_name VARCHAR(100) NOT NULL UNIQUE,
        template_description TEXT,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        notification_type ENUM('modal', 'chatbot', 'both') DEFAULT 'modal',
        display_settings JSON,
        modal_size ENUM('small', 'medium', 'large', 'extra-large') DEFAULT 'medium',
        default_target_audience ENUM('talent', 'manager', 'both', 'specific_users') DEFAULT 'both',
        default_priority ENUM('low', 'normal', 'high', 'urgent') DEFAULT 'normal',
        is_active BOOLEAN DEFAULT true,
        usage_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_template_name (template_name),
        INDEX idx_created_by (created_by),
        INDEX idx_is_active (is_active)
      )
    `;

    await connection.execute(createTableQuery);
    console.log('✅ admin_notification_templates table created successfully');

    // Insert some default templates
    const defaultTemplates = [
      {
        created_by: 1, // Assuming admin user has ID 1
        template_name: 'maintenance_notification',
        template_description: 'Template for scheduled maintenance notifications',
        title: 'Scheduled Maintenance',
        message: 'We will be performing scheduled maintenance on {date} from {start_time} to {end_time}. During this time, some features may be temporarily unavailable.',
        notification_type: 'modal',
        default_priority: 'high'
      },
      {
        created_by: 1,
        template_name: 'welcome_announcement',
        template_description: 'Welcome message for new features',
        title: 'Welcome to New Features!',
        message: 'We\'re excited to announce new features that will help you {benefit}. Click here to learn more!',
        notification_type: 'both',
        default_priority: 'normal'
      },
      {
        created_by: 1,
        template_name: 'urgent_update',
        template_description: 'Template for urgent system updates',
        title: 'Urgent Update Required',
        message: 'An important update is available. Please {action} to continue using our services securely.',
        notification_type: 'modal',
        default_priority: 'urgent'
      }
    ];

    for (const template of defaultTemplates) {
      try {
        await connection.execute(`
          INSERT INTO admin_notification_templates (
            created_by, template_name, template_description, title, message,
            notification_type, default_priority
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          template.created_by,
          template.template_name,
          template.template_description,
          template.title,
          template.message,
          template.notification_type,
          template.default_priority
        ]);
        console.log(`✅ Created template: ${template.template_name}`);
      } catch (insertError) {
        if (insertError.code === 'ER_DUP_ENTRY') {
          console.log(`⚠️ Template ${template.template_name} already exists, skipping...`);
        } else {
          console.error(`Error inserting template ${template.template_name}:`, insertError.message);
        }
      }
    }

    await connection.end();
    console.log('🎉 Admin notification templates table setup complete!');
    
  } catch (error) {
    console.error('❌ Error setting up admin templates table:', error.message);
    throw error;
  }
}

if (require.main === module) {
  createAdminTemplatesTable()
    .then(() => {
      console.log('✅ Admin templates table creation completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { createAdminTemplatesTable };
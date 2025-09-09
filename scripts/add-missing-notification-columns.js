require('dotenv').config();
const mysql = require('mysql2/promise');

async function addMissingNotificationColumns() {
  try {
    console.log('🔧 Adding missing columns to admin_notifications table...');
    
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });

    // Add missing columns one by one to avoid issues if some already exist
    const columnsToAdd = [
      {
        name: 'timezone',
        definition: 'VARCHAR(50) DEFAULT "UTC"',
        description: 'timezone for scheduling'
      },
      {
        name: 'recurring_pattern',
        definition: 'ENUM("daily", "weekly", "monthly") DEFAULT NULL',
        description: 'recurring pattern type'
      },
      {
        name: 'recurring_interval',
        definition: 'INT DEFAULT 1',
        description: 'recurring interval'
      },
      {
        name: 'recurring_days_of_week',
        definition: 'JSON DEFAULT NULL',
        description: 'days of week for recurring notifications'
      },
      {
        name: 'recurring_end_date',
        definition: 'DATETIME DEFAULT NULL',
        description: 'end date for recurring notifications'
      },
      {
        name: 'max_occurrences',
        definition: 'INT DEFAULT NULL',
        description: 'maximum occurrences for recurring notifications'
      }
    ];

    for (const column of columnsToAdd) {
      try {
        await connection.execute(`
          ALTER TABLE admin_notifications 
          ADD COLUMN ${column.name} ${column.definition}
        `);
        console.log(`✅ Added column: ${column.name} (${column.description})`);
      } catch (error) {
        if (error.code === 'ER_DUP_FIELDNAME') {
          console.log(`⚠️ Column ${column.name} already exists, skipping...`);
        } else {
          console.error(`❌ Error adding column ${column.name}:`, error.message);
        }
      }
    }

    await connection.end();
    console.log('🎉 Missing columns migration complete!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  }
}

if (require.main === module) {
  addMissingNotificationColumns()
    .then(() => {
      console.log('✅ Database migration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { addMissingNotificationColumns };
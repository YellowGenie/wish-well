const mysql = require('mysql2/promise');
const fs = require('fs');
require('dotenv').config();

async function runMigration() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    // First run admin dashboard migration
    console.log('Running admin dashboard migration...');
    const adminSql = fs.readFileSync('config/admin_dashboard_migration.sql', 'utf8');
    const adminStatements = adminSql.split(';').filter(s => s.trim());
    
    for (const statement of adminStatements) {
      if (statement.trim()) {
        try {
          await pool.execute(statement.trim());
        } catch(e) {
          if (!e.message.includes('Duplicate') && !e.message.includes('already exists')) {
            console.log('Admin migration warning:', e.message.substring(0,100));
          }
        }
      }
    }
    console.log('✅ Admin dashboard migration completed');

    // Now run discount system migration
    console.log('Running discount system migration...');
    const discountSql = fs.readFileSync('config/discount_system_migration.sql', 'utf8');
    const discountStatements = discountSql.split(';').filter(s => s.trim());
    
    for (const statement of discountStatements) {
      if (statement.trim()) {
        try {
          await pool.execute(statement.trim());
        } catch(e) {
          if (!e.message.includes('Duplicate') && !e.message.includes('already exists')) {
            console.log('Discount migration warning:', e.message.substring(0,100));
          }
        }
      }
    }
    console.log('✅ Discount system migration completed');

  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    await pool.end();
  }
}

runMigration();
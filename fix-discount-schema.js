const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixDiscountSchema() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    console.log('Adding missing columns to discounts table...');

    // Add status column
    try {
      await pool.execute(`
        ALTER TABLE discounts 
        ADD COLUMN status ENUM('valid', 'expired', 'suspended', 'gift') NOT NULL DEFAULT 'valid' AFTER is_active
      `);
      console.log('✅ Added status column');
    } catch(e) {
      if (!e.message.includes('Duplicate')) console.log('Status column:', e.message);
    }

    // Add usage_count column  
    try {
      await pool.execute(`
        ALTER TABLE discounts 
        ADD COLUMN usage_count INT NOT NULL DEFAULT 0 AFTER max_uses
      `);
      console.log('✅ Added usage_count column');
    } catch(e) {
      if (!e.message.includes('Duplicate')) console.log('Usage count column:', e.message);
    }

    // Add created_by column
    try {
      await pool.execute(`
        ALTER TABLE discounts 
        ADD COLUMN created_by INT NULL AFTER created_at
      `);
      console.log('✅ Added created_by column');
    } catch(e) {
      if (!e.message.includes('Duplicate')) console.log('Created by column:', e.message);
    }

    // Add archived columns
    try {
      await pool.execute(`
        ALTER TABLE discounts 
        ADD COLUMN archived_at TIMESTAMP NULL AFTER created_by,
        ADD COLUMN archived_by INT NULL AFTER archived_at
      `);
      console.log('✅ Added archived columns');
    } catch(e) {
      if (!e.message.includes('Duplicate')) console.log('Archived columns:', e.message);
    }

    // Add missing fields for better discount management
    try {
      await pool.execute(`
        ALTER TABLE discounts 
        ADD COLUMN min_purchase_amount DECIMAL(10,2) NULL AFTER value,
        ADD COLUMN applicable_to JSON NULL AFTER expires_at,
        ADD COLUMN user_restrictions JSON NULL AFTER applicable_to
      `);
      console.log('✅ Added additional fields');
    } catch(e) {
      if (!e.message.includes('Duplicate')) console.log('Additional fields:', e.message);
    }

    // Update existing data with default status
    await pool.execute(`UPDATE discounts SET status = 'valid' WHERE status IS NULL`);
    console.log('✅ Updated existing records with default status');

    // Create discount usage log table
    try {
      await pool.execute(`
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
          INDEX idx_discount_usage_discount (discount_id),
          INDEX idx_discount_usage_user (user_id),
          INDEX idx_discount_usage_date (used_at)
        )
      `);
      console.log('✅ Created discount_usage_log table');
    } catch(e) {
      if (!e.message.includes('already exists')) console.log('Usage log table:', e.message);
    }

    // Insert sample discount data
    console.log('Inserting sample discount data...');
    
    // Clear existing test data
    await pool.execute(`DELETE FROM discounts`);
    
    const sampleDiscounts = [
      ['WELCOME10', 'Welcome 10% Off', 'New user welcome discount - 10% off any package', 'percentage', 10.00, null, 100, 0, 'valid', JSON.stringify(['all']), null, new Date(Date.now() + 90*24*60*60*1000)],
      ['SAVE20', '20 Dollar Savings', 'Fixed $20 off for any package over $50', 'fixed_amount', 20.00, 50.00, 50, 0, 'valid', JSON.stringify(['all']), null, new Date(Date.now() + 60*24*60*60*1000)],
      ['FREELANCE50', 'Freelancer Special', '50% off Professional and Enterprise packages', 'percentage', 50.00, null, 25, 0, 'valid', JSON.stringify(['Professional Pack', 'Enterprise Pack']), null, new Date(Date.now() + 30*24*60*60*1000)],
      ['FREEPOSTS5', '5 Free Posts', 'Get 5 free job posts - no purchase required', 'free_posts', 5.00, null, 200, 0, 'valid', JSON.stringify(['all']), null, new Date(Date.now() + 120*24*60*60*1000)],
      ['STUDENT25', 'Student Discount', '25% off for verified students', 'percentage', 25.00, null, null, 0, 'valid', JSON.stringify(['all']), null, new Date(Date.now() + 365*24*60*60*1000)],
      ['HOLIDAY2024', 'Holiday Special', '30% off all packages - Limited time!', 'percentage', 30.00, null, 500, 0, 'valid', JSON.stringify(['all']), null, new Date(Date.now() + 14*24*60*60*1000)],
      ['LEAKED50', 'Compromised Code', 'This code was leaked and suspended', 'percentage', 50.00, null, 10, 0, 'suspended', JSON.stringify(['all']), null, new Date(Date.now() + 30*24*60*60*1000)],
      ['EXPIRED15', 'Expired Promo', 'This promotion has ended', 'percentage', 15.00, null, 50, 0, 'expired', JSON.stringify(['all']), null, new Date(Date.now() - 5*24*60*60*1000)],
      ['GIFT100', 'VIP Gift Code', 'Special gift code for VIP clients', 'fixed_amount', 100.00, null, 1, 0, 'gift', JSON.stringify(['Enterprise Pack']), null, new Date(Date.now() + 365*24*60*60*1000)],
      ['FREEPOSTS10', '10 Free Posts Gift', 'Premium gift - 10 free job posts', 'free_posts', 10.00, null, 5, 0, 'gift', JSON.stringify(['all']), null, new Date(Date.now() + 180*24*60*60*1000)]
    ];

    for (const discount of sampleDiscounts) {
      try {
        await pool.execute(`
          INSERT INTO discounts (code, name, description, type, value, min_purchase_amount, max_uses, usage_count, status, applicable_to, user_restrictions, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, discount);
      } catch(e) {
        console.log('Sample data error:', e.message);
      }
    }

    console.log('✅ Sample discount data inserted');
    console.log('🎉 Discount system schema fixed successfully!');

  } catch (error) {
    console.error('Schema fix error:', error);
  } finally {
    await pool.end();
  }
}

fixDiscountSchema();
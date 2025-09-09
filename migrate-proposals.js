require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrate() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root', 
    password: process.env.DB_PASSWORD || 'access123',
    database: process.env.DB_NAME || 'dozyr_db'
  });
  
  try {
    console.log('🔧 Running proposal enhancement migration...');
    
    // Check existing columns
    const [columns] = await conn.execute('SHOW COLUMNS FROM proposals');
    const existingColumns = columns.map(col => col.Field);
    console.log('Existing columns:', existingColumns);
    
    // Add new columns
    if (!existingColumns.includes('draft_offering')) {
      await conn.execute('ALTER TABLE proposals ADD COLUMN draft_offering TEXT');
      console.log('✅ Added draft_offering column');
    } else {
      console.log('⏭️ draft_offering column already exists');
    }
    
    if (!existingColumns.includes('pricing_details')) {
      await conn.execute('ALTER TABLE proposals ADD COLUMN pricing_details TEXT');
      console.log('✅ Added pricing_details column');
    } else {
      console.log('⏭️ pricing_details column already exists');
    }
    
    if (!existingColumns.includes('availability')) {
      await conn.execute('ALTER TABLE proposals ADD COLUMN availability TEXT');
      console.log('✅ Added availability column');
    } else {
      console.log('⏭️ availability column already exists');
    }
    
    if (!existingColumns.includes('viewed_by_manager')) {
      await conn.execute('ALTER TABLE proposals ADD COLUMN viewed_by_manager BOOLEAN DEFAULT FALSE');
      console.log('✅ Added viewed_by_manager column');
    } else {
      console.log('⏭️ viewed_by_manager column already exists');
    }
    
    // Update status enum
    console.log('🔧 Updating status enum...');
    await conn.execute(`ALTER TABLE proposals MODIFY COLUMN status ENUM('pending', 'accepted', 'rejected', 'withdrawn', 'interview', 'approved', 'no_longer_accepting', 'inappropriate') DEFAULT 'pending'`);
    console.log('✅ Updated status enum');
    
    // Add indexes
    console.log('🔧 Adding indexes...');
    try {
      await conn.execute('CREATE INDEX idx_proposals_job_viewed ON proposals(job_id, viewed_by_manager)');
      console.log('✅ Added job_viewed index');
    } catch (err) {
      if (err.code === 'ER_DUP_KEYNAME') {
        console.log('⏭️ job_viewed index already exists');
      } else {
        throw err;
      }
    }
    
    try {
      await conn.execute('CREATE INDEX idx_proposals_status ON proposals(status)');
      console.log('✅ Added status index');
    } catch (err) {
      if (err.code === 'ER_DUP_KEYNAME') {
        console.log('⏭️ status index already exists');
      } else {
        throw err;
      }
    }
    
    try {
      await conn.execute('CREATE INDEX idx_proposals_job_status ON proposals(job_id, status)');
      console.log('✅ Added job_status index');
    } catch (err) {
      if (err.code === 'ER_DUP_KEYNAME') {
        console.log('⏭️ job_status index already exists');
      } else {
        throw err;
      }
    }
    
    // Update existing proposals
    const [result] = await conn.execute('UPDATE proposals SET viewed_by_manager = TRUE WHERE status IN ("accepted", "rejected")');
    console.log(`✅ Updated ${result.affectedRows} existing proposals`);
    
    console.log('🎉 Migration completed successfully!');
    
    // Show updated table structure
    const [newColumns] = await conn.execute('DESCRIBE proposals');
    console.log('\n📋 Updated proposals table structure:');
    newColumns.forEach(row => {
      console.log(`  ${row.Field}: ${row.Type} ${row.Null} ${row.Key} ${row.Default}`);
    });
    
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  }
  
  await conn.end();
}

migrate();
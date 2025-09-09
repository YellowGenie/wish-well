const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'wishing_well',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function clearDemoTalentData() {
  const connection = await pool.getConnection();
  
  try {
    console.log('🧹 Starting demo talent data cleanup...');
    
    // Start transaction for safety
    await connection.beginTransaction();
    
    // 1. Get count of current talent profiles
    const [talentCount] = await connection.execute('SELECT COUNT(*) as count FROM talent_profiles');
    console.log(`📊 Found ${talentCount[0].count} talent profiles to remove`);
    
    // 2. Get count of talent skills 
    const [skillsCount] = await connection.execute('SELECT COUNT(*) as count FROM talent_skills');
    console.log(`📊 Found ${skillsCount[0].count} talent skill relationships to remove`);
    
    // 3. Get count of users with talent role
    const [usersCount] = await connection.execute('SELECT COUNT(*) as count FROM users WHERE role = "talent"');
    console.log(`📊 Found ${usersCount[0].count} talent users to remove`);
    
    console.log('\n🗑️ Clearing talent data...');
    
    // 4. Clear talent skills (foreign key constraint)
    const [skillsResult] = await connection.execute('DELETE FROM talent_skills');
    console.log(`✅ Cleared ${skillsResult.affectedRows} talent skill relationships`);
    
    // 5. Clear talent profiles 
    const [profilesResult] = await connection.execute('DELETE FROM talent_profiles');
    console.log(`✅ Cleared ${profilesResult.affectedRows} talent profiles`);
    
    // 6. Clear users with talent role (be careful - only remove talent users)
    const [usersResult] = await connection.execute('DELETE FROM users WHERE role = "talent"');
    console.log(`✅ Cleared ${usersResult.affectedRows} talent user accounts`);
    
    // 7. Reset auto increment IDs for clean slate
    await connection.execute('ALTER TABLE talent_profiles AUTO_INCREMENT = 1');
    await connection.execute('ALTER TABLE talent_skills AUTO_INCREMENT = 1');
    console.log('✅ Reset auto increment IDs');
    
    // Commit transaction
    await connection.commit();
    
    console.log('\n🎉 Demo talent data cleanup completed successfully!');
    console.log('📝 Summary:');
    console.log(`   - Removed ${profilesResult.affectedRows} talent profiles`);
    console.log(`   - Removed ${skillsResult.affectedRows} talent skill relationships`);  
    console.log(`   - Removed ${usersResult.affectedRows} talent user accounts`);
    console.log('   - Reset auto increment counters');
    console.log('\n✨ Database is now clean and ready for new talent signups!');
    
  } catch (error) {
    // Rollback transaction on error
    await connection.rollback();
    console.error('❌ Error clearing demo talent data:', error);
    console.log('🔄 Transaction rolled back - no changes made');
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

// Run the cleanup
if (require.main === module) {
  clearDemoTalentData()
    .then(() => {
      console.log('\n🚀 Cleanup script completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Cleanup script failed:', error.message);
      process.exit(1);
    });
}

module.exports = { clearDemoTalentData };
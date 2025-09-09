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

async function verifyCleanDatabase() {
  const connection = await pool.getConnection();
  
  try {
    console.log('🔍 Verifying database cleanup...');
    
    // Check talent profiles
    const [talentCount] = await connection.execute('SELECT COUNT(*) as count FROM talent_profiles');
    console.log(`📊 Talent profiles: ${talentCount[0].count}`);
    
    // Check talent skills
    const [skillsCount] = await connection.execute('SELECT COUNT(*) as count FROM talent_skills');
    console.log(`📊 Talent skills: ${skillsCount[0].count}`);
    
    // Check talent users
    const [talentUsers] = await connection.execute('SELECT COUNT(*) as count FROM users WHERE role = "talent"');
    console.log(`📊 Talent users: ${talentUsers[0].count}`);
    
    // Check other user roles (should be preserved)
    const [adminUsers] = await connection.execute('SELECT COUNT(*) as count FROM users WHERE role = "admin"');
    const [managerUsers] = await connection.execute('SELECT COUNT(*) as count FROM users WHERE role = "manager"');
    console.log(`📊 Admin users: ${adminUsers[0].count} (preserved)`);
    console.log(`📊 Manager users: ${managerUsers[0].count} (preserved)`);
    
    // Check if tables exist and are properly structured
    const [tables] = await connection.execute("SHOW TABLES LIKE '%talent%'");
    console.log(`📊 Talent-related tables: ${tables.length}`);
    tables.forEach(table => {
      const tableName = Object.values(table)[0];
      console.log(`   - ${tableName}`);
    });
    
    const isClean = talentCount[0].count === 0 && skillsCount[0].count === 0 && talentUsers[0].count === 0;
    
    if (isClean) {
      console.log('\n✅ Database is clean and ready for new talent signups!');
      console.log('🎯 New talent users can now register and create profiles');
    } else {
      console.log('\n⚠️ Database cleanup may be incomplete');
    }
    
    return isClean;
    
  } catch (error) {
    console.error('❌ Error verifying database:', error);
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

// Run the verification
if (require.main === module) {
  verifyCleanDatabase()
    .then((isClean) => {
      if (isClean) {
        console.log('\n🎉 Verification completed - Database is clean!');
        process.exit(0);
      } else {
        console.log('\n❌ Verification failed - Database may need additional cleanup');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('💥 Verification script failed:', error.message);
      process.exit(1);
    });
}

module.exports = { verifyCleanDatabase };
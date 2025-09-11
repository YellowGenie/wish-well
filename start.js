#!/usr/bin/env node

/**
 * Production Startup Script for Render
 * 
 * This is the main entry point that will:
 * 1. Test connection to usefivy.com MySQL database
 * 2. Set up database tables if needed
 * 3. Start the Express server
 * 
 * No shell access required!
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

require('dotenv').config();

console.log('🚀 Starting Dozyr Backend on Render...');
console.log('📅 Startup Time:', new Date().toISOString());

// Your specific database configuration for usefivy.com
const dbConfig = {
  host: process.env.DB_HOST || '192.250.234.56',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'usefivy_dozyr_usr',
  password: process.env.DB_PASSWORD || 'Dozyr@2025',
  database: process.env.DB_NAME || 'usefivy_dozyr_db',
  connectTimeout: 60000, // 60 seconds
  acquireTimeout: 60000,
  timeout: 60000,
  charset: 'utf8mb4'
};

console.log('🔧 Database Configuration:');
console.log(`   Host: ${dbConfig.host} (usefivy.com)`);
console.log(`   Port: ${dbConfig.port}`);
console.log(`   User: ${dbConfig.user}`);
console.log(`   Database: ${dbConfig.database}`);

const testConnection = async () => {
  try {
    console.log('🔌 Testing connection to usefivy.com MySQL...');
    const connection = await mysql.createConnection(dbConfig);
    
    const [result] = await connection.execute('SELECT 1 as test, NOW() as time');
    console.log('✅ Database connection successful!');
    console.log(`🕒 Database time: ${result[0].time}`);
    
    await connection.end();
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('Error code:', error.code);
    
    if (error.code === 'ETIMEDOUT') {
      console.error('🔍 Connection timeout to usefivy.com MySQL');
      console.error('💡 Possible causes:');
      console.error('   1. Remote MySQL access not fully enabled in cPanel');
      console.error('   2. Firewall blocking connection from Render');
      console.error('   3. usefivy.com hosting provider blocking external connections');
      console.error('');
      console.error('🔧 Solutions to try:');
      console.error('   1. Contact usefivy.com support about remote MySQL access');
      console.error('   2. Ask them to whitelist external IP connections');
      console.error('   3. Verify Remote MySQL settings in cPanel');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('🔍 Connection refused by usefivy.com');
      console.error('💡 Remote MySQL might not be enabled');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('🔍 Access denied - check credentials');
    }
    
    return false;
  }
};

const checkTablesExist = async () => {
  try {
    const connection = await mysql.createConnection(dbConfig);
    const [tables] = await connection.execute('SHOW TABLES');
    await connection.end();
    
    const tableNames = tables.map(row => Object.values(row)[0]);
    const requiredTables = ['users', 'talent_profiles', 'manager_profiles'];
    const hasRequiredTables = requiredTables.every(table => tableNames.includes(table));
    
    console.log(`📊 Found ${tables.length} existing tables`);
    
    if (hasRequiredTables) {
      console.log('✅ Core tables exist, database ready');
      return true;
    } else {
      console.log('📝 Database setup needed');
      return false;
    }
  } catch (error) {
    console.log('📝 Database setup needed (could not check tables)');
    return false;
  }
};

const setupDatabase = async () => {
  try {
    console.log('🔧 Setting up database tables...');
    
    const connection = await mysql.createConnection(dbConfig);
    
    // Create core tables first
    console.log('📋 Creating users table...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role ENUM('talent', 'manager', 'admin') NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        profile_image VARCHAR(500),
        is_active BOOLEAN DEFAULT true,
        email_verified BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ users table created');

    console.log('📋 Creating talent_profiles table...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS talent_profiles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNIQUE NOT NULL,
        title VARCHAR(255),
        bio TEXT,
        hourly_rate DECIMAL(10,2),
        availability ENUM('full-time', 'part-time', 'contract') DEFAULT 'contract',
        location VARCHAR(255),
        portfolio_description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ talent_profiles table created');

    console.log('📋 Creating manager_profiles table...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS manager_profiles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNIQUE NOT NULL,
        company_name VARCHAR(255),
        company_description TEXT,
        company_size ENUM('1-10', '11-50', '51-200', '201-500', '500+'),
        industry VARCHAR(255),
        location VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ manager_profiles table created');

    console.log('📋 Creating additional core tables...');
    
    // Create other essential tables
    const coreStatements = [
      `CREATE TABLE IF NOT EXISTS skills (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        category VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS jobs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        manager_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        budget_type ENUM('fixed', 'hourly') NOT NULL,
        budget_min DECIMAL(10,2),
        budget_max DECIMAL(10,2),
        currency VARCHAR(3) DEFAULT 'USD',
        status ENUM('open', 'in_progress', 'completed', 'cancelled') DEFAULT 'open',
        category VARCHAR(100),
        deadline DATE,
        experience_level ENUM('entry', 'intermediate', 'expert') DEFAULT 'intermediate',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (manager_id) REFERENCES manager_profiles(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS proposals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        job_id INT NOT NULL,
        talent_id INT NOT NULL,
        cover_letter TEXT NOT NULL,
        bid_amount DECIMAL(10,2) NOT NULL,
        timeline_days INT,
        status ENUM('pending', 'accepted', 'rejected', 'withdrawn') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (talent_id) REFERENCES talent_profiles(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        job_id INT NOT NULL,
        sender_id INT NOT NULL,
        receiver_id INT NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
      )`
    ];

    for (const statement of coreStatements) {
      try {
        await connection.execute(statement);
      } catch (error) {
        console.warn(`⚠️ Warning:`, error.message);
      }
    }
    
    await connection.end();
    console.log('✅ Core database setup completed!');
    
    return true;
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    return false;
  }
};

const startServer = () => {
  console.log('🚀 Starting Express server...');
  
  // Start the main server with updated environment
  const serverEnv = {
    ...process.env,
    DB_HOST: dbConfig.host,
    DB_USER: dbConfig.user,
    DB_PASSWORD: dbConfig.password,
    DB_NAME: dbConfig.database,
    DB_PORT: dbConfig.port
  };
  
  const server = spawn('node', ['server.js'], {
    stdio: 'inherit',
    env: serverEnv
  });
  
  server.on('error', (error) => {
    console.error('❌ Server startup error:', error);
    process.exit(1);
  });
  
  server.on('exit', (code) => {
    console.log(`Server exited with code ${code}`);
    process.exit(code);
  });
  
  // Handle shutdown signals
  process.on('SIGINT', () => {
    console.log('🛑 Shutting down...');
    server.kill('SIGINT');
  });
  
  process.on('SIGTERM', () => {
    console.log('🛑 Shutting down...');
    server.kill('SIGTERM');
  });
};

const main = async () => {
  try {
    console.log('🔍 Environment Variables Check:');
    console.log('DB_HOST:', process.env.DB_HOST || '❌ Not set');
    console.log('DB_USER:', process.env.DB_USER || '❌ Not set');
    console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '✅ Set' : '❌ Not set');
    console.log('DB_NAME:', process.env.DB_NAME || '❌ Not set');
    
    // Step 1: Test connection with extended timeout
    console.log('🔌 Testing connection to usefivy.com MySQL database...');
    const connectionOk = await testConnection();
    
    if (!connectionOk) {
      console.error('❌ Cannot connect to usefivy.com MySQL database');
      console.error('🔧 Possible solutions:');
      console.error('1. Contact usefivy.com support about remote MySQL access');
      console.error('2. Verify Remote MySQL settings in cPanel allow external connections');
      console.error('3. Check if hosting provider blocks external database connections');
      console.error('');
      console.error('🚀 Starting server anyway (database will be initialized later)...');
      startServer();
      return;
    }
    
    // Step 2: Check if tables exist
    const tablesExist = await checkTablesExist();
    
    // Step 3: Setup database if needed
    if (!tablesExist) {
      console.log('🔧 Setting up database for first time...');
      const setupOk = await setupDatabase();
      if (!setupOk) {
        console.error('⚠️ Database setup failed, but starting server anyway');
      }
    } else {
      console.log('✅ Database already configured, skipping setup');
    }
    
    // Step 4: Start the server
    console.log('🎉 Database ready! Starting server...');
    startServer();
    
  } catch (error) {
    console.error('❌ Startup error:', error.message);
    console.error('🚀 Starting server anyway...');
    startServer();
  }
};

// Run the startup sequence
main();
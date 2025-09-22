#!/usr/bin/env node

/**
 * Production Startup Script for MongoDB Atlas
 *
 * This is the main entry point that will:
 * 1. Connect to MongoDB Atlas
 * 2. Start the Express server
 */

require('dotenv').config();
const { spawn } = require('child_process');

console.log('🚀 Starting Dozyr Backend...');
console.log('📅 Startup Time:', new Date().toISOString());

const startServer = () => {
  console.log('🚀 Starting Express server with MongoDB Atlas...');

  const server = spawn('node', ['server.js'], {
    stdio: 'inherit',
    env: process.env
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
    console.log('MONGO_URI:', process.env.MONGO_URI ? '✅ Set' : '❌ Not set');
    console.log('PORT:', process.env.PORT || 3000);

    // Start the server - MongoDB connection will be handled in server.js
    console.log('🎉 Starting server with MongoDB Atlas...');
    startServer();

  } catch (error) {
    console.error('❌ Startup error:', error.message);
    console.error('🚀 Starting server anyway...');
    startServer();
  }
};

// Run the startup sequence
main();
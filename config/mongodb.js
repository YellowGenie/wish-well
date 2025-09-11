const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB connection configuration
const mongoConfig = {
  uri: process.env.MONGO_URI || 'mongodb+srv://dozyr_usr:Dozyr2025@dozyr.mud2aty.mongodb.net/dozyr_db?retryWrites=true&w=majority&appName=Dozyr',
  options: {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    maxIdleTimeMS: 30000,
  }
};

let isConnected = false;

const connectToMongoDB = async () => {
  if (isConnected) {
    console.log('✅ Already connected to MongoDB');
    return;
  }

  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(mongoConfig.uri, mongoConfig.options);
    
    isConnected = true;
    console.log('✅ Successfully connected to MongoDB');
    console.log(`📍 Database: ${mongoose.connection.name}`);
    
    // Handle connection events
    mongoose.connection.on('error', (error) => {
      console.error('❌ MongoDB connection error:', error);
      isConnected = false;
    });
    
    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected');
      isConnected = false;
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
      isConnected = true;
    });
    
  } catch (error) {
    console.error('❌ Error connecting to MongoDB:', error);
    isConnected = false;
    throw error;
  }
};

const disconnectFromMongoDB = async () => {
  if (!isConnected) {
    return;
  }
  
  try {
    await mongoose.disconnect();
    isConnected = false;
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error disconnecting from MongoDB:', error);
    throw error;
  }
};

// Graceful shutdown handlers
process.on('SIGINT', async () => {
  console.log('\n⏹️  Received SIGINT. Gracefully shutting down MongoDB connection...');
  await disconnectFromMongoDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⏹️  Received SIGTERM. Gracefully shutting down MongoDB connection...');
  await disconnectFromMongoDB();
  process.exit(0);
});

module.exports = {
  connectToMongoDB,
  disconnectFromMongoDB,
  mongoose,
  isConnected: () => isConnected
};
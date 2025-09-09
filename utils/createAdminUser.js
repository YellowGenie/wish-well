const User = require('../models/User');
require('dotenv').config();

const createAdminUser = async () => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@dozyr.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    // Check if admin user already exists
    const existingAdmin = await User.findByEmail(adminEmail);
    if (existingAdmin) {
      console.log('Admin user already exists:', adminEmail);
      return existingAdmin.id;
    }

    // Create admin user
    const adminId = await User.create({
      email: adminEmail,
      password: adminPassword,
      role: 'admin',
      first_name: 'Admin',
      last_name: 'User'
    });

    console.log('Admin user created successfully:', adminEmail);
    console.log('Admin ID:', adminId);
    console.log('Default password:', adminPassword);
    console.log('Please change the default password after first login!');

    return adminId;
  } catch (error) {
    console.error('Error creating admin user:', error);
    throw error;
  }
};

module.exports = { createAdminUser };
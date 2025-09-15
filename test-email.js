require('dotenv').config();
const emailService = require('./services/emailService');

async function testEmail() {
  console.log('🧪 Testing email functionality...');

  try {
    // Initialize the email service
    await emailService.initializeTransporter();

    // Test connection
    const connectionTest = await emailService.testConnection();
    console.log('🔌 Connection test:', connectionTest);

    if (connectionTest.success) {
      // Test sending a verification email - use a valid email address for testing
      const result = await emailService.sendVerificationEmail(
        'hello@dozyr.co', // Using the same sender email for testing
        '1234',
        'Test User'
      );

      console.log('📧 Email send result:', result);

      if (result.success) {
        console.log('✅ Email verification system is working correctly!');
        console.log('📨 Check your email for the verification code');
      } else {
        console.log('❌ Email sending failed:', result.error);
      }
    } else {
      console.log('❌ Connection failed:', connectionTest.error);
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testEmail();
require('dotenv').config();
const emailService = require('./services/emailService');
const { connectToMongoDB } = require('./config/mongodb');
const User = require('./models/User');
const PasswordReset = require('./models/PasswordReset');

async function testPasswordResetFlow() {
  console.log('🧪 Testing password reset flow...');

  try {
    // Initialize MongoDB connection
    await connectToMongoDB();
    console.log('✅ MongoDB connected');

    // Initialize the email service
    await emailService.initializeTransporter();
    console.log('✅ Email service initialized');

    // Test email connection
    const connectionTest = await emailService.testConnection();
    console.log('🔌 Connection test:', connectionTest);

    if (!connectionTest.success) {
      console.log('❌ Email connection failed, stopping test');
      process.exit(1);
    }

    // Test data
    const testEmail = 'test@example.com'; // Change this to your email for testing
    const testPassword = 'newpassword123';

    console.log('\n🔍 Testing password reset for email:', testEmail);

    // 1. Check if test user exists, create if not
    let testUser = await User.findByEmail(testEmail);
    if (!testUser) {
      console.log('👤 Creating test user...');
      const userId = await User.create({
        email: testEmail,
        password: 'oldpassword123',
        role: 'talent',
        first_name: 'Test',
        last_name: 'User'
      });
      testUser = await User.findByEmail(testEmail);
      console.log('✅ Test user created with ID:', userId);
    } else {
      console.log('✅ Test user found:', testUser._id);
    }

    // 2. Clean up any existing password reset tokens
    await PasswordReset.deleteByUserId(testUser._id);
    console.log('🧹 Cleaned up existing password reset tokens');

    // 3. Generate and save password reset token
    const resetToken = PasswordReset.generateToken();
    const expiresAt = PasswordReset.getExpiryTime(1); // 1 hour

    console.log('🔑 Generated reset token:', resetToken.substring(0, 8) + '...');

    const passwordReset = new PasswordReset({
      user_id: testUser._id,
      email: testUser.email,
      token: resetToken,
      expires_at: expiresAt
    });

    await passwordReset.save();
    console.log('✅ Password reset record saved');

    // 4. Test sending password reset email
    console.log('📧 Sending password reset email...');
    const emailResult = await emailService.sendPasswordResetEmail(
      testUser.email,
      resetToken,
      testUser.first_name
    );

    console.log('📧 Email send result:', emailResult);

    if (emailResult.success) {
      console.log('✅ Password reset email sent successfully!');
      console.log('📨 Check your email for the password reset link');

      // 5. Test token verification
      console.log('\n🔍 Testing token verification...');
      const foundToken = await PasswordReset.findByToken(resetToken);

      if (foundToken) {
        console.log('✅ Token verification successful');
        console.log('Token details:', {
          user_id: foundToken.user_id,
          email: foundToken.email,
          expires_at: foundToken.expires_at,
          used_at: foundToken.used_at
        });

        // 6. Test password update process
        console.log('\n🔐 Testing password update...');
        const userToUpdate = await User.findByEmail(foundToken.email);

        if (userToUpdate) {
          // Get the actual Mongoose document to trigger pre-save middleware
          const UserModel = require('./models/User');
          const userInstance = await UserModel.findOne({ _id: userToUpdate._id });
          userInstance.password = testPassword;
          await userInstance.save();

          // Mark token as used
          await PasswordReset.markAsUsed(resetToken);

          console.log('✅ Password updated successfully');
          console.log('✅ Token marked as used');

          // 7. Verify the token is now invalid
          const usedToken = await PasswordReset.findByToken(resetToken);
          if (!usedToken) {
            console.log('✅ Used token is correctly invalidated');
          } else {
            console.log('⚠️ Used token still valid - this might be an issue');
          }

        } else {
          console.log('❌ User not found for password update');
        }
      } else {
        console.log('❌ Token not found or expired');
      }

    } else {
      console.log('❌ Password reset email failed:', emailResult.error);
    }

    console.log('\n✅ Password reset flow test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Close MongoDB connection
    require('mongoose').connection.close();
    console.log('🔌 MongoDB connection closed');
    process.exit(0);
  }
}

testPasswordResetFlow();
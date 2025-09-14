const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const User = require('../models/User');
const TalentProfile = require('../models/TalentProfile');
const ManagerProfile = require('../models/ManagerProfile');
const EmailVerification = require('../models/EmailVerification');
const emailService = require('../services/emailService');
const { generateToken } = require('../utils/jwt');

// Multer configuration for profile image uploads (memory storage for cloud hosting)
const storage = multer.memoryStorage()

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true)
  } else {
    cb(new Error('Only image files are allowed!'), false)
  }
}

const upload = multer({ 
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
})

class AuthController {
  static validateRegister = [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('role').isIn(['talent', 'manager']),
    body('first_name').trim().isLength({ min: 1 }),
    body('last_name').trim().isLength({ min: 1 })
  ];

  static validateLogin = [
    body('email').isEmail().normalizeEmail(),
    body('password').exists()
  ];

  static validateVerifyCode = [
    body('verification_code').isLength({ min: 4, max: 4 }).isNumeric()
  ];

  static validateResendCode = [
    body('email').isEmail().normalizeEmail()
  ];

  static async register(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password, role, first_name, last_name } = req.body;

      // Check if user already exists
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: 'User already exists with this email' });
      }

      // Automatically assign admin role for @yellowgenie.io email addresses
      const finalRole = email.endsWith('@yellowgenie.io') ? 'admin' : role;

      // Create user
      const userId = await User.create({
        email,
        password,
        role: finalRole,
        first_name,
        last_name
      });

      // Create role-specific profile (only for talent and manager, not admin)
      if (finalRole === 'talent') {
        await TalentProfile.create({
          user_id: userId,
          title: '',
          bio: '',
          hourly_rate: null,
          availability: 'contract',
          location: '',
          portfolio_description: ''
        });
      } else if (finalRole === 'manager') {
        await ManagerProfile.create({
          user_id: userId,
          company_name: '',
          company_description: '',
          company_size: null,
          industry: '',
          location: ''
        });
      }

      // Generate and send verification code
      const verificationCode = EmailVerification.generateCode();
      const expiresAt = EmailVerification.getExpiryTime(15); // 15 minutes
      
      await EmailVerification.create({
        user_id: userId,
        email,
        verification_code: verificationCode,
        expires_at: expiresAt
      });

      // Send verification email
      await emailService.sendVerificationEmail(email, verificationCode, first_name);

      const token = generateToken(userId);

      res.status(201).json({
        message: 'User registered successfully. Please check your email for verification code.',
        token,
        user: {
          id: userId,
          email,
          role,
          first_name,
          last_name,
          profile_image: null,
          email_verified: false
        }
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async login(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      // Find user
      const user = await User.findByEmail(email);
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Check if user is active
      if (!user.is_active) {
        return res.status(401).json({ error: 'Account has been deactivated' });
      }

      // Validate password
      const isValidPassword = await User.validatePassword(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = generateToken(user.id);

      res.json({
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          first_name: user.first_name,
          last_name: user.last_name,
          profile_image: user.profile_image,
          email_verified: Boolean(user.email_verified)
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getProfile(req, res) {
    try {
      const user = req.user;
      let profile = null;

      if (user.role === 'talent') {
        profile = await TalentProfile.findByUserId(user.id);
      } else if (user.role === 'manager') {
        profile = await ManagerProfile.findByUserId(user.id);
      }

      res.json({
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          first_name: user.first_name,
          last_name: user.last_name,
          profile_image: user.profile_image ? user.profile_image.replace('/api/file/', '/uploads/') : user.profile_image,
          is_active: Boolean(user.is_active),
          email_verified: Boolean(user.email_verified),
          created_at: user.created_at
        },
        profile
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async updateProfile(req, res) {
    try {
      const user = req.user;
      const updateData = req.body;

      // Handle both new format (direct fields) and legacy format (nested objects)
      let userUpdates = {};
      let profileUpdates = {};

      if (updateData.user_data || updateData.profile_data) {
        // Legacy format
        if (updateData.user_data) {
          const allowedUserFields = ['first_name', 'last_name', 'profile_image'];
          Object.keys(updateData.user_data).forEach(key => {
            if (allowedUserFields.includes(key)) {
              userUpdates[key] = updateData.user_data[key];
            }
          });
        }
        if (updateData.profile_data) {
          profileUpdates = updateData.profile_data;
        }
      } else {
        // New format (direct fields)
        const allowedUserFields = ['first_name', 'last_name', 'profile_image'];
        Object.keys(updateData).forEach(key => {
          if (allowedUserFields.includes(key)) {
            userUpdates[key] = updateData[key];
          }
        });
      }

      // Update user data if provided
      if (Object.keys(userUpdates).length > 0) {
        await User.updateProfile(user.id, userUpdates);
      }

      // Update profile data if provided
      if (Object.keys(profileUpdates).length > 0) {
        if (user.role === 'talent') {
          await TalentProfile.update(user.id, profileUpdates);
        } else if (user.role === 'manager') {
          await ManagerProfile.update(user.id, profileUpdates);
        }
      }

      // Fetch and return the updated user data
      const updatedUser = await User.findById(user.id);
      res.json(updatedUser);
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static uploadProfileImage = upload.single('profile_image')

  static async handleProfileImageUpload(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
      }

      // Check file size (max 5MB)
      if (req.file.size > 5 * 1024 * 1024) {
        return res.status(400).json({ error: 'Image file too large. Maximum size is 5MB.' });
      }

      // Create base64 data URL for cloud hosting compatibility
      const base64Data = req.file.buffer.toString('base64');
      const mimeType = req.file.mimetype;
      const imageDataUrl = `data:${mimeType};base64,${base64Data}`;
      
      // Update user's profile_image in database
      await User.updateProfile(req.user.id, { profile_image: imageDataUrl });

      res.json({ 
        message: 'Profile image uploaded successfully',
        image_url: imageDataUrl
      });
    } catch (error) {
      console.error('Profile image upload error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async deleteProfileImage(req, res) {
    try {
      const user = await User.findById(req.user.id);
      
      if (user.profile_image) {
        // Update database (no filesystem cleanup needed for base64 data)
        await User.updateProfile(req.user.id, { profile_image: null });
      }

      res.json({ message: 'Profile image deleted successfully' });
    } catch (error) {
      console.error('Delete profile image error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async verifyEmailCode(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { verification_code } = req.body;
      const userId = req.user.id;

      // Find verification code
      const verification = await EmailVerification.findByUserAndCode(userId, verification_code);
      if (!verification) {
        return res.status(400).json({ error: 'Invalid or expired verification code' });
      }

      // Mark code as used
      await EmailVerification.markAsUsed(verification.id);

      // Update user as verified
      await User.updateProfile(userId, { email_verified: true });

      res.json({
        message: 'Email verified successfully',
        email_verified: true
      });
    } catch (error) {
      console.error('Verify email code error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async resendVerificationCode(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email } = req.body;
      
      // Find user by email
      const user = await User.findByEmail(email);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Check if already verified
      if (user.email_verified) {
        return res.status(400).json({ error: 'Email is already verified' });
      }

      // Check if there's a recent code (less than 1 minute ago)
      const recentCode = await EmailVerification.findLatestByUser(user.id);
      if (recentCode) {
        const timeSinceLastCode = new Date() - new Date(recentCode.created_at);
        if (timeSinceLastCode < 60000) { // 60 seconds
          return res.status(429).json({ 
            error: 'Please wait before requesting a new code',
            retry_after: 60 - Math.floor(timeSinceLastCode / 1000)
          });
        }
      }

      // Generate new verification code
      const verificationCode = EmailVerification.generateCode();
      const expiresAt = EmailVerification.getExpiryTime(15); // 15 minutes
      
      await EmailVerification.create({
        user_id: user.id,
        email: user.email,
        verification_code: verificationCode,
        expires_at: expiresAt
      });

      // Send verification email
      await emailService.sendVerificationEmail(user.email, verificationCode, user.first_name);

      res.json({
        message: 'Verification code sent to your email'
      });
    } catch (error) {
      console.error('Resend verification code error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async logout(req, res) {
    try {
      // For JWT-based authentication, logout is handled client-side
      // by removing the token from storage. Server-side, we just 
      // acknowledge the logout request.
      
      // In a more complex setup, you might:
      // 1. Add token to a blacklist/revocation list
      // 2. Clear session cookies
      // 3. Log the logout event
      
      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }

  // Test email functionality
  static async testEmail(req, res) {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({
          success: false,
          error: 'Email address is required'
        });
      }

      // Test the connection first
      const connectionTest = await emailService.testConnection();
      if (!connectionTest.success) {
        return res.status(500).json({
          success: false,
          error: `SMTP Connection failed: ${connectionTest.error}`
        });
      }

      // Send a test email
      const result = await emailService.sendEmail({
        to: email,
        subject: 'Dozyr Email Test',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #7c3aed;">🎉 Email Configuration Test</h2>
            <p>Congratulations! Your Dozyr email service is working correctly.</p>
            <p>This test email was sent from: <strong>hello@dozyr.co</strong></p>
            <p>Configuration details:</p>
            <ul>
              <li>SMTP Host: mail.dozyr.co</li>
              <li>Port: 465 (SSL)</li>
              <li>From: hello@dozyr.co</li>
            </ul>
            <p style="color: #059669;">✅ Email service is operational!</p>
          </div>
        `,
        text: 'Dozyr email test - Your email service is working correctly!'
      });

      if (result.success) {
        res.json({
          success: true,
          message: 'Test email sent successfully!',
          messageId: result.messageId
        });
      } else {
        res.status(500).json({
          success: false,
          error: `Failed to send email: ${result.error}`
        });
      }
    } catch (error) {
      console.error('Test email error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
}

module.exports = AuthController;
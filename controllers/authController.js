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

// Multer configuration for profile image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/profile-images/')
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, req.user.id + '-' + uniqueSuffix + path.extname(file.originalname))
  }
})

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

      // Create user
      const userId = await User.create({
        email,
        password,
        role,
        first_name,
        last_name
      });

      // Create role-specific profile
      if (role === 'talent') {
        await TalentProfile.create({
          user_id: userId,
          title: '',
          bio: '',
          hourly_rate: null,
          availability: 'contract',
          location: '',
          portfolio_description: ''
        });
      } else if (role === 'manager') {
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
        userId,
        email,
        verificationCode,
        expiresAt
      });

      // Send verification email
      const user = { id: userId, first_name, email };
      await emailService.sendVerificationEmail(user, verificationCode);

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
          profile_image: user.profile_image,
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

      const imageUrl = `/uploads/profile-images/${req.file.filename}`;
      
      // Update user's profile_image in database
      await User.updateProfile(req.user.id, { profile_image: imageUrl });

      res.json({ 
        message: 'Profile image uploaded successfully',
        image_url: imageUrl
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
        // Delete the file from filesystem
        const filePath = path.join(__dirname, '..', user.profile_image);
        try {
          await fs.unlink(filePath);
        } catch (fileError) {
          console.warn('Could not delete profile image file:', fileError.message);
        }

        // Update database
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
        userId: user.id,
        email: user.email,
        verificationCode,
        expiresAt
      });

      // Send verification email
      await emailService.sendVerificationEmail(user, verificationCode);

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
}

module.exports = AuthController;
const express = require('express');
const AuthController = require('../controllers/authController');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Public routes
router.post('/register', AuthController.validateRegister, AuthController.register);
router.post('/login', AuthController.validateLogin, AuthController.login);
router.post('/logout', AuthController.logout);
router.post('/resend-verification', AuthController.validateResendCode, AuthController.resendVerificationCode);

// Protected routes
router.get('/profile', auth, AuthController.getProfile);
router.put('/profile', auth, AuthController.updateProfile);
router.post('/verify-email', auth, AuthController.validateVerifyCode, AuthController.verifyEmailCode);

// Test email route (for development)
router.post('/test-email', AuthController.testEmail);

// Profile image routes
router.post('/profile/image', auth, AuthController.uploadProfileImage, AuthController.handleProfileImageUpload);
router.delete('/profile/image', auth, AuthController.deleteProfileImage);

module.exports = router;
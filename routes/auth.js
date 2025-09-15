const express = require('express');
const AuthController = require('../controllers/authController');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Public routes
router.post('/register', AuthController.validateRegister, AuthController.register);
router.post('/login', AuthController.validateLogin, AuthController.login);
router.post('/logout', AuthController.logout);
router.post('/resend-verification', AuthController.validateResendCode, AuthController.resendVerificationCode);
router.post('/forgot-password', AuthController.validateForgotPassword, AuthController.forgotPassword);
router.post('/reset-password', AuthController.validateResetPassword, AuthController.resetPassword);

// Protected routes
router.get('/profile', auth, AuthController.getProfile);
router.put('/profile', auth, AuthController.updateProfile);
router.post('/verify-email', auth, AuthController.validateVerifyCode, AuthController.verifyEmailCode);

// Test email routes (for development/debugging)
router.post('/test-email', AuthController.testEmail);
router.get('/email-status', AuthController.emailStatus);
router.post('/reinitialize-email', AuthController.reinitializeEmail);

// Profile image routes
router.post('/profile/image', auth, AuthController.uploadProfileImage, AuthController.handleProfileImageUpload);
router.delete('/profile/image', auth, AuthController.deleteProfileImage);

module.exports = router;
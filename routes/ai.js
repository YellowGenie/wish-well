const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const AIService = require('../services/aiService');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Chat endpoint
router.post('/chat',
  auth,
  [
    body('message')
      .trim()
      .notEmpty()
      .withMessage('Message is required')
      .isLength({ max: 2000 })
      .withMessage('Message must be less than 2000 characters'),
    body('session_id')
      .optional()
      .isString()
      .withMessage('Session ID must be a string')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Invalid input',
          errors: errors.array()
        });
      }

      const { message } = req.body;
      let { session_id } = req.body;
      const user = req.user;

      // Generate session ID if not provided
      if (!session_id) {
        session_id = `${user.id}_${Date.now()}_${uuidv4()}`;
      }

      console.log(`🤖 AI Chat request from user ${user.id} (${user.role}) - Session: ${session_id}`);

      // Get or create conversation log
      const metadata = {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        deviceType: req.get('User-Agent')?.includes('Mobile') ? 'mobile' : 'desktop'
      };

      const conversationLog = await AIService.getOrCreateConversationLog(session_id, user, metadata);

      // Generate AI response with full logging and rate limiting
      const response = await AIService.generateChatResponse(
        message,
        user,
        session_id,
        conversationLog,
        metadata
      );

      // Build response
      const responseData = {
        response: response.message,
        timestamp: response.timestamp,
        session_id: session_id,
        user_role: user.role
      };

      // Add additional info for successful responses
      if (response.success) {
        responseData.tokens_used = response.tokens_used;
        responseData.response_time = response.response_time;
        responseData.model_used = response.model_used;
      }

      // Handle rate limiting and errors
      if (!response.success) {
        const statusCode = response.error === 'RATE_LIMITED' ? 429 : 400;
        return res.status(statusCode).json({
          success: false,
          message: response.message,
          error: response.error,
          session_id: session_id,
          rate_limit_info: response.rate_limit_info
        });
      }

      res.json({
        success: true,
        data: responseData
      });

    } catch (error) {
      console.error('AI Chat Error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// Welcome message endpoint
router.get('/welcome',
  auth,
  async (req, res) => {
    try {
      const user = req.user;

      const welcomeMessage = await AIService.generateWelcomeMessage(
        user.role,
        user.first_name
      );

      res.json({
        success: true,
        data: {
          message: welcomeMessage,
          timestamp: new Date().toISOString(),
          user_role: user.role
        }
      });

    } catch (error) {
      console.error('AI Welcome Error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// End conversation endpoint
router.post('/end-conversation',
  auth,
  [
    body('session_id')
      .notEmpty()
      .withMessage('Session ID is required'),
    body('satisfaction')
      .optional()
      .isInt({ min: 1, max: 5 })
      .withMessage('Satisfaction must be between 1 and 5'),
    body('feedback')
      .optional()
      .isLength({ max: 1000 })
      .withMessage('Feedback must be less than 1000 characters')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Invalid input',
          errors: errors.array()
        });
      }

      const { session_id, satisfaction, feedback } = req.body;

      const conversationLog = await AIService.endConversation(session_id, satisfaction, feedback);

      res.json({
        success: true,
        data: {
          message: 'Conversation ended successfully',
          session_id: session_id,
          conversation_summary: conversationLog ? {
            total_messages: conversationLog.total_messages,
            duration_minutes: conversationLog.conversation_end && conversationLog.conversation_start
              ? Math.round((conversationLog.conversation_end - conversationLog.conversation_start) / (1000 * 60))
              : null
          } : null
        }
      });

    } catch (error) {
      console.error('End Conversation Error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// Get user's rate limit status
router.get('/rate-limit-status',
  auth,
  async (req, res) => {
    try {
      const AIRateLimit = require('../models/AIRateLimit');
      const usageStats = await AIRateLimit.getUserUsageStats(req.user.id);

      res.json({
        success: true,
        data: usageStats
      });

    } catch (error) {
      console.error('Rate Limit Status Error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// Health check for AI service
router.get('/health',
  auth,
  async (req, res) => {
    try {
      const AISettings = require('../models/AISettings');
      const settings = await AISettings.getCurrentSettings();

      res.json({
        success: true,
        data: {
          status: settings.is_enabled ? 'healthy' : 'disabled',
          timestamp: new Date().toISOString(),
          ai_enabled: settings.is_enabled,
          model: settings.model_name
        }
      });

    } catch (error) {
      console.error('AI Health Check Error:', error);
      res.status(200).json({
        success: false,
        data: {
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: error.message
        }
      });
    }
  }
);

module.exports = router;
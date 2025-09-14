const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { auth, requireAdmin } = require('../../middleware/auth');
const AISettings = require('../../models/AISettings');
const AIChatLog = require('../../models/AIChatLog');
const AIRateLimit = require('../../models/AIRateLimit');

const router = express.Router();

// Apply admin authentication to all routes
router.use(auth, requireAdmin);

// GET AI Settings
router.get('/settings', async (req, res) => {
  try {
    const settings = await AISettings.getCurrentSettings();

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Get AI Settings Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve AI settings'
    });
  }
});

// UPDATE AI Settings
router.put('/settings', [
  body('is_enabled').optional().isBoolean().withMessage('is_enabled must be boolean'),
  body('model_name').optional().isString().withMessage('model_name must be string'),
  body('temperature').optional().isFloat({ min: 0, max: 2 }).withMessage('temperature must be between 0 and 2'),
  body('max_tokens').optional().isInt({ min: 50, max: 4000 }).withMessage('max_tokens must be between 50 and 4000'),
  body('personality').optional().isIn(['professional', 'friendly', 'casual', 'formal', 'helpful', 'technical', 'custom']).withMessage('Invalid personality'),
  body('tone').optional().isIn(['warm', 'neutral', 'energetic', 'calm', 'enthusiastic', 'serious', 'custom']).withMessage('Invalid tone'),
  body('custom_personality_prompt').optional().isString().isLength({ max: 2000 }).withMessage('Custom personality prompt too long'),
  body('rate_limits.messages_per_hour').optional().isInt({ min: 1, max: 100 }).withMessage('Invalid hourly limit'),
  body('rate_limits.messages_per_day').optional().isInt({ min: 1, max: 500 }).withMessage('Invalid daily limit'),
  body('rate_limits.characters_per_message').optional().isInt({ min: 50, max: 2000 }).withMessage('Invalid character limit'),
  body('rate_limits.cooldown_seconds').optional().isInt({ min: 0, max: 60 }).withMessage('Invalid cooldown'),
  body('moderation.enabled').optional().isBoolean().withMessage('moderation.enabled must be boolean'),
  body('moderation.blocked_words').optional().isArray().withMessage('blocked_words must be array'),
  body('moderation.auto_escalate_keywords').optional().isArray().withMessage('auto_escalate_keywords must be array')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input',
        errors: errors.array()
      });
    }

    const updates = req.body;
    const updatedSettings = await AISettings.updateSettings(updates, req.user.id);

    res.json({
      success: true,
      message: 'AI settings updated successfully',
      data: updatedSettings
    });

  } catch (error) {
    console.error('Update AI Settings Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update AI settings'
    });
  }
});

// UPDATE System Prompts
router.put('/settings/prompts', [
  body('system_prompts.base').optional().isString().isLength({ max: 5000 }).withMessage('Base prompt too long'),
  body('system_prompts.talent').optional().isString().isLength({ max: 2000 }).withMessage('Talent prompt too long'),
  body('system_prompts.manager').optional().isString().isLength({ max: 2000 }).withMessage('Manager prompt too long'),
  body('system_prompts.admin').optional().isString().isLength({ max: 2000 }).withMessage('Admin prompt too long')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input',
        errors: errors.array()
      });
    }

    const { system_prompts } = req.body;
    const updatedSettings = await AISettings.updateSettings({ system_prompts }, req.user.id);

    res.json({
      success: true,
      message: 'System prompts updated successfully',
      data: updatedSettings.system_prompts
    });

  } catch (error) {
    console.error('Update System Prompts Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update system prompts'
    });
  }
});

// UPDATE Welcome Messages
router.put('/settings/welcome-messages', [
  body('welcome_messages.talent').optional().isString().isLength({ max: 500 }).withMessage('Talent welcome message too long'),
  body('welcome_messages.manager').optional().isString().isLength({ max: 500 }).withMessage('Manager welcome message too long'),
  body('welcome_messages.admin').optional().isString().isLength({ max: 500 }).withMessage('Admin welcome message too long')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input',
        errors: errors.array()
      });
    }

    const { welcome_messages } = req.body;
    const updatedSettings = await AISettings.updateSettings({ welcome_messages }, req.user.id);

    res.json({
      success: true,
      message: 'Welcome messages updated successfully',
      data: updatedSettings.welcome_messages
    });

  } catch (error) {
    console.error('Update Welcome Messages Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update welcome messages'
    });
  }
});

// GET Chat Logs with Search and Filtering
router.get('/chat-logs', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('user_id').optional().isString().withMessage('User ID must be string'),
  query('user_email').optional().isEmail().withMessage('Invalid email format'),
  query('user_role').optional().isIn(['talent', 'manager', 'admin']).withMessage('Invalid user role'),
  query('start_date').optional().isISO8601().withMessage('Invalid start date'),
  query('end_date').optional().isISO8601().withMessage('Invalid end date'),
  query('flagged_only').optional().isBoolean().withMessage('flagged_only must be boolean'),
  query('search').optional().isString().isLength({ max: 100 }).withMessage('Search query too long')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid query parameters',
        errors: errors.array()
      });
    }

    const {
      page = 1,
      limit = 20,
      user_id,
      user_email,
      user_role,
      start_date,
      end_date,
      flagged_only,
      search
    } = req.query;

    // Build query
    const query = {
      archived: false
    };

    if (user_id) query.user_id = user_id;
    if (user_email) query.user_email = new RegExp(user_email, 'i');
    if (user_role) query.user_role = user_role;
    if (flagged_only === 'true') query.flagged_conversation = true;

    if (start_date || end_date) {
      query.conversation_start = {};
      if (start_date) query.conversation_start.$gte = new Date(start_date);
      if (end_date) query.conversation_start.$lte = new Date(end_date);
    }

    if (search) {
      query.$or = [
        { user_name: new RegExp(search, 'i') },
        { user_email: new RegExp(search, 'i') },
        { 'messages.content': new RegExp(search, 'i') }
      ];
    }

    const conversations = await AIChatLog.find(query)
      .sort({ conversation_start: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .select('-messages.content') // Exclude message content for list view
      .lean();

    const total = await AIChatLog.countDocuments(query);

    res.json({
      success: true,
      data: {
        conversations,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get Chat Logs Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve chat logs'
    });
  }
});

// GET Single Conversation with Full Messages
router.get('/chat-logs/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;

    const conversation = await AIChatLog.findById(conversationId).lean();

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    res.json({
      success: true,
      data: conversation
    });

  } catch (error) {
    console.error('Get Conversation Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve conversation'
    });
  }
});

// FLAG/UNFLAG Conversation
router.post('/chat-logs/:conversationId/flag', [
  body('flagged').isBoolean().withMessage('flagged must be boolean'),
  body('reasons').optional().isArray().withMessage('reasons must be array'),
  body('admin_notes').optional().isString().isLength({ max: 1000 }).withMessage('Admin notes too long')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input',
        errors: errors.array()
      });
    }

    const { conversationId } = req.params;
    const { flagged, reasons, admin_notes } = req.body;

    const updateData = {
      flagged_conversation: flagged,
      reviewed_by_admin: true,
      admin_notes: admin_notes || ''
    };

    if (flagged && reasons) {
      updateData.flag_reasons = reasons;
    } else if (!flagged) {
      updateData.flag_reasons = [];
    }

    const conversation = await AIChatLog.findByIdAndUpdate(
      conversationId,
      updateData,
      { new: true }
    );

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    res.json({
      success: true,
      message: `Conversation ${flagged ? 'flagged' : 'unflagged'} successfully`,
      data: {
        flagged_conversation: conversation.flagged_conversation,
        flag_reasons: conversation.flag_reasons,
        admin_notes: conversation.admin_notes
      }
    });

  } catch (error) {
    console.error('Flag Conversation Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to flag conversation'
    });
  }
});

// ARCHIVE Conversation
router.post('/chat-logs/:conversationId/archive', async (req, res) => {
  try {
    const { conversationId } = req.params;

    const conversation = await AIChatLog.findByIdAndUpdate(
      conversationId,
      { archived: true },
      { new: true }
    );

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    res.json({
      success: true,
      message: 'Conversation archived successfully'
    });

  } catch (error) {
    console.error('Archive Conversation Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to archive conversation'
    });
  }
});

// GET Chat Analytics
router.get('/analytics', [
  query('start_date').optional().isISO8601().withMessage('Invalid start date'),
  query('end_date').optional().isISO8601().withMessage('Invalid end date'),
  query('group_by').optional().isIn(['hour', 'day', 'month']).withMessage('Invalid group_by value')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid query parameters',
        errors: errors.array()
      });
    }

    const {
      start_date,
      end_date,
      group_by = 'day'
    } = req.query;

    const options = {
      groupBy: group_by
    };

    if (start_date) options.startDate = new Date(start_date);
    if (end_date) options.endDate = new Date(end_date);

    const analytics = await AIChatLog.getAnalytics(options);

    // Get summary statistics
    const summaryStats = await AIChatLog.aggregate([
      {
        $match: {
          conversation_start: {
            $gte: options.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            $lte: options.endDate || new Date()
          },
          archived: false
        }
      },
      {
        $group: {
          _id: null,
          total_conversations: { $sum: 1 },
          total_messages: { $sum: '$total_messages' },
          total_ai_tokens: { $sum: '$total_ai_tokens_used' },
          avg_satisfaction: { $avg: '$user_satisfaction_rating' },
          flagged_conversations: { $sum: { $cond: ['$flagged_conversation', 1, 0] } },
          escalated_conversations: { $sum: { $cond: ['$escalated_to_human', 1, 0] } }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        analytics,
        summary: summaryStats[0] || {}
      }
    });

  } catch (error) {
    console.error('Get Analytics Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve analytics'
    });
  }
});

// GET User Rate Limits
router.get('/rate-limits', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('blocked_only').optional().isBoolean().withMessage('blocked_only must be boolean')
], async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      blocked_only
    } = req.query;

    const query = {};
    if (blocked_only === 'true') {
      query.is_blocked = true;
    }

    const rateLimits = await AIRateLimit.find(query)
      .sort({ updatedAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate('user_id', 'first_name last_name email role')
      .lean();

    const total = await AIRateLimit.countDocuments(query);

    res.json({
      success: true,
      data: {
        rate_limits: rateLimits,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get Rate Limits Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve rate limits'
    });
  }
});

// BLOCK/UNBLOCK User
router.post('/rate-limits/:userId/block', [
  body('action').isIn(['block', 'unblock']).withMessage('Action must be block or unblock'),
  body('reason').optional().isString().isLength({ max: 200 }).withMessage('Reason too long'),
  body('duration_minutes').optional().isInt({ min: 1, max: 10080 }).withMessage('Duration must be between 1 minute and 1 week')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input',
        errors: errors.array()
      });
    }

    const { userId } = req.params;
    const { action, reason, duration_minutes = 60 } = req.body;

    if (action === 'block') {
      const blockExpiresAt = await AIRateLimit.blockUser(userId, reason, duration_minutes);
      res.json({
        success: true,
        message: `User blocked successfully until ${blockExpiresAt.toISOString()}`,
        data: {
          blocked: true,
          expires_at: blockExpiresAt,
          reason: reason
        }
      });
    } else {
      await AIRateLimit.unblockUser(userId);
      res.json({
        success: true,
        message: 'User unblocked successfully',
        data: {
          blocked: false
        }
      });
    }

  } catch (error) {
    console.error('Block/Unblock User Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to block/unblock user'
    });
  }
});

module.exports = router;
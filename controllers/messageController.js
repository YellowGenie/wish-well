const { body, validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs').promises;
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const Job = require('../models/Job');
const ContentFilter = require('../utils/contentFilter');
const { generateFileHash } = require('../utils/fileHelpers');

class MessageController {
  static validateSendMessage = [
    body('message').trim().isLength({ min: 1, max: 5000 }),
    body('receiver_id').optional().isInt({ min: 1 }),
    body('conversation_id').optional().isInt({ min: 1 }),
    body('message_type').optional().isIn(['text', 'file', 'image', 'audio', 'code'])
  ];

  static validateDirectMessage = [
    body('message').trim().isLength({ min: 1, max: 5000 }),
    body('receiver_id').isInt({ min: 1 }),
    body('message_type').optional().isIn(['text', 'file', 'image', 'audio', 'code'])
  ];

  static validateEditMessage = [
    body('message').trim().isLength({ min: 1, max: 5000 })
  ];

  static validateFlagMessage = [
    body('reason').trim().isLength({ min: 5, max: 500 })
  ];

  static async sendMessage(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { conversation_id, receiver_id, message, message_type = 'text' } = req.body;
      const sender_id = req.user.id;

      // If conversation_id is provided, send to existing conversation
      if (conversation_id) {
        req.params.id = conversation_id;
        return this.sendMessageToConversation(req, res);
      }

      // If receiver_id is provided, send direct message
      if (receiver_id) {
        return this.sendDirectMessage(req, res);
      }

      return res.status(400).json({
        success: false,
        message: 'Either conversation_id or receiver_id must be provided'
      });
    } catch (error) {
      console.error('Send message error:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to send message' 
      });
    }
  }

  static async getConversation(req, res) {
    try {
      const { job_id, other_user_id } = req.params;
      const { page = 1, limit = 50 } = req.query;
      const user_id = req.user.id;

      // Check if job exists
      const job = await Job.findById(job_id);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      // Check if user has access to this conversation
      const canAccess = await Message.canUserAccessConversation(job_id, user_id);
      if (!canAccess) {
        return res.status(403).json({ error: 'Not authorized to view this conversation' });
      }

      // Check if other user also has access
      const otherUserCanAccess = await Message.canUserAccessConversation(job_id, parseInt(other_user_id));
      if (!otherUserCanAccess) {
        return res.status(400).json({ error: 'Invalid conversation participants' });
      }

      const result = await Message.getConversation(
        job_id,
        user_id,
        parseInt(other_user_id),
        parseInt(page),
        parseInt(limit)
      );

      // Mark messages as read
      await Message.markAsRead(job_id, user_id);

      res.json(result);
    } catch (error) {
      console.error('Get conversation error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getMyConversations(req, res) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const user_id = req.user.id;

      const result = await Message.getUserConversations(
        user_id,
        parseInt(page),
        parseInt(limit)
      );

      res.json(result);
    } catch (error) {
      console.error('Get my conversations error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async markMessagesAsRead(req, res) {
    try {
      const { job_id } = req.params;
      const user_id = req.user.id;

      // Check if job exists
      const job = await Job.findById(job_id);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      // Check if user has access to this conversation
      const canAccess = await Message.canUserAccessConversation(job_id, user_id);
      if (!canAccess) {
        return res.status(403).json({ error: 'Not authorized to access this conversation' });
      }

      const markedCount = await Message.markAsRead(job_id, user_id);

      res.json({ 
        message: 'Messages marked as read',
        marked_count: markedCount
      });
    } catch (error) {
      console.error('Mark messages as read error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getUnreadCount(req, res) {
    try {
      const user_id = req.user.id;
      const unreadCount = await Message.getUnreadCount(user_id);

      res.json({ unread_count: unreadCount });
    } catch (error) {
      console.error('Get unread count error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getMessage(req, res) {
    try {
      const { id } = req.params;
      const message = await Message.findById(id);
      
      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      // Check if user has access to this message
      const canAccess = await Message.canUserAccessConversation(message.job_id, req.user.id);
      if (!canAccess) {
        return res.status(403).json({ error: 'Not authorized to view this message' });
      }

      res.json({ message });
    } catch (error) {
      console.error('Get message error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Enhanced messaging methods
  static async sendDirectMessage(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false,
          errors: errors.array() 
        });
      }

      const { message, receiver_id, message_type = 'text' } = req.body;
      const sender_id = req.user.id;

      // Prevent sending message to self
      if (sender_id === parseInt(receiver_id)) {
        return res.status(400).json({ 
          success: false,
          message: 'Cannot send message to yourself' 
        });
      }

      // Process content filtering
      const contentResult = await ContentFilter.processMessage(message);
      if (contentResult.action === 'blocked') {
        return res.status(400).json({
          success: false,
          message: 'Message blocked due to policy violations',
          violations: contentResult.violations
        });
      }

      // Handle file upload if present
      let fileData = null;
      if (req.file && message_type !== 'text') {
        fileData = await this.processUploadedFile(req.file);
      }

      const messageId = await Message.createDirectMessage({
        sender_id,
        receiver_id: parseInt(receiver_id),
        message: contentResult.processedMessage,
        message_type,
        file_data: fileData
      });

      // Emit real-time notification
      req.io?.to(`user_${receiver_id}`).emit('new_message', {
        message_id: messageId,
        sender_id,
        message: contentResult.processedMessage,
        message_type,
        created_at: new Date().toISOString()
      });

      res.status(201).json({
        success: true,
        message: 'Message sent successfully',
        message_id: messageId
      });
    } catch (error) {
      console.error('Send direct message error:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to send message' 
      });
    }
  }

  static async sendMessageToConversation(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false,
          errors: errors.array() 
        });
      }

      const { id: conversation_id } = req.params;
      const { message, message_type = 'text' } = req.body;
      const sender_id = req.user.id;

      // Get conversation and verify access
      const conversation = await Conversation.findById(conversation_id);
      if (!conversation) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found'
        });
      }

      const hasAccess = await Conversation.canUserAccessConversation(conversation_id, sender_id);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this conversation'
        });
      }

      // Determine receiver
      const receiver_id = conversation.participant_1_id === sender_id 
        ? conversation.participant_2_id 
        : conversation.participant_1_id;

      // Process content filtering
      const contentResult = await ContentFilter.processMessage(message);
      if (contentResult.action === 'blocked') {
        return res.status(400).json({
          success: false,
          message: 'Message blocked due to policy violations',
          violations: contentResult.violations
        });
      }

      // Handle file upload if present
      let fileData = null;
      if (req.file && message_type !== 'text') {
        fileData = await this.processUploadedFile(req.file);
      }

      const messageId = await Message.create({
        job_id: conversation.job_id,
        sender_id,
        receiver_id,
        message: contentResult.processedMessage,
        message_type,
        conversation_id,
        conversation_type: conversation.type,
        ...fileData
      });

      // Update conversation last message
      await Conversation.updateLastMessage(conversation_id, messageId);

      // Emit real-time notification
      req.io?.to(`user_${receiver_id}`).emit('new_message', {
        message_id: messageId,
        conversation_id,
        sender_id,
        message: contentResult.processedMessage,
        message_type,
        created_at: new Date().toISOString()
      });

      res.status(201).json({
        success: true,
        message: 'Message sent successfully',
        message_id: messageId
      });
    } catch (error) {
      console.error('Send message to conversation error:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to send message' 
      });
    }
  }

  static async getOrCreateDirectConversation(req, res) {
    try {
      const { user_id: other_user_id } = req.params;
      const user_id = req.user.id;

      if (user_id === parseInt(other_user_id)) {
        return res.status(400).json({
          success: false,
          message: 'Cannot create conversation with yourself'
        });
      }

      const conversation = await Conversation.findOrCreate({
        type: 'direct',
        participant_1_id: user_id,
        participant_2_id: parseInt(other_user_id)
      });

      res.json({
        success: true,
        data: conversation
      });
    } catch (error) {
      console.error('Get or create direct conversation error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create conversation'
      });
    }
  }

  static async editMessage(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false,
          errors: errors.array() 
        });
      }

      const { id } = req.params;
      const { message } = req.body;
      const user_id = req.user.id;

      const success = await Message.editMessage(id, user_id, message);
      
      if (!success) {
        return res.status(404).json({
          success: false,
          message: 'Message not found or access denied'
        });
      }

      res.json({
        success: true,
        message: 'Message updated successfully'
      });
    } catch (error) {
      console.error('Edit message error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to edit message'
      });
    }
  }

  static async deleteMessage(req, res) {
    try {
      const { id } = req.params;
      const user_id = req.user.id;

      const success = await Message.deleteMessage(id, user_id);
      
      if (!success) {
        return res.status(404).json({
          success: false,
          message: 'Message not found or access denied'
        });
      }

      res.json({
        success: true,
        message: 'Message deleted successfully'
      });
    } catch (error) {
      console.error('Delete message error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete message'
      });
    }
  }

  static async flagMessage(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false,
          errors: errors.array() 
        });
      }

      const { id } = req.params;
      const { reason } = req.body;
      const flagged_by = req.user.id;

      const success = await Message.flagMessage(id, flagged_by, reason);
      
      if (!success) {
        return res.status(404).json({
          success: false,
          message: 'Message not found'
        });
      }

      res.json({
        success: true,
        message: 'Message flagged successfully'
      });
    } catch (error) {
      console.error('Flag message error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to flag message'
      });
    }
  }

  static async markMessageAsRead(req, res) {
    try {
      const { id } = req.params;
      const user_id = req.user.id;

      const success = await Message.markAsRead(id, user_id);
      
      if (!success) {
        return res.status(404).json({
          success: false,
          message: 'Message not found or access denied'
        });
      }

      res.json({
        success: true,
        message: 'Message marked as read'
      });
    } catch (error) {
      console.error('Mark message as read error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark message as read'
      });
    }
  }

  static async searchConversations(req, res) {
    try {
      const user_id = req.user.id;
      const { q: query, page = 1, limit = 20 } = req.query;

      if (!query || query.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Search query must be at least 2 characters long'
        });
      }

      const result = await Conversation.searchConversations(
        user_id, 
        query.trim(), 
        parseInt(page), 
        parseInt(limit)
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Search conversations error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to search conversations'
      });
    }
  }

  static async searchMessages(req, res) {
    try {
      const user_id = req.user.id;
      const { q: query, conversation_id, page = 1, limit = 50 } = req.query;

      if (!query || query.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Search query must be at least 2 characters long'
        });
      }

      // Implementation would depend on adding search method to Message model
      res.json({
        success: true,
        data: { messages: [], total: 0, page: 1, totalPages: 0 }
      });
    } catch (error) {
      console.error('Search messages error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to search messages'
      });
    }
  }

  static async getMessageStatistics(req, res) {
    try {
      const user_id = req.user.id;

      const stats = await Conversation.getConversationStatistics(user_id);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Get message statistics error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch statistics'
      });
    }
  }

  // Admin methods
  static async getFlaggedMessages(req, res) {
    try {
      const { page = 1, limit = 20 } = req.query;

      const result = await Message.getFlaggedMessages(
        parseInt(page), 
        parseInt(limit)
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Get flagged messages error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch flagged messages'
      });
    }
  }

  static async reviewFlaggedMessage(req, res) {
    try {
      const { id } = req.params;
      const { action, admin_notes } = req.body;
      const reviewed_by = req.user.id;

      // Implementation would update the flagged message review status
      res.json({
        success: true,
        message: 'Message review completed'
      });
    } catch (error) {
      console.error('Review flagged message error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to review message'
      });
    }
  }

  static async getContentViolations(req, res) {
    try {
      const { page = 1, limit = 20 } = req.query;

      // Implementation would fetch content violations from database
      res.json({
        success: true,
        data: { violations: [], total: 0, page: 1, totalPages: 0 }
      });
    } catch (error) {
      console.error('Get content violations error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch content violations'
      });
    }
  }

  static async getAdminStatistics(req, res) {
    try {
      // Implementation would aggregate admin statistics
      res.json({
        success: true,
        data: {
          total_messages: 0,
          flagged_messages: 0,
          blocked_messages: 0,
          active_conversations: 0
        }
      });
    } catch (error) {
      console.error('Get admin statistics error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch admin statistics'
      });
    }
  }

  // Legacy methods (maintained for backward compatibility)
  static async sendJobMessage(req, res) {
    return this.sendMessage(req, res);
  }

  static async getJobConversation(req, res) {
    return this.getConversation(req, res);
  }

  static async markJobMessagesAsRead(req, res) {
    return this.markMessagesAsRead(req, res);
  }

  static async deleteJobConversation(req, res) {
    return this.deleteConversation(req, res);
  }

  // Utility methods
  static async processUploadedFile(file) {
    try {
      // Generate file hash for deduplication
      const fileHash = await generateFileHash(file.path);
      
      return {
        file_url: `/uploads/messages/${file.filename}`,
        file_name: file.filename,
        file_size: file.size,
        file_type: path.extname(file.originalname).toLowerCase().substring(1),
        metadata: {
          original_name: file.originalname,
          mime_type: file.mimetype,
          file_hash: fileHash
        }
      };
    } catch (error) {
      console.error('Process uploaded file error:', error);
      throw new Error('Failed to process uploaded file');
    }
  }

  // Original methods with legacy support
  static async deleteConversation(req, res) {
    try {
      const { job_id, other_user_id } = req.params;
      const user_id = req.user.id;

      // Check if job exists
      const job = await Job.findById(job_id);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      // Check if user has access to this conversation
      const canAccess = await Message.canUserAccessConversation(job_id, user_id);
      if (!canAccess) {
        return res.status(403).json({ error: 'Not authorized to delete this conversation' });
      }

      // Check if other user also has access
      const otherUserCanAccess = await Message.canUserAccessConversation(job_id, parseInt(other_user_id));
      if (!otherUserCanAccess) {
        return res.status(400).json({ error: 'Invalid conversation participants' });
      }

      const deletedCount = await Message.deleteConversation(
        job_id,
        user_id,
        parseInt(other_user_id)
      );

      res.json({ 
        message: 'Conversation deleted successfully',
        deleted_messages: deletedCount
      });
    } catch (error) {
      console.error('Delete conversation error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

module.exports = MessageController;
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { validationResult } = require('express-validator');

class ConversationController {
  static async getUserConversations(req, res) {
    try {
      const user_id = req.user.id;
      const { type, page = 1, limit = 20 } = req.query;

      const result = await Conversation.getUserConversations(
        user_id, 
        type, 
        parseInt(page), 
        parseInt(limit)
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Get user conversations error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch conversations'
      });
    }
  }

  static async getConversation(req, res) {
    try {
      const { id } = req.params;
      const user_id = req.user.id;

      // Check if user has access to this conversation
      const hasAccess = await Conversation.canUserAccessConversation(id, user_id);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this conversation'
        });
      }

      const conversation = await Conversation.findById(id);
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
      console.error('Get conversation error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch conversation'
      });
    }
  }

  static async getConversationMessages(req, res) {
    try {
      const { id } = req.params;
      const user_id = req.user.id;
      const { page = 1, limit = 50 } = req.query;

      const result = await Conversation.getConversationMessages(
        id, 
        user_id, 
        parseInt(page), 
        parseInt(limit)
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Get conversation messages error:', error);
      
      if (error.message === 'Access denied to this conversation') {
        return res.status(403).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to fetch messages'
      });
    }
  }

  static async markConversationAsRead(req, res) {
    try {
      const { id } = req.params;
      const user_id = req.user.id;

      // Check if user has access to this conversation
      const hasAccess = await Conversation.canUserAccessConversation(id, user_id);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this conversation'
        });
      }

      // Mark all unread messages in this conversation as read
      await Message.markConversationAsRead(id, user_id);

      res.json({
        success: true,
        message: 'Conversation marked as read'
      });
    } catch (error) {
      console.error('Mark conversation as read error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark conversation as read'
      });
    }
  }

  static async deleteConversation(req, res) {
    try {
      const { id } = req.params;
      const user_id = req.user.id;

      const success = await Conversation.deleteConversation(id, user_id);
      
      if (!success) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found or access denied'
        });
      }

      res.json({
        success: true,
        message: 'Conversation deleted successfully'
      });
    } catch (error) {
      console.error('Delete conversation error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete conversation'
      });
    }
  }

  static async archiveConversation(req, res) {
    try {
      const { id } = req.params;
      const user_id = req.user.id;

      const success = await Conversation.archiveConversation(id, user_id);
      
      if (!success) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found or access denied'
        });
      }

      res.json({
        success: true,
        message: 'Conversation archived successfully'
      });
    } catch (error) {
      console.error('Archive conversation error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to archive conversation'
      });
    }
  }

  static async blockConversation(req, res) {
    try {
      const { id } = req.params;
      const user_id = req.user.id;

      // Check if user has access to this conversation
      const hasAccess = await Conversation.canUserAccessConversation(id, user_id);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this conversation'
        });
      }

      const success = await Conversation.blockConversation(id, user_id);
      
      if (!success) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found'
        });
      }

      res.json({
        success: true,
        message: 'Conversation blocked successfully'
      });
    } catch (error) {
      console.error('Block conversation error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to block conversation'
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

  static async getConversationStatistics(req, res) {
    try {
      const user_id = req.user.id;

      const stats = await Conversation.getConversationStatistics(user_id);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Get conversation statistics error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch conversation statistics'
      });
    }
  }
}

module.exports = ConversationController;
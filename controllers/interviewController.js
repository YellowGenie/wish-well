const { body, validationResult } = require('express-validator');
const Interview = require('../models/Interview');
const Conversation = require('../models/Conversation');
const TalentProfile = require('../models/TalentProfile');
const ManagerProfile = require('../models/ManagerProfile');

class InterviewController {
  static validateCreateInterview = [
    body('title').trim().isLength({ min: 3, max: 200 }),
    body('description').optional().trim().isLength({ max: 2000 }),
    body('talent_id').isInt({ min: 1 }),
    body('job_id').optional().isInt({ min: 1 }),
    body('proposal_id').optional().isInt({ min: 1 }),
    body('questions').optional().isArray({ min: 1, max: 20 }),
    body('questions.*.text').if(body('questions').exists()).trim().isLength({ min: 5, max: 1000 }),
    body('questions.*.type').if(body('questions').exists()).optional().isIn(['text', 'multiple_choice', 'coding', 'practical']),
    body('estimated_duration').optional().isInt({ min: 15, max: 480 }),
    body('scheduled_at').optional().isISO8601(),
    body('priority').optional().isIn(['low', 'medium', 'high', 'urgent'])
  ];

  static validateUpdateStatus = [
    body('status').isIn(['created', 'sent', 'in_progress', 'completed', 'reviewed', 'next_steps', 'rejected', 'inappropriate', 'hold', 'cancelled']),
    body('change_reason').optional().trim().isLength({ max: 500 })
  ];

  static validateAnswerQuestion = [
    body('answer').trim().isLength({ min: 1, max: 5000 })
  ];

  static validateAddRating = [
    body('rating').isInt({ min: 1, max: 5 }),
    body('feedback').optional().trim().isLength({ max: 2000 }),
    body('rater_type').isIn(['manager', 'talent'])
  ];

  static validateFlagInterview = [
    body('reason').trim().isLength({ min: 5, max: 500 })
  ];

  static async createInterview(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const {
        title,
        description,
        talent_id,
        job_id,
        proposal_id,
        questions = [],
        estimated_duration,
        scheduled_at,
        priority = 'medium'
      } = req.body;

      const user_id = req.user.id;

      // Get manager profile ID
      const managerProfile = await ManagerProfile.findByUserId(user_id);
      if (!managerProfile) {
        return res.status(403).json({
          success: false,
          message: 'Only managers can create interviews'
        });
      }

      // Verify talent exists
      const talentProfile = await TalentProfile.findById(talent_id);
      if (!talentProfile) {
        return res.status(404).json({
          success: false,
          message: 'Talent profile not found'
        });
      }

      const interviewId = await Interview.create({
        title,
        description,
        manager_id: managerProfile.id,
        talent_id,
        job_id,
        proposal_id,
        questions,
        estimated_duration,
        scheduled_at,
        priority
      });

      // Send notification to talent
      req.io?.to(`user_${talentProfile.user_id}`).emit('interview_created', {
        interview_id: interviewId,
        title,
        manager_name: `${req.user.first_name} ${req.user.last_name}`,
        scheduled_at
      });

      res.status(201).json({
        success: true,
        message: 'Interview created successfully',
        interview_id: interviewId
      });
    } catch (error) {
      console.error('Create interview error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create interview'
      });
    }
  }

  static async getInterview(req, res) {
    try {
      const { id } = req.params;
      const user_id = req.user.id;

      const interview = await Interview.findById(id);
      if (!interview) {
        return res.status(404).json({
          success: false,
          message: 'Interview not found'
        });
      }

      // Check if user has access to this interview
      const hasAccess = interview.manager_user_id === user_id || 
                       interview.talent_user_id === user_id ||
                       req.user.role === 'admin';

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this interview'
        });
      }

      res.json({
        success: true,
        data: interview
      });
    } catch (error) {
      console.error('Get interview error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch interview'
      });
    }
  }

  static async getUserInterviews(req, res) {
    try {
      const user_id = req.user.id;
      const { status, page = 1, limit = 20 } = req.query;

      let result;
      if (req.user.role === 'manager') {
        const managerProfile = await ManagerProfile.findByUserId(user_id);
        if (!managerProfile) {
          return res.status(404).json({
            success: false,
            message: 'Manager profile not found'
          });
        }

        result = await Interview.getInterviewsByManager(
          managerProfile.id,
          status,
          parseInt(page),
          parseInt(limit)
        );
      } else if (req.user.role === 'talent') {
        const talentProfile = await TalentProfile.findByUserId(user_id);
        if (!talentProfile) {
          return res.status(404).json({
            success: false,
            message: 'Talent profile not found'
          });
        }

        result = await Interview.getInterviewsByTalent(
          talentProfile.id,
          status,
          parseInt(page),
          parseInt(limit)
        );
      } else if (req.user.role === 'admin') {
        // Admin can see all interviews
        result = await Interview.getAllInterviews(
          status,
          parseInt(page),
          parseInt(limit)
        );
      } else {
        return res.status(403).json({
          success: false,
          message: 'Invalid user role'
        });
      }

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Get user interviews error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch interviews'
      });
    }
  }

  static async updateInterviewStatus(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { id } = req.params;
      const { status, change_reason } = req.body;
      const user_id = req.user.id;

      // Get interview and verify access
      const interview = await Interview.findById(id);
      if (!interview) {
        return res.status(404).json({
          success: false,
          message: 'Interview not found'
        });
      }

      const hasAccess = interview.manager_user_id === user_id || 
                       interview.talent_user_id === user_id;

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this interview'
        });
      }

      const success = await Interview.updateStatus(id, status, user_id, change_reason);
      
      if (!success) {
        return res.status(400).json({
          success: false,
          message: 'Failed to update interview status'
        });
      }

      // Notify other participant
      const otherUserId = interview.manager_user_id === user_id 
        ? interview.talent_user_id 
        : interview.manager_user_id;

      req.io?.to(`user_${otherUserId}`).emit('interview_status_updated', {
        interview_id: id,
        new_status: status,
        updated_by: `${req.user.first_name} ${req.user.last_name}`
      });

      res.json({
        success: true,
        message: 'Interview status updated successfully'
      });
    } catch (error) {
      console.error('Update interview status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update interview status'
      });
    }
  }

  static async answerQuestion(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { id, question_id } = req.params;
      const { answer } = req.body;
      const user_id = req.user.id;

      // Get interview and verify it's the talent answering
      const interview = await Interview.findById(id);
      if (!interview) {
        return res.status(404).json({
          success: false,
          message: 'Interview not found'
        });
      }

      if (interview.talent_user_id !== user_id) {
        return res.status(403).json({
          success: false,
          message: 'Only the interviewee can answer questions'
        });
      }

      const success = await Interview.answerQuestion(question_id, answer, user_id);
      
      if (!success) {
        return res.status(404).json({
          success: false,
          message: 'Question not found'
        });
      }

      // Notify manager
      req.io?.to(`user_${interview.manager_user_id}`).emit('question_answered', {
        interview_id: id,
        question_id,
        answered_by: `${req.user.first_name} ${req.user.last_name}`
      });

      res.json({
        success: true,
        message: 'Question answered successfully'
      });
    } catch (error) {
      console.error('Answer question error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to answer question'
      });
    }
  }

  static async addRating(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { id } = req.params;
      const { rating, feedback, rater_type } = req.body;
      const user_id = req.user.id;

      // Get interview and verify access
      const interview = await Interview.findById(id);
      if (!interview) {
        return res.status(404).json({
          success: false,
          message: 'Interview not found'
        });
      }

      // Verify rater type matches user role
      if (rater_type === 'manager' && interview.manager_user_id !== user_id) {
        return res.status(403).json({
          success: false,
          message: 'Only the interviewing manager can provide manager rating'
        });
      }

      if (rater_type === 'talent' && interview.talent_user_id !== user_id) {
        return res.status(403).json({
          success: false,
          message: 'Only the interviewed talent can provide talent rating'
        });
      }

      const success = await Interview.addRating(id, rater_type, rating, feedback, user_id);
      
      if (!success) {
        return res.status(400).json({
          success: false,
          message: 'Failed to add rating'
        });
      }

      res.json({
        success: true,
        message: 'Rating added successfully'
      });
    } catch (error) {
      console.error('Add rating error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to add rating'
      });
    }
  }

  static async getInterviewProgress(req, res) {
    try {
      const { id } = req.params;
      const user_id = req.user.id;

      // Get interview and verify access
      const interview = await Interview.findById(id);
      if (!interview) {
        return res.status(404).json({
          success: false,
          message: 'Interview not found'
        });
      }

      const hasAccess = interview.manager_user_id === user_id || 
                       interview.talent_user_id === user_id ||
                       req.user.role === 'admin';

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this interview'
        });
      }

      const progress = await Interview.getInterviewProgress(id);

      res.json({
        success: true,
        data: progress
      });
    } catch (error) {
      console.error('Get interview progress error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch interview progress'
      });
    }
  }

  static async getInterviewConversation(req, res) {
    try {
      const { id } = req.params;
      const user_id = req.user.id;

      // Get interview and verify access
      const interview = await Interview.findById(id);
      if (!interview) {
        return res.status(404).json({
          success: false,
          message: 'Interview not found'
        });
      }

      const hasAccess = interview.manager_user_id === user_id || 
                       interview.talent_user_id === user_id;

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this interview'
        });
      }

      const conversation = await Interview.getInterviewConversation(id);

      res.json({
        success: true,
        data: conversation
      });
    } catch (error) {
      console.error('Get interview conversation error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch interview conversation'
      });
    }
  }

  static async updateParticipantStatus(req, res) {
    try {
      const { id, user_id: participant_user_id } = req.params;
      const { status } = req.body;
      const user_id = req.user.id;

      // Only the participant themselves can update their status
      if (user_id !== parseInt(participant_user_id)) {
        return res.status(403).json({
          success: false,
          message: 'Can only update your own participation status'
        });
      }

      const success = await Interview.updateParticipantStatus(id, user_id, status);
      
      if (!success) {
        return res.status(404).json({
          success: false,
          message: 'Interview or participant not found'
        });
      }

      res.json({
        success: true,
        message: 'Participant status updated successfully'
      });
    } catch (error) {
      console.error('Update participant status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update participant status'
      });
    }
  }

  static async flagInterview(req, res) {
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

      const success = await Interview.flagInterview(id, flagged_by, reason);
      
      if (!success) {
        return res.status(404).json({
          success: false,
          message: 'Interview not found'
        });
      }

      res.json({
        success: true,
        message: 'Interview flagged successfully'
      });
    } catch (error) {
      console.error('Flag interview error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to flag interview'
      });
    }
  }

  static async getInterviewStatistics(req, res) {
    try {
      const user_id = req.user.id;
      const user_type = req.user.role;

      const stats = await Interview.getInterviewStatistics(user_id, user_type);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Get interview statistics error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch interview statistics'
      });
    }
  }

  // Admin methods
  static async getAllInterviews(req, res) {
    try {
      const { page = 1, limit = 20, ...filters } = req.query;

      const result = await Interview.getAllInterviews(
        parseInt(page),
        parseInt(limit),
        filters
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Get all interviews error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch interviews'
      });
    }
  }

  static async adminUpdateInterviewStatus(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { id } = req.params;
      const { status, change_reason } = req.body;
      const user_id = req.user.id;

      const success = await Interview.updateStatus(id, status, user_id, change_reason);
      
      if (!success) {
        return res.status(404).json({
          success: false,
          message: 'Interview not found'
        });
      }

      res.json({
        success: true,
        message: 'Interview status updated successfully'
      });
    } catch (error) {
      console.error('Admin update interview status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update interview status'
      });
    }
  }

  static async deleteInterview(req, res) {
    try {
      const { id } = req.params;
      const deleted_by = req.user.id;

      const success = await Interview.deleteInterview(id, deleted_by);
      
      if (!success) {
        return res.status(404).json({
          success: false,
          message: 'Interview not found'
        });
      }

      res.json({
        success: true,
        message: 'Interview deleted successfully'
      });
    } catch (error) {
      console.error('Delete interview error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete interview'
      });
    }
  }

  static async getFlaggedInterviews(req, res) {
    try {
      const { page = 1, limit = 20 } = req.query;

      const result = await Interview.getAllInterviews(
        parseInt(page),
        parseInt(limit),
        { is_flagged: true }
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Get flagged interviews error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch flagged interviews'
      });
    }
  }

  static async reviewFlaggedInterview(req, res) {
    try {
      const { id } = req.params;
      const { action, admin_notes } = req.body;

      // Implementation would update the flagged interview review status
      res.json({
        success: true,
        message: 'Interview review completed'
      });
    } catch (error) {
      console.error('Review flagged interview error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to review interview'
      });
    }
  }

  static async getAdminInterviewStatistics(req, res) {
    try {
      // Implementation would aggregate admin statistics
      res.json({
        success: true,
        data: {
          total_interviews: 0,
          active_interviews: 0,
          completed_interviews: 0,
          flagged_interviews: 0
        }
      });
    } catch (error) {
      console.error('Get admin interview statistics error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch admin statistics'
      });
    }
  }
}

module.exports = InterviewController;
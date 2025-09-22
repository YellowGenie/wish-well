const { body, validationResult } = require('express-validator');
const InterviewTemplate = require('../models/InterviewTemplate');
const ManagerProfile = require('../models/ManagerProfile');

class InterviewTemplateController {
  static validateCreateTemplate = [
    body('name').trim().isLength({ min: 3, max: 100 }),
    body('description').optional().trim().isLength({ max: 1000 }),
    body('category').optional().isIn(['technical', 'behavioral', 'cultural_fit', 'general', 'specialized']),
    body('questions').optional().isArray({ min: 1, max: 50 }),
    body('questions.*.text').if(body('questions').exists()).trim().isLength({ min: 5, max: 1000 }),
    body('questions.*.type').if(body('questions').exists()).optional().isIn(['text', 'multiple_choice', 'coding', 'practical']),
    body('estimated_duration').optional().isInt({ min: 15, max: 480 }),
    body('difficulty_level').optional().isIn(['beginner', 'intermediate', 'advanced', 'expert']),
    body('tags').optional().isArray({ max: 10 }),
    body('tags.*').if(body('tags').exists()).trim().isLength({ min: 1, max: 50 }),
    body('is_public').optional().isBoolean()
  ];

  static validateUpdateTemplate = [
    body('name').optional().trim().isLength({ min: 3, max: 100 }),
    body('description').optional().trim().isLength({ max: 1000 }),
    body('category').optional().isIn(['technical', 'behavioral', 'cultural_fit', 'general', 'specialized']),
    body('questions').optional().isArray({ min: 1, max: 50 }),
    body('questions.*.text').if(body('questions').exists()).trim().isLength({ min: 5, max: 1000 }),
    body('questions.*.type').if(body('questions').exists()).optional().isIn(['text', 'multiple_choice', 'coding', 'practical']),
    body('estimated_duration').optional().isInt({ min: 15, max: 480 }),
    body('difficulty_level').optional().isIn(['beginner', 'intermediate', 'advanced', 'expert']),
    body('tags').optional().isArray({ max: 10 }),
    body('tags.*').if(body('tags').exists()).trim().isLength({ min: 1, max: 50 }),
    body('is_public').optional().isBoolean()
  ];

  static async createTemplate(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const {
        name,
        description,
        category = 'general',
        questions = [],
        estimated_duration = 60,
        difficulty_level = 'intermediate',
        tags = [],
        is_public = false
      } = req.body;

      const user_id = req.user.id;

      // Get manager profile ID
      const managerProfile = await ManagerProfile.findByUserId(user_id);
      if (!managerProfile) {
        return res.status(403).json({
          success: false,
          message: 'Only managers can create interview templates'
        });
      }

      const templateId = await InterviewTemplate.create({
        name,
        description,
        manager_id: managerProfile.id,
        category,
        questions,
        estimated_duration,
        difficulty_level,
        tags,
        is_public
      });

      res.status(201).json({
        success: true,
        message: 'Interview template created successfully',
        template_id: templateId
      });
    } catch (error) {
      console.error('Create template error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create interview template'
      });
    }
  }

  static async getTemplate(req, res) {
    try {
      const { id } = req.params;
      const user_id = req.user.id;

      const template = await InterviewTemplate.findById(id);
      if (!template) {
        return res.status(404).json({
          success: false,
          message: 'Template not found'
        });
      }

      // Check access - manager can see their templates, or public templates
      const managerProfile = await ManagerProfile.findByUserId(user_id);
      const hasAccess = template.is_public ||
                       (managerProfile && template.manager_id.toString() === managerProfile.id.toString()) ||
                       req.user.role === 'admin';

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this template'
        });
      }

      res.json({
        success: true,
        data: { ...template.toObject(), id: template._id.toString() }
      });
    } catch (error) {
      console.error('Get template error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch template'
      });
    }
  }

  static async getManagerTemplates(req, res) {
    try {
      const user_id = req.user.id;
      const { category, difficulty_level, tags, search, page = 1, limit = 20 } = req.query;

      const managerProfile = await ManagerProfile.findByUserId(user_id);
      if (!managerProfile) {
        return res.status(404).json({
          success: false,
          message: 'Manager profile not found'
        });
      }

      const filters = {};
      if (category) filters.category = category;
      if (difficulty_level) filters.difficulty_level = difficulty_level;
      if (tags) filters.tags = Array.isArray(tags) ? tags : [tags];
      if (search) filters.search = search;

      const result = await InterviewTemplate.getTemplatesByManager(
        managerProfile.id,
        filters,
        parseInt(page),
        parseInt(limit)
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Get manager templates error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch templates'
      });
    }
  }

  static async getPublicTemplates(req, res) {
    try {
      const { category, difficulty_level, tags, search, page = 1, limit = 20 } = req.query;

      const filters = {};
      if (category) filters.category = category;
      if (difficulty_level) filters.difficulty_level = difficulty_level;
      if (tags) filters.tags = Array.isArray(tags) ? tags : [tags];
      if (search) filters.search = search;

      const result = await InterviewTemplate.getPublicTemplates(
        filters,
        parseInt(page),
        parseInt(limit)
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Get public templates error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch public templates'
      });
    }
  }

  static async updateTemplate(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { id } = req.params;
      const user_id = req.user.id;

      const managerProfile = await ManagerProfile.findByUserId(user_id);
      if (!managerProfile) {
        return res.status(403).json({
          success: false,
          message: 'Only managers can update templates'
        });
      }

      const success = await InterviewTemplate.updateTemplate(id, managerProfile.id, req.body);

      if (!success) {
        return res.status(404).json({
          success: false,
          message: 'Template not found or access denied'
        });
      }

      res.json({
        success: true,
        message: 'Template updated successfully'
      });
    } catch (error) {
      console.error('Update template error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update template'
      });
    }
  }

  static async deleteTemplate(req, res) {
    try {
      const { id } = req.params;
      const user_id = req.user.id;

      const managerProfile = await ManagerProfile.findByUserId(user_id);
      if (!managerProfile) {
        return res.status(403).json({
          success: false,
          message: 'Only managers can delete templates'
        });
      }

      const success = await InterviewTemplate.deleteTemplate(id, managerProfile.id);

      if (!success) {
        return res.status(404).json({
          success: false,
          message: 'Template not found or access denied'
        });
      }

      res.json({
        success: true,
        message: 'Template deleted successfully'
      });
    } catch (error) {
      console.error('Delete template error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete template'
      });
    }
  }

  static async duplicateTemplate(req, res) {
    try {
      const { id } = req.params;
      const { name } = req.body;
      const user_id = req.user.id;

      const managerProfile = await ManagerProfile.findByUserId(user_id);
      if (!managerProfile) {
        return res.status(403).json({
          success: false,
          message: 'Only managers can duplicate templates'
        });
      }

      const newTemplateId = await InterviewTemplate.duplicateTemplate(id, managerProfile.id, name);

      if (!newTemplateId) {
        return res.status(404).json({
          success: false,
          message: 'Template not found'
        });
      }

      res.json({
        success: true,
        message: 'Template duplicated successfully',
        template_id: newTemplateId
      });
    } catch (error) {
      console.error('Duplicate template error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to duplicate template'
      });
    }
  }

  static async useTemplate(req, res) {
    try {
      const { id } = req.params;

      const template = await InterviewTemplate.findById(id);
      if (!template) {
        return res.status(404).json({
          success: false,
          message: 'Template not found'
        });
      }

      // Update usage statistics
      await InterviewTemplate.useTemplate(id);

      res.json({
        success: true,
        data: { ...template.toObject(), id: template._id.toString() }
      });
    } catch (error) {
      console.error('Use template error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to use template'
      });
    }
  }
}

module.exports = InterviewTemplateController;
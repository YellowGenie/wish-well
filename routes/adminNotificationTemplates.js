const express = require('express');
const router = express.Router();
const AdminNotificationTemplate = require('../models/AdminNotificationTemplate');
const { auth, requireAdmin } = require('../middleware/auth');
const { body, query, validationResult } = require('express-validator');

// Middleware to ensure only admins can access these routes
router.use(auth);
router.use(requireAdmin);

// Get all templates with filtering and pagination
router.get('/', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('is_active').optional().isBoolean(),
  query('search').optional().isLength({ max: 255 }),
  query('sort_by').optional().isIn(['created_at', 'updated_at', 'template_name', 'usage_count']),
  query('sort_order').optional().isIn(['ASC', 'DESC'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const {
      page = 1,
      limit = 20,
      is_active,
      search,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;

    const templates = await AdminNotificationTemplate.findAll({
      limit: parseInt(limit),
      offset,
      is_active: is_active !== undefined ? is_active === 'true' : null,
      search,
      sort_by,
      sort_order
    });

    // Get total count for pagination
    const totalTemplates = await AdminNotificationTemplate.findAll({ limit: 1000000 });
    const total = totalTemplates.length;

    res.json({
      success: true,
      data: {
        templates,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get popular templates
router.get('/popular', [
  query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const templates = await AdminNotificationTemplate.getPopularTemplates(parseInt(limit));
    
    res.json({ success: true, data: templates });
  } catch (error) {
    console.error('Error fetching popular templates:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Search templates
router.get('/search', [
  query('q').notEmpty().trim().isLength({ min: 2, max: 255 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { q, limit = 20 } = req.query;
    
    const templates = await AdminNotificationTemplate.searchTemplates(q, parseInt(limit));
    
    res.json({ success: true, data: templates });
  } catch (error) {
    console.error('Error searching templates:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get a specific template
router.get('/:id', async (req, res) => {
  try {
    const template = await AdminNotificationTemplate.findById(req.params.id);
    
    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    res.json({ success: true, data: template });
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get template variables
router.get('/:id/variables', async (req, res) => {
  try {
    const variables = await AdminNotificationTemplate.getTemplateVariables(req.params.id);
    
    res.json({ success: true, data: variables });
  } catch (error) {
    console.error('Error fetching template variables:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Create a new template
router.post('/', [
  body('template_name').notEmpty().trim().isLength({ max: 255 }),
  body('template_description').optional().trim().isLength({ max: 1000 }),
  body('title').notEmpty().trim().isLength({ max: 255 }),
  body('message').notEmpty().trim(),
  body('notification_type').optional().isIn(['modal', 'chatbot', 'both']),
  body('display_settings').optional().isObject(),
  body('modal_size').optional().isIn(['small', 'medium', 'large']),
  body('default_target_audience').optional().isIn(['talent', 'manager', 'both', 'specific_users']),
  body('default_priority').optional().isIn(['low', 'normal', 'high', 'urgent'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const templateData = {
      ...req.body,
      created_by: req.user.id
    };

    const templateId = await AdminNotificationTemplate.create(templateData);

    res.status(201).json({
      success: true,
      data: { id: templateId },
      message: 'Template created successfully'
    });
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Update a template
router.put('/:id', [
  body('template_name').optional().trim().isLength({ max: 255 }),
  body('template_description').optional().trim().isLength({ max: 1000 }),
  body('title').optional().trim().isLength({ max: 255 }),
  body('message').optional().trim(),
  body('notification_type').optional().isIn(['modal', 'chatbot', 'both']),
  body('display_settings').optional().isObject(),
  body('modal_size').optional().isIn(['small', 'medium', 'large']),
  body('default_target_audience').optional().isIn(['talent', 'manager', 'both', 'specific_users']),
  body('default_priority').optional().isIn(['low', 'normal', 'high', 'urgent']),
  body('is_active').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const updated = await AdminNotificationTemplate.update(req.params.id, req.body);
    
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    res.json({ success: true, message: 'Template updated successfully' });
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Delete a template
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await AdminNotificationTemplate.delete(req.params.id);
    
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    res.json({ success: true, message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Duplicate a template
router.post('/:id/duplicate', [
  body('new_name').notEmpty().trim().isLength({ max: 255 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { new_name } = req.body;
    
    const duplicatedId = await AdminNotificationTemplate.duplicateTemplate(
      req.params.id, 
      new_name, 
      req.user.id
    );

    res.status(201).json({
      success: true,
      data: { id: duplicatedId },
      message: 'Template duplicated successfully'
    });
  } catch (error) {
    console.error('Error duplicating template:', error);
    if (error.message === 'Template not found') {
      res.status(404).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
});

// Preview template with variables
router.post('/:id/preview', [
  body('variables').optional().isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const template = await AdminNotificationTemplate.findById(req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    const { variables = {} } = req.body;

    // Replace variables in template content
    const previewTitle = AdminNotificationTemplate.replaceVariables(template.title, variables);
    const previewMessage = AdminNotificationTemplate.replaceVariables(template.message, variables);

    // Get list of available variables
    const availableVariables = await AdminNotificationTemplate.getTemplateVariables(req.params.id);

    res.json({
      success: true,
      data: {
        original: {
          title: template.title,
          message: template.message
        },
        preview: {
          title: previewTitle,
          message: previewMessage
        },
        variables: availableVariables,
        display_settings: template.display_settings
      }
    });
  } catch (error) {
    console.error('Error previewing template:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
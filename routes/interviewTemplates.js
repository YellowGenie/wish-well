const express = require('express');
const InterviewTemplateController = require('../controllers/interviewTemplateController');
const { auth, requireManager, requireManagerOrAdmin } = require('../middleware/auth');

const router = express.Router();

// Template management routes

// Create template (manager only)
router.post('/', auth, requireManager, InterviewTemplateController.validateCreateTemplate, InterviewTemplateController.createTemplate);

// Get template by ID
router.get('/:id', auth, InterviewTemplateController.getTemplate);

// Update template
router.put('/:id', auth, requireManager, InterviewTemplateController.validateUpdateTemplate, InterviewTemplateController.updateTemplate);

// Delete template
router.delete('/:id', auth, requireManager, InterviewTemplateController.deleteTemplate);

// Get templates for current manager
router.get('/', auth, requireManager, InterviewTemplateController.getManagerTemplates);

// Get public templates
router.get('/public/all', auth, InterviewTemplateController.getPublicTemplates);

// Duplicate template
router.post('/:id/duplicate', auth, requireManager, InterviewTemplateController.duplicateTemplate);

// Use template (marks as used, increments counter)
router.post('/:id/use', auth, requireManager, InterviewTemplateController.useTemplate);

module.exports = router;
const express = require('express');
const SkillController = require('../controllers/skillController');
const { auth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Public routes
router.get('/', SkillController.validateSearchSkills, SkillController.getAllSkills);
router.get('/search', SkillController.validateSearchSkills, SkillController.searchSkills);
router.get('/categories', SkillController.getCategories);
router.get('/popular', SkillController.getPopularSkills);
router.get('/:id', SkillController.getSkill);

// Admin only routes
router.post('/', auth, requireAdmin, SkillController.validateCreateSkill, SkillController.createSkill);
router.post('/bulk', auth, requireAdmin, SkillController.bulkCreateSkills);
router.put('/:id', auth, requireAdmin, SkillController.validateUpdateSkill, SkillController.updateSkill);
router.delete('/:id', auth, requireAdmin, SkillController.deleteSkill);

module.exports = router;
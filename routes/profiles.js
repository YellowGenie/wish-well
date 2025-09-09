const express = require('express');
const ProfileController = require('../controllers/profileController');
const { auth, requireTalent, requireManager } = require('../middleware/auth');

const router = express.Router();

// Public talent profile routes
router.get('/talents/search', ProfileController.searchTalents);
router.get('/talents/:id', ProfileController.getTalentProfile);

// Public manager profile routes  
router.get('/managers/:id', ProfileController.getManagerProfile);

// Talent-only routes
router.get('/talent/me', auth, requireTalent, ProfileController.getMyTalentProfile);
router.put('/talent/me', auth, requireTalent, ProfileController.validateTalentProfile, ProfileController.updateTalentProfile);
router.post('/talent/me/skills', auth, requireTalent, ProfileController.addSkillToTalent);
router.delete('/talent/me/skills/:skill_id', auth, requireTalent, ProfileController.removeSkillFromTalent);

// Manager-only routes
router.get('/manager/me', auth, requireManager, ProfileController.getMyManagerProfile);
router.put('/manager/me', auth, requireManager, ProfileController.validateManagerProfile, ProfileController.updateManagerProfile);
router.get('/manager/dashboard', auth, requireManager, ProfileController.getManagerDashboard);
router.get('/manager/jobs', auth, requireManager, ProfileController.getManagerJobs);

module.exports = router;
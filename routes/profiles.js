const express = require('express');
const ProfileController = require('../controllers/profileController');
const { auth, requireTalent, requireManager } = require('../middleware/auth');

const router = express.Router();

// Public talent profile routes
router.get('/talents/search', ProfileController.searchTalents);
router.get('/talents/:id', ProfileController.getTalentProfile);
router.post('/talents/:id/view', ProfileController.incrementTalentProfileView);

// DEBUG: Temporary diagnostic endpoint
router.get('/debug/user/:email', ProfileController.debugUser);

// FIX: Create missing TalentProfile (POST)
router.post('/fix/talent-profile/:email', ProfileController.createMissingTalentProfile);

// FIX: Create missing TalentProfile (GET - for browser)
router.get('/fix/talent-profile/:email', ProfileController.createMissingTalentProfile);

// Public manager profile routes  
router.get('/managers/:id', ProfileController.getManagerProfile);

// Talent-only routes
router.get('/talent/me', auth, requireTalent, ProfileController.getMyTalentProfile);
router.put('/talent/me', auth, requireTalent, ProfileController.validateTalentProfile, ProfileController.updateTalentProfile);
router.get('/talent/dashboard', auth, requireTalent, ProfileController.getTalentDashboard);
router.post('/talent/me/skills', auth, requireTalent, ProfileController.addSkillToTalent);
router.delete('/talent/me/skills/:skill_id', auth, requireTalent, ProfileController.removeSkillFromTalent);

// Manager-only routes
router.get('/manager/me', auth, requireManager, ProfileController.getMyManagerProfile);
router.put('/manager/me', auth, requireManager, ProfileController.validateManagerProfile, ProfileController.updateManagerProfile);
router.get('/manager/dashboard', auth, requireManager, ProfileController.getManagerDashboard);
router.get('/manager/jobs', auth, requireManager, ProfileController.getManagerJobs);

module.exports = router;
const express = require('express');
const InterviewController = require('../controllers/interviewController');
const { auth, requireManagerOrTalent, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Interview management routes

// Create interview (manager only)
router.post('/', auth, requireManagerOrTalent, InterviewController.validateCreateInterview, InterviewController.createInterview);

// Get interview by ID
router.get('/:id', auth, requireManagerOrTalent, InterviewController.getInterview);

// Update interview status
router.put('/:id/status', auth, requireManagerOrTalent, InterviewController.validateUpdateStatus, InterviewController.updateInterviewStatus);

// Get interviews for current user (role-based)
router.get('/', auth, requireManagerOrTalent, InterviewController.getUserInterviews);

// Answer interview question (talent only)
router.post('/:id/questions/:question_id/answer', auth, requireManagerOrTalent, InterviewController.validateAnswerQuestion, InterviewController.answerQuestion);

// Add rating and feedback
router.post('/:id/rating', auth, requireManagerOrTalent, InterviewController.validateAddRating, InterviewController.addRating);

// Get interview progress
router.get('/:id/progress', auth, requireManagerOrTalent, InterviewController.getInterviewProgress);

// Get interview conversation
router.get('/:id/conversation', auth, requireManagerOrTalent, InterviewController.getInterviewConversation);

// Participant management
router.put('/:id/participants/:user_id/status', auth, requireManagerOrTalent, InterviewController.updateParticipantStatus);

// Flag interview (for inappropriate content)
router.post('/:id/flag', auth, requireManagerOrTalent, InterviewController.validateFlagInterview, InterviewController.flagInterview);

// Statistics
router.get('/stats/overview', auth, requireManagerOrTalent, InterviewController.getInterviewStatistics);

// Admin routes
router.get('/admin/all', auth, requireAdmin, InterviewController.getAllInterviews);
router.put('/admin/:id/status', auth, requireAdmin, InterviewController.validateUpdateStatus, InterviewController.adminUpdateInterviewStatus);
router.delete('/admin/:id', auth, requireAdmin, InterviewController.deleteInterview);
router.get('/admin/flagged', auth, requireAdmin, InterviewController.getFlaggedInterviews);
router.put('/admin/flagged/:id/review', auth, requireAdmin, InterviewController.reviewFlaggedInterview);
router.get('/admin/stats', auth, requireAdmin, InterviewController.getAdminInterviewStatistics);

module.exports = router;
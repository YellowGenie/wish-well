const express = require('express');
const JobController = require('../controllers/jobController');
const { auth, requireManager } = require('../middleware/auth');

const router = express.Router();

// Public routes
router.get('/', JobController.getAllJobs);
router.get('/featured', JobController.getFeaturedJobs);
router.get('/search', JobController.validateSearchJobs, JobController.searchJobs);

// Protected routes - Manager only (specific routes before generic :id routes)
router.get('/manager/my-jobs', auth, requireManager, JobController.getMyJobs);
router.post('/create-with-payment', auth, requireManager, JobController.validateCreateJob, JobController.createJobWithPayment);
router.post('/create-with-package', auth, requireManager, JobController.validateCreateJob, JobController.createJobWithPackage);
router.post('/', auth, requireManager, JobController.validateCreateJob, JobController.createJob);
router.put('/:id', auth, requireManager, JobController.validateUpdateJob, JobController.updateJob);
router.delete('/:id', auth, requireManager, JobController.deleteJob);
router.post('/:id/skills', auth, requireManager, JobController.addSkillToJob);
router.delete('/:id/skills/:skill_id', auth, requireManager, JobController.removeSkillFromJob);

// Generic routes (must be last)
router.get('/:id', JobController.getJob);

module.exports = router;
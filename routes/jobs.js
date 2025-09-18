const express = require('express');
const JobController = require('../controllers/jobController');
const { auth, requireManager } = require('../middleware/auth');

const router = express.Router();

// Public routes
router.get('/', JobController.validateSearchJobs, JobController.getAllJobs);
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

// Debug route for job details (temporary)
router.get('/debug/:id', auth, async (req, res) => {
  try {
    const Job = require('../models/Job');
    const ManagerProfile = require('../models/ManagerProfile');

    const job = await Job.findById(req.params.id);
    const managerProfile = await ManagerProfile.findByUserId(req.user.id);

    res.json({
      job: {
        id: job?._id,
        manager_id: job?.manager_id,
        manager_id_type: typeof job?.manager_id,
        title: job?.title
      },
      user: {
        id: req.user.id,
        role: req.user.role
      },
      manager_profile: {
        id: managerProfile?._id,
        id_type: typeof managerProfile?._id,
        user_id: managerProfile?.user_id
      },
      comparison: {
        job_manager_id_string: job?.manager_id?.toString(),
        user_manager_id_string: managerProfile?._id?.toString(),
        are_equal: job?.manager_id?.toString() === managerProfile?._id?.toString()
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generic routes (must be last)
router.get('/:id', JobController.getJob);

module.exports = router;
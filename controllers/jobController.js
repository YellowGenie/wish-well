const { body, validationResult, query } = require('express-validator');
const Job = require('../models/Job');
const ManagerProfile = require('../models/ManagerProfile');
const Skill = require('../models/Skill');
const Payment = require('../models/Payment');
const stripe = require('../config/stripe');
// MongoDB connection is handled through models

class JobController {
  static validateCreateJob = [
    body('title').trim().isLength({ min: 5, max: 255 }),
    body('description').trim().isLength({ min: 20 }),
    body('budget_type').isIn(['fixed', 'hourly']),
    body('budget_min').isFloat({ min: 0 }),
    body('budget_max').isFloat({ min: 0 }),
    body('category').optional().trim().isLength({ max: 100 }),
    body('experience_level').optional().isIn(['entry', 'intermediate', 'expert']),
    body('deadline').optional().isISO8601(),
    body('skills').optional().isArray()
  ];

  static validateUpdateJob = [
    body('title').optional().trim().isLength({ min: 5, max: 255 }),
    body('description').optional().trim().isLength({ min: 20 }),
    body('budget_type').optional().isIn(['fixed', 'hourly']),
    body('budget_min').optional().isFloat({ min: 0 }),
    body('budget_max').optional().isFloat({ min: 0 }),
    body('category').optional().trim().isLength({ max: 100 }),
    body('experience_level').optional().isIn(['entry', 'intermediate', 'expert']),
    body('deadline').optional().isISO8601(),
    body('status').optional().isIn(['open', 'in_progress', 'completed', 'cancelled'])
  ];

  static validateSearchJobs = [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('budget_min').optional().isFloat({ min: 0 }),
    query('budget_max').optional().isFloat({ min: 0 }),
    query('budget_type').optional().isIn(['fixed', 'hourly']),
    query('experience_level').optional().isIn(['entry', 'intermediate', 'expert']),
    query('sort_by').optional().isIn(['created_at', 'budget_min', 'budget_max', 'title']),
    query('sort_order').optional().isIn(['ASC', 'DESC'])
  ];

  static async createJobWithPayment(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Get manager profile
      const managerProfile = await ManagerProfile.findByUserId(req.user.id);
      if (!managerProfile) {
        return res.status(400).json({ 
          error: 'Manager profile not found',
          message: 'Please complete your manager profile before posting jobs.',
          redirect: '/profile/manager-setup'
        });
      }

      const { payment_intent_id, ...jobData } = req.body;
      
      if (!payment_intent_id) {
        return res.status(400).json({ 
          error: 'Payment required',
          message: 'Payment is required to post a job'
        });
      }

      // Verify payment was successful
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);
        
        if (paymentIntent.status !== 'succeeded') {
          return res.status(400).json({
            error: 'Payment not completed',
            message: 'Please complete the payment before posting the job'
          });
        }

        // Check if payment record exists and is for this user
        const payment = await Payment.findByPaymentIntentId(payment_intent_id);
        if (!payment || payment.user_id !== req.user.id) {
          return res.status(400).json({
            error: 'Invalid payment',
            message: 'Payment verification failed'
          });
        }

        // Update payment record with completed status if not already done
        if (payment.status !== 'completed') {
          await Payment.updateByPaymentIntentId(payment_intent_id, {
            status: 'completed'
          });
        }

      } catch (stripeError) {
        console.error('Stripe payment verification error:', stripeError);
        return res.status(400).json({
          error: 'Payment verification failed',
          message: 'Unable to verify payment status'
        });
      }

      // Create the job
      const { title, description, budget_type, budget_min, budget_max, currency, category, deadline, experience_level, skills } = jobData;

      // Validate budget
      if (budget_max && budget_min && budget_max < budget_min) {
        return res.status(400).json({ error: 'Budget max cannot be less than budget min' });
      }

      const finalJobData = {
        manager_id: managerProfile.id,
        title,
        description,
        budget_type,
        budget_min,
        budget_max,
        currency: currency || 'USD',
        category,
        deadline,
        experience_level: experience_level || 'intermediate',
        skills: skills || []
      };

      const jobId = await Job.create(finalJobData);

      // Update payment record with job_id
      await Payment.updateByPaymentIntentId(payment_intent_id, {
        job_id: jobId,
        description: `Job posting fee for "${title}"`
      });

      res.status(201).json({
        message: 'Job created successfully with payment',
        job_id: jobId,
        payment_confirmed: true
      });

    } catch (error) {
      console.error('Create job with payment error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async createJobWithPackage(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Get manager profile
      const managerProfile = await ManagerProfile.findByUserId(req.user.id);
      if (!managerProfile) {
        return res.status(400).json({ 
          error: 'Manager profile not found',
          message: 'Please complete your manager profile before posting jobs.',
          redirect: '/profile/manager-setup'
        });
      }

      const { title, description, budget_type, budget_min, budget_max, currency, category, deadline, experience_level, skills, is_featured = false } = req.body;

      // Check if user has sufficient credits
      // TODO: Implement credit system with MongoDB models
      const credits = [{
        total_credits: 1000, // Default credits for now
        total_featured_credits: 10
      }];

      const hasCredits = credits[0].total_credits > 0;
      const hasFeaturedCredits = credits[0].total_featured_credits > 0;

      if (!hasCredits) {
        return res.status(400).json({ 
          error: 'Insufficient credits',
          message: 'You need to purchase a package to post jobs.',
          credits_available: credits[0]
        });
      }

      if (is_featured && !hasFeaturedCredits) {
        return res.status(400).json({ 
          error: 'No featured credits',
          message: 'You need featured credits to post a featured job.',
          credits_available: credits[0]
        });
      }

      // Validate budget
      if (budget_max && budget_min && budget_max < budget_min) {
        return res.status(400).json({ error: 'Budget max cannot be less than budget min' });
      }

      const jobData = {
        manager_id: managerProfile.id,
        title,
        description,
        budget_type,
        budget_min,
        budget_max,
        currency: currency || 'USD',
        category,
        deadline,
        experience_level: experience_level || 'intermediate',
        skills: skills || [],
        is_featured: is_featured
      };

      // Create the job
      const jobId = await Job.create(jobData);

      // Use credits from user's package
      await JobController.usePackageCredits(req.user.id, jobId, is_featured);

      res.status(201).json({
        message: 'Job created successfully with package credits',
        job_id: jobId,
        is_featured: is_featured,
        credits_used: {
          regular: 1,
          featured: is_featured ? 1 : 0
        }
      });
    } catch (error) {
      console.error('Create job with package error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Helper method to use package credits
  static async usePackageCredits(userId, jobId, isFeatured = false) {
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Get user's active packages with available credits
      const [packages] = await connection.execute(`
        SELECT id, credits_remaining, featured_credits_remaining
        FROM user_packages 
        WHERE user_id = ? AND status = 'active' 
          AND (expires_at IS NULL OR expires_at > NOW())
          AND credits_remaining > 0
        ORDER BY expires_at ASC, purchased_at ASC
        LIMIT 1
      `, [userId]);

      if (packages.length === 0) {
        throw new Error('No credits available');
      }

      const userPackage = packages[0];

      // Deduct credits
      const newCredits = userPackage.credits_remaining - 1;
      const newFeaturedCredits = isFeatured 
        ? userPackage.featured_credits_remaining - 1 
        : userPackage.featured_credits_remaining;

      await connection.execute(`
        UPDATE user_packages 
        SET credits_remaining = ?, featured_credits_remaining = ?
        WHERE id = ?
      `, [newCredits, newFeaturedCredits, userPackage.id]);

      // Record usage
      await connection.execute(`
        INSERT INTO package_usage (user_package_id, job_id, usage_type)
        VALUES (?, ?, ?)
      `, [userPackage.id, jobId, 'regular_post']);

      if (isFeatured) {
        // Record featured credit usage
        await connection.execute(`
          INSERT INTO package_usage (user_package_id, job_id, usage_type)
          VALUES (?, ?, ?)
        `, [userPackage.id, jobId, 'featured_post']);
      }

      await connection.commit();
      connection.release();
    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }
  }

  static async createJob(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Get manager profile
      console.log('Looking for manager profile for user ID:', req.user.id);
      const managerProfile = await ManagerProfile.findByUserId(req.user.id);
      console.log('Manager profile found:', managerProfile);
      
      if (!managerProfile) {
        console.log('Manager profile not found for user ID:', req.user.id);
        return res.status(400).json({ 
          error: 'Manager profile not found',
          message: 'Please complete your manager profile before posting jobs.',
          redirect: '/profile/manager-setup'
        });
      }

      const { title, description, budget_type, budget_min, budget_max, currency, category, deadline, experience_level, skills } = req.body;

      // Validate budget
      if (budget_max && budget_min && budget_max < budget_min) {
        return res.status(400).json({ error: 'Budget max cannot be less than budget min' });
      }

      const jobData = {
        manager_id: managerProfile.id,
        title,
        description,
        budget_type,
        budget_min,
        budget_max,
        currency: currency || 'USD',
        category,
        deadline,
        experience_level: experience_level || 'intermediate',
        skills: skills || []
      };

      console.log('Creating job with data:', jobData);
      const jobId = await Job.create(jobData);
      console.log('Job created successfully with ID:', jobId);

      res.status(201).json({
        message: 'Job created successfully',
        job_id: jobId
      });
    } catch (error) {
      console.error('Create job error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getJob(req, res) {
    try {
      const { id } = req.params;
      const job = await Job.findById(id);
      
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      res.json({ job });
    } catch (error) {
      console.error('Get job error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async updateJob(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const job = await Job.findById(id);
      
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      // Check if user owns this job
      const managerProfile = await ManagerProfile.findByUserId(req.user.id);
      if (!managerProfile || job.manager_id !== managerProfile.id) {
        return res.status(403).json({ error: 'Not authorized to update this job' });
      }

      const { budget_min, budget_max } = req.body;
      
      // Validate budget if both are provided
      if (budget_max && budget_min && budget_max < budget_min) {
        return res.status(400).json({ error: 'Budget max cannot be less than budget min' });
      }

      const updated = await Job.update(id, req.body);
      
      if (!updated) {
        return res.status(400).json({ error: 'No changes made' });
      }

      res.json({ message: 'Job updated successfully' });
    } catch (error) {
      console.error('Update job error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async deleteJob(req, res) {
    try {
      const { id } = req.params;
      const job = await Job.findById(id);
      
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      // Check if user owns this job
      const managerProfile = await ManagerProfile.findByUserId(req.user.id);
      if (!managerProfile || job.manager_id !== managerProfile.id) {
        return res.status(403).json({ error: 'Not authorized to delete this job' });
      }

      const deleted = await Job.delete(id);
      
      if (!deleted) {
        return res.status(400).json({ error: 'Failed to delete job' });
      }

      res.json({ message: 'Job deleted successfully' });
    } catch (error) {
      console.error('Delete job error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async searchJobs(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        category,
        budget_min,
        budget_max,
        budget_type,
        experience_level,
        skills,
        search_query,
        status = 'open',
        page = 1,
        limit = 20,
        sort_by = 'created_at',
        sort_order = 'DESC'
      } = req.query;

      const searchParams = {
        category,
        budget_min: budget_min ? parseFloat(budget_min) : null,
        budget_max: budget_max ? parseFloat(budget_max) : null,
        budget_type,
        experience_level,
        skills: skills ? (Array.isArray(skills) ? skills : skills.split(',')) : null,
        search_query,
        status,
        page: parseInt(page),
        limit: parseInt(limit),
        sort_by,
        sort_order
      };

      const result = await Job.search(searchParams);

      res.json(result);
    } catch (error) {
      console.error('Search jobs error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getMyJobs(req, res) {
    try {
      const { page = 1, limit = 20 } = req.query;

      // Get manager profile
      const managerProfile = await ManagerProfile.findByUserId(req.user.id);
      if (!managerProfile) {
        // Return empty jobs array if manager profile doesn't exist yet
        return res.json({ 
          jobs: [], 
          total: 0, 
          page: parseInt(page), 
          limit: parseInt(limit),
          message: 'No manager profile found. Please complete your manager profile to post jobs.'
        });
      }

      const result = await Job.getJobsByManager(
        managerProfile.id,
        parseInt(page),
        parseInt(limit)
      );

      res.json(result);
    } catch (error) {
      console.error('Get my jobs error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async addSkillToJob(req, res) {
    try {
      const { id } = req.params;
      const { skill_name, is_required = true } = req.body;

      if (!skill_name) {
        return res.status(400).json({ error: 'Skill name is required' });
      }

      const job = await Job.findById(id);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      // Check if user owns this job
      const managerProfile = await ManagerProfile.findByUserId(req.user.id);
      if (!managerProfile || job.manager_id !== managerProfile.id) {
        return res.status(403).json({ error: 'Not authorized to modify this job' });
      }

      // Find or create skill
      let skill = await Skill.findByName(skill_name);
      if (!skill) {
        const skillId = await Skill.create({ name: skill_name, category: null });
        skill = { id: skillId };
      }

      const result = await Job.addSkill(id, skill.id, is_required);
      
      if (result === null) {
        return res.status(400).json({ error: 'Skill already added to job' });
      }

      res.json({ message: 'Skill added to job successfully' });
    } catch (error) {
      console.error('Add skill to job error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async removeSkillFromJob(req, res) {
    try {
      const { id, skill_id } = req.params;

      const job = await Job.findById(id);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      // Check if user owns this job
      const managerProfile = await ManagerProfile.findByUserId(req.user.id);
      if (!managerProfile || job.manager_id !== managerProfile.id) {
        return res.status(403).json({ error: 'Not authorized to modify this job' });
      }

      const removed = await Job.removeSkill(id, skill_id);
      
      if (!removed) {
        return res.status(404).json({ error: 'Skill not found in job' });
      }

      res.json({ message: 'Skill removed from job successfully' });
    } catch (error) {
      console.error('Remove skill from job error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

module.exports = JobController;
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
        manager_id: managerProfile._id,
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

      // Check if user has sufficient credits using package controller
      const PackageController = require('./packageController');
      const hasActivePackage = await PackageController.checkUserHasActivePackage(req.user.id);

      if (!hasActivePackage) {
        return res.status(400).json({
          error: 'No active package',
          message: 'You need to purchase a package to post jobs.',
          credits_available: { total_credits: 0, total_featured_credits: 0 }
        });
      }

      // For simulation purposes, we'll assume the package has credits
      const hasCredits = true; // User has active package
      const hasFeaturedCredits = true; // Package includes featured credits

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
        manager_id: managerProfile._id,
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
    try {
      // For simulation purposes, we'll just log the credit usage
      // In a real implementation, this would update user package credits in MongoDB
      console.log(`Using package credits for user ${userId}, job ${jobId}, featured: ${isFeatured}`);

      // TODO: Implement actual credit deduction from user's active packages
      // This would involve:
      // 1. Finding user's active packages
      // 2. Deducting 1 regular credit and 1 featured credit if featured
      // 3. Updating the package record

      return {
        success: true,
        credits_used: {
          regular: 1,
          featured: isFeatured ? 1 : 0
        }
      };
    } catch (error) {
      console.error('Error using package credits:', error);
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
        manager_id: managerProfile._id,
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

      // Check if the job is visible to the requesting user
      if (req.user) {
        const userRole = req.user.role;

        // If user is talent, check if job is approved and not hidden from talent
        if (userRole === 'talent') {
          if (job.admin_status !== 'approved' || job.is_hidden_from_talent) {
            return res.status(404).json({ error: 'Job not found' });
          }
        }

        // If user is manager, check if job is theirs or if it's not hidden from managers
        if (userRole === 'manager') {
          const ManagerProfile = require('../models/ManagerProfile');
          const managerProfile = await ManagerProfile.findByUserId(req.user.id);

          if (managerProfile && job.manager_id.toString() === managerProfile._id.toString()) {
            // Manager can see their own jobs regardless of status
          } else if (job.is_hidden_from_managers || job.admin_status !== 'approved') {
            // Other managers can only see approved, non-hidden jobs
            return res.status(404).json({ error: 'Job not found' });
          }
        }

        // Admins can see all jobs
      } else {
        // Non-authenticated users can only see approved, non-hidden jobs
        if (job.admin_status !== 'approved' || job.is_hidden_from_talent) {
          return res.status(404).json({ error: 'Job not found' });
        }
      }

      // Format job data with company information
      const formattedJob = {
        id: job._id.toString(),
        title: job.title,
        description: job.description,
        budget_type: job.budget_type,
        budget_min: job.budget_min,
        budget_max: job.budget_max,
        currency: job.currency,
        category: job.category,
        status: job.status || 'open',
        experience_level: job.experience_level,
        created_at: job.created_at,
        updated_at: job.updated_at,
        skills: job.skills?.map(s => s.skill_id?.name).filter(Boolean) || [],
        // Company information from manager profile
        company_name: job.manager_id?.company_name || 'Company Name Not Set',
        location: job.manager_id?.location || 'Location Not Set',
        company_description: job.manager_id?.company_description || '',
        company_size: job.manager_id?.company_size || null,
        industry: job.manager_id?.industry || '',
        // Manager info for fallback
        manager: {
          first_name: job.manager_id?.user_id?.first_name || '',
          last_name: job.manager_id?.user_id?.last_name || ''
        }
      };

      res.json({ job: formattedJob });
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

      console.log(`Debug updateJob: User ${req.user.id} trying to update job ${id}`);
      console.log(`Debug updateJob: Job manager_id type:`, typeof job.manager_id);
      console.log(`Debug updateJob: User manager profile _id: ${managerProfile?._id}`);

      // Handle case where manager_id might be populated object or just ObjectId
      const jobManagerId = job.manager_id._id ? job.manager_id._id.toString() : job.manager_id.toString();
      const userManagerId = managerProfile._id.toString();

      console.log(`Debug updateJob: Comparing jobManagerId (${jobManagerId}) with userManagerId (${userManagerId})`);

      if (!managerProfile || jobManagerId !== userManagerId) {
        console.log(`Debug updateJob: Authorization failed`);
        return res.status(403).json({ error: 'Not authorized to update this job' });
      }

      const { budget_min, budget_max } = req.body;
      
      // Validate budget if both are provided
      if (budget_max && budget_min && budget_max < budget_min) {
        return res.status(400).json({ error: 'Budget max cannot be less than budget min' });
      }

      // Handle skills separately since they need special processing
      const { skills, ...updateData } = req.body;

      // Update basic job data first
      const updated = await Job.updateJob(id, updateData);

      // Handle skills update if provided
      if (skills && Array.isArray(skills)) {
        const Skill = require('../models/Skill');
        const job = await Job.findById(id);

        // Clear existing skills
        job.skills = [];

        // Add new skills
        for (const skillName of skills) {
          if (!skillName || skillName.trim() === '') continue;

          // Find or create skill
          let skill = await Skill.findOne({ name: skillName.trim() }).collation({ locale: 'en', strength: 2 });

          if (!skill) {
            const skillId = await Skill.create({ name: skillName.trim() });
            skill = { _id: skillId };
          }

          job.skills.push({ skill_id: skill._id, is_required: true });
        }

        await job.save();
      }
      
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
      console.log(`Debug deleteJob: Attempting to delete job ${id} for user ${req.user.id}`);

      const job = await Job.findById(id);

      if (!job) {
        console.log(`Debug deleteJob: Job ${id} not found`);
        return res.status(404).json({ error: 'Job not found' });
      }

      console.log(`Debug deleteJob: Found job ${id}, manager_id: ${job.manager_id}`);

      // Check if user owns this job
      const managerProfile = await ManagerProfile.findByUserId(req.user.id);
      console.log(`Debug deleteJob: Manager profile found:`, managerProfile ? `id: ${managerProfile.id}` : 'null');

      if (!managerProfile) {
        console.log(`Debug deleteJob: No manager profile found for user ${req.user.id}`);
        return res.status(403).json({ error: 'Manager profile not found' });
      }

      // Handle case where manager_id might be populated object or just ObjectId
      const jobManagerId = job.manager_id._id ? job.manager_id._id.toString() : job.manager_id.toString();
      const userManagerId = managerProfile._id.toString();

      console.log(`Debug deleteJob: Comparing jobManagerId (${jobManagerId}) with userManagerId (${userManagerId})`);
      console.log(`Debug deleteJob: Types - jobManagerId: ${typeof jobManagerId}, userManagerId: ${typeof userManagerId}`);

      if (jobManagerId !== userManagerId) {
        console.log(`Debug deleteJob: Authorization failed - jobManagerId (${jobManagerId}) !== userManagerId (${userManagerId})`);
        return res.status(403).json({ error: 'Not authorized to delete this job' });
      }

      console.log(`Debug deleteJob: Authorization passed, proceeding with deletion`);
      const deleted = await Job.deleteJob(id);

      if (!deleted) {
        console.log(`Debug deleteJob: Delete operation failed for job ${id}`);
        return res.status(400).json({ error: 'Failed to delete job' });
      }

      console.log(`Debug deleteJob: Job ${id} deleted successfully`);
      res.json({ message: 'Job deleted successfully' });
    } catch (error) {
      console.error('Delete job error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getAllJobs(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        sort_by = 'created_at',
        sort_order = 'DESC'
      } = req.query;

      const result = await Job.getAllJobsPaginated({
        page: parseInt(page),
        limit: parseInt(limit),
        sort_by,
        sort_order
      });

      // Transform jobs to match frontend format
      const transformedJobs = result.jobs.map(job => ({
        id: job._id.toString(),
        title: job.title,
        description: job.description,
        company_name: job.manager_id?.user_id?.first_name && job.manager_id?.user_id?.last_name
          ? `${job.manager_id.user_id.first_name} ${job.manager_id.user_id.last_name}`
          : 'Unknown Company',
        location: job.location || 'Remote',
        job_type: 'contract', // Default job type
        experience_level: job.experience_level,
        budget_min: job.budget_min,
        budget_max: job.budget_max,
        currency: job.currency,
        skills: job.skills.map(s => s.skill_id?.name).filter(Boolean),
        featured: job.featured || false,
        status: job.status,
        created_at: job.created_at,
        applicant_count: 0 // Default for now
      }));

      res.json({
        jobs: transformedJobs,
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
        hasNextPage: result.hasNextPage,
        hasPrevPage: result.hasPrevPage
      });
    } catch (error) {
      console.error('Get all jobs error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getFeaturedJobs(req, res) {
    try {
      const { limit = 10 } = req.query;

      const jobs = await Job.getFeaturedJobs(parseInt(limit));

      // Transform jobs to match frontend format
      const transformedJobs = jobs.map(job => ({
        id: job._id.toString(),
        title: job.title,
        description: job.description,
        company_name: job.manager_id?.user_id?.first_name && job.manager_id?.user_id?.last_name
          ? `${job.manager_id.user_id.first_name} ${job.manager_id.user_id.last_name}`
          : 'Unknown Company',
        location: job.location || 'Remote',
        job_type: 'contract',
        experience_level: job.experience_level,
        budget_min: job.budget_min,
        budget_max: job.budget_max,
        currency: job.currency,
        skills: job.skills.map(s => s.skill_id?.name).filter(Boolean),
        featured: true,
        status: job.status,
        created_at: job.created_at,
        applicant_count: 0
      }));

      res.json({ jobs: transformedJobs });
    } catch (error) {
      console.error('Get featured jobs error:', error);
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

      const result = await Job.searchJobs(searchParams);

      // Transform jobs to match frontend format
      const transformedJobs = result.jobs.map(job => ({
        id: job._id.toString(),
        title: job.title,
        description: job.description,
        company_name: job.manager_id?.user_id?.first_name && job.manager_id?.user_id?.last_name
          ? `${job.manager_id.user_id.first_name} ${job.manager_id.user_id.last_name}`
          : 'Unknown Company',
        location: job.location || 'Remote',
        job_type: 'contract',
        experience_level: job.experience_level,
        budget_min: job.budget_min,
        budget_max: job.budget_max,
        currency: job.currency,
        skills: job.skills.map(s => s.skill_id?.name).filter(Boolean),
        featured: job.featured || false,
        status: job.status,
        created_at: job.created_at,
        applicant_count: 0
      }));

      res.json({
        jobs: transformedJobs,
        total: result.total,
        page: result.page,
        totalPages: result.totalPages
      });
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
        managerProfile._id,
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

      // Handle case where manager_id might be populated object or just ObjectId
      const jobManagerId = job.manager_id._id ? job.manager_id._id.toString() : job.manager_id.toString();
      const userManagerId = managerProfile._id.toString();

      console.log(`Debug job operation: User ${req.user.id} trying to modify job ${id}`);
      console.log(`Debug job operation: Comparing jobManagerId (${jobManagerId}) with userManagerId (${userManagerId})`);

      if (!managerProfile || jobManagerId !== userManagerId) {
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

      // Handle case where manager_id might be populated object or just ObjectId
      const jobManagerId = job.manager_id._id ? job.manager_id._id.toString() : job.manager_id.toString();
      const userManagerId = managerProfile._id.toString();

      console.log(`Debug job operation: User ${req.user.id} trying to modify job ${id}`);
      console.log(`Debug job operation: Comparing jobManagerId (${jobManagerId}) with userManagerId (${userManagerId})`);

      if (!managerProfile || jobManagerId !== userManagerId) {
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

  static async getAllJobs(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { page = 1, limit = 20, sort_by = 'created_at', sort_order = 'DESC' } = req.query;

      const result = await Job.getAllJobsPaginated({
        page: parseInt(page),
        limit: parseInt(limit),
        sort_by,
        sort_order
      });

      res.json(result);
    } catch (error) {
      console.error('Get all jobs error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getFeaturedJobs(req, res) {
    try {
      const { limit = 10 } = req.query;

      const jobs = await Job.getFeaturedJobs(parseInt(limit));

      res.json({ jobs });
    } catch (error) {
      console.error('Get featured jobs error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

module.exports = JobController;
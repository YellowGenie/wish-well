const { mongoose } = require('../config/mongodb');

// Job Schema
const jobSchema = new mongoose.Schema({
  manager_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManagerProfile',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  budget_type: {
    type: String,
    enum: ['fixed', 'hourly'],
    required: true
  },
  budget_min: {
    type: Number,
    min: 0
  },
  budget_max: {
    type: Number,
    min: 0
  },
  currency: {
    type: String,
    default: 'USD'
  },
  status: {
    type: String,
    enum: ['open', 'in_progress', 'completed', 'cancelled'],
    default: 'open'
  },
  category: {
    type: String,
    trim: true
  },
  deadline: {
    type: Date
  },
  experience_level: {
    type: String,
    enum: ['entry', 'intermediate', 'expert'],
    default: 'intermediate'
  },
  featured: {
    type: Boolean,
    default: false
  },
  location: {
    type: String,
    default: 'Remote'
  },
  admin_status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'inappropriate', 'hidden'],
    default: 'pending'
  },
  admin_notes: {
    type: String,
    trim: true
  },
  admin_reviewed_at: {
    type: Date
  },
  admin_reviewed_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  is_hidden_from_talent: {
    type: Boolean,
    default: false
  },
  is_hidden_from_managers: {
    type: Boolean,
    default: false
  },
  auto_approved: {
    type: Boolean,
    default: false
  },
  skills: [{
    skill_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Skill'
    },
    is_required: {
      type: Boolean,
      default: true
    }
  }]
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

// Indexes
jobSchema.index({ manager_id: 1 });
jobSchema.index({ status: 1 });
jobSchema.index({ admin_status: 1 });
jobSchema.index({ category: 1 });
jobSchema.index({ budget_type: 1 });
jobSchema.index({ created_at: -1 });
jobSchema.index({ admin_reviewed_at: -1 });
jobSchema.index({ is_hidden_from_talent: 1 });
jobSchema.index({ is_hidden_from_managers: 1 });
jobSchema.index({ title: 'text', description: 'text' });

// Static methods
jobSchema.statics.create = async function({ manager_id, title, description, budget_type, budget_min, budget_max, currency, category, deadline, experience_level, skills }) {
  const session = await mongoose.startSession();
  
  try {
    await session.startTransaction();

    const job = new this({
      manager_id, title, description, budget_type, budget_min, budget_max, 
      currency, category, deadline, experience_level
    });

    const savedJob = await job.save({ session });
    const jobId = savedJob._id;

    // Add skills if provided
    if (skills && skills.length > 0) {
      const Skill = mongoose.model('Skill');
      for (const skillName of skills) {
        if (!skillName || skillName.trim() === '') continue;
        
        // Use case-insensitive exact match instead of regex to avoid special character issues
        let skill = await Skill.findOne({ name: skillName.trim() }).collation({ locale: 'en', strength: 2 }).session(session);
        
        if (!skill) {
          skill = await Skill.create([{ name: skillName.trim() }], { session });
          skill = skill[0];
        }
        
        savedJob.skills.push({ skill_id: skill._id, is_required: true });
      }
      await savedJob.save({ session });
    }

    await session.commitTransaction();
    return jobId;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

jobSchema.statics.findById = async function(id) {
  return await this.findOne({ _id: id })
    .populate({
      path: 'manager_id',
      populate: {
        path: 'user_id',
        select: 'first_name last_name email'
      }
    })
    .populate('skills.skill_id', 'name');
};

jobSchema.statics.updateJob = async function(id, updates) {
  const result = await this.updateOne({ _id: id }, { $set: updates });
  return result.modifiedCount > 0;
};

jobSchema.statics.deleteJob = async function(id) {
  const result = await this.deleteOne({ _id: id });
  return result.deletedCount > 0;
};

jobSchema.statics.searchJobs = async function({
  skills = [], budget_min, budget_max, budget_type, category,
  experience_level, search_query, sort_by = 'created_at',
  sort_order = 'DESC', page = 1, limit = 20
}) {
  try {
    const skip = (page - 1) * limit;
    let query = {
      status: 'open',
      admin_status: 'approved',
      is_hidden_from_talent: { $ne: true }
    };

    // Build query conditions
    if (budget_min) query.budget_min = { $gte: budget_min };
    if (budget_max) query.budget_max = { $lte: budget_max };
    if (budget_type) query.budget_type = budget_type;
    if (category) query.category = { $regex: new RegExp(category, 'i') };
    if (experience_level) query.experience_level = experience_level;

    // Text search
    if (search_query) {
      query.$text = { $search: search_query };
    }

    let jobs = await this.find(query)
      .populate('manager_id')
      .populate('skills.skill_id')
      .sort({ [sort_by]: sort_order.toLowerCase() === 'asc' ? 1 : -1 })
      .skip(skip)
      .limit(limit);

    const total = await this.countDocuments(query);

    return {
      jobs,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  } catch (error) {
    console.error('Error searching jobs:', error);
    throw error;
  }
};

jobSchema.statics.getFeaturedJobs = async function(limit = 10) {
  try {
    const jobs = await this.find({
      status: 'open',
      featured: true,
      admin_status: 'approved',
      is_hidden_from_talent: { $ne: true }
    })
      .populate('manager_id')
      .populate('skills.skill_id')
      .sort({ created_at: -1 })
      .limit(limit);

    return jobs;
  } catch (error) {
    console.error('Error fetching featured jobs:', error);
    throw error;
  }
};

jobSchema.statics.getAllJobsPaginated = async function({
  page = 1,
  limit = 20,
  sort_by = 'created_at',
  sort_order = 'DESC'
}) {
  try {
    const skip = (page - 1) * limit;
    let query = {
      status: 'open',
      admin_status: 'approved',
      is_hidden_from_talent: { $ne: true }
    };

    let jobs = await this.find(query)
      .populate({
        path: 'manager_id',
        populate: {
          path: 'user_id',
          select: 'first_name last_name email'
        }
      })
      .populate('skills.skill_id', 'name')
      .sort({ [sort_by]: sort_order.toLowerCase() === 'asc' ? 1 : -1 })
      .skip(skip)
      .limit(limit);

    const total = await this.countDocuments(query);

    // Format jobs for frontend
    const formattedJobs = jobs.map(job => ({
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
      location: job.location || 'Remote',
      skills: job.skills?.map(s => s.skill_id?.name).filter(Boolean) || [],
      company_name: job.manager_id?.company_name ||
        (job.manager_id?.user_id ? `${job.manager_id.user_id.first_name} ${job.manager_id.user_id.last_name}` : 'Company Name Not Set'),
      applicant_count: 0, // TODO: Get real count from proposals
      featured: job.featured || false,
      job_type: job.budget_type === 'hourly' ? 'freelance' : 'contract' // Map to frontend expected values
    }));

    return {
      jobs: formattedJobs,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1
    };
  } catch (error) {
    console.error('Error fetching jobs:', error);
    throw error;
  }
};

jobSchema.statics.getJobsByManager = async function(manager_id, page = 1, limit = 20) {
  try {
    const skip = (page - 1) * limit;

    // Get jobs for this manager (excluding ones hidden from managers)
    const jobs = await this.find({
      manager_id,
      is_hidden_from_managers: { $ne: true }
    })
      .populate('manager_id')
      .populate('skills.skill_id', 'name')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await this.countDocuments({
      manager_id,
      is_hidden_from_managers: { $ne: true }
    });

    // Format jobs for frontend
    const formattedJobs = jobs.map(job => ({
      id: job._id.toString(),
      title: job.title,
      description: job.description,
      budget_type: job.budget_type,
      budget_min: job.budget_min,
      budget_max: job.budget_max,
      currency: job.currency,
      category: job.category,
      status: job.status || 'open',
      admin_status: job.admin_status || 'pending',
      admin_notes: job.admin_notes,
      is_hidden_from_talent: job.is_hidden_from_talent || false,
      is_hidden_from_managers: job.is_hidden_from_managers || false,
      experience_level: job.experience_level,
      created_at: job.created_at,
      updated_at: job.updated_at,
      skills: job.skills?.map(s => s.skill_id?.name).filter(Boolean) || [],
      applications_count: 0, // TODO: Get real count from proposals
      new_proposals_count: 0 // TODO: Get real count from unread proposals
    }));

    return {
      jobs: formattedJobs,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1
    };
  } catch (error) {
    console.error('Error fetching jobs by manager:', error);
    throw error;
  }
};

// Admin methods
jobSchema.statics.getAdminJobs = async function({
  page = 1, limit = 20, admin_status, search_query, sort_by = 'created_at',
  sort_order = 'DESC', company_name, manager_name, date_range
}) {
  try {
    const skip = (page - 1) * limit;
    let query = {};

    // Build query conditions
    if (admin_status && admin_status !== 'all') {
      if (admin_status === 'active') {
        query.admin_status = 'approved';
        query.status = 'open';
      } else if (admin_status === 'expired') {
        query.$or = [
          { status: { $in: ['completed', 'cancelled'] } },
          { deadline: { $lt: new Date() } }
        ];
      } else if (admin_status === 'rejected_inappropriate') {
        query.admin_status = { $in: ['rejected', 'inappropriate'] };
      } else {
        query.admin_status = admin_status;
      }
    }

    // Text search
    if (search_query) {
      query.$text = { $search: search_query };
    }

    // Date range filtering
    if (date_range && date_range !== 'all') {
      const now = new Date();
      let startDate;

      switch (date_range) {
        case '7d':
          startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(now - 90 * 24 * 60 * 60 * 1000);
          break;
        case '1y':
          startDate = new Date(now - 365 * 24 * 60 * 60 * 1000);
          break;
      }

      if (startDate) {
        query.created_at = { $gte: startDate };
      }
    }

    // Get jobs with populated data
    let jobs = await this.find(query)
      .populate({
        path: 'manager_id',
        populate: {
          path: 'user_id',
          select: 'first_name last_name email'
        }
      })
      .populate('skills.skill_id', 'name')
      .populate('admin_reviewed_by', 'first_name last_name email')
      .sort({ [sort_by]: sort_order.toLowerCase() === 'asc' ? 1 : -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Filter by company/manager name if provided
    if (company_name || manager_name) {
      jobs = jobs.filter(job => {
        const companyMatch = !company_name ||
          (job.manager_id?.company_name?.toLowerCase().includes(company_name.toLowerCase()) ||
           `${job.manager_id?.user_id?.first_name} ${job.manager_id?.user_id?.last_name}`.toLowerCase().includes(company_name.toLowerCase()));

        const managerMatch = !manager_name ||
          `${job.manager_id?.user_id?.first_name} ${job.manager_id?.user_id?.last_name}`.toLowerCase().includes(manager_name.toLowerCase());

        return companyMatch && managerMatch;
      });
    }

    const total = await this.countDocuments(query);

    // Get application counts for each job
    const Proposal = mongoose.model('Proposal');
    const jobIds = jobs.map(job => job._id);
    const applicationCounts = await Proposal.aggregate([
      { $match: { job_id: { $in: jobIds } } },
      { $group: { _id: '$job_id', count: { $sum: 1 } } }
    ]);

    const applicationCountMap = applicationCounts.reduce((acc, item) => {
      acc[item._id.toString()] = item.count;
      return acc;
    }, {});

    // Format jobs for frontend
    const formattedJobs = jobs.map(job => ({
      id: job._id.toString(),
      title: job.title,
      description: job.description,
      budget_type: job.budget_type,
      budget_min: job.budget_min,
      budget_max: job.budget_max,
      currency: job.currency,
      category: job.category,
      status: job.status,
      admin_status: job.admin_status,
      admin_notes: job.admin_notes,
      admin_reviewed_at: job.admin_reviewed_at,
      admin_reviewed_by: job.admin_reviewed_by,
      experience_level: job.experience_level,
      created_at: job.created_at,
      updated_at: job.updated_at,
      deadline: job.deadline,
      location: job.location,
      featured: job.featured,
      is_hidden_from_talent: job.is_hidden_from_talent,
      is_hidden_from_managers: job.is_hidden_from_managers,
      auto_approved: job.auto_approved,
      skills: job.skills?.map(s => s.skill_id?.name).filter(Boolean) || [],
      company_name: job.manager_id?.company_name ||
        (job.manager_id?.user_id ? `${job.manager_id.user_id.first_name} ${job.manager_id.user_id.last_name}` : 'Company Name Not Set'),
      manager_name: job.manager_id?.user_id ? `${job.manager_id.user_id.first_name} ${job.manager_id.user_id.last_name}` : 'Unknown Manager',
      manager_email: job.manager_id?.user_id?.email || 'Unknown Email',
      application_count: applicationCountMap[job._id.toString()] || 0,
      // Mock analytics data - can be replaced with real analytics later
      analytics: {
        views: Math.floor(Math.random() * 2000) + 100,
        clicks: Math.floor(Math.random() * 200) + 10,
        applications: applicationCountMap[job._id.toString()] || 0,
        declined: Math.floor((applicationCountMap[job._id.toString()] || 0) * 0.6),
        successful: Math.floor((applicationCountMap[job._id.toString()] || 0) * 0.1),
        conversionRate: parseFloat(((applicationCountMap[job._id.toString()] || 0) / 100).toFixed(1))
      }
    }));

    return {
      jobs: formattedJobs,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1
    };
  } catch (error) {
    console.error('Error fetching admin jobs:', error);
    throw error;
  }
};

jobSchema.statics.updateAdminStatus = async function(jobId, { admin_status, admin_notes, admin_reviewed_by }) {
  try {
    const updateData = {
      admin_status,
      admin_reviewed_at: new Date(),
      admin_reviewed_by
    };

    if (admin_notes !== undefined) {
      updateData.admin_notes = admin_notes;
    }

    // Set visibility based on admin status
    if (admin_status === 'approved') {
      updateData.is_hidden_from_talent = false;
      updateData.is_hidden_from_managers = false;
    } else if (admin_status === 'hidden') {
      updateData.is_hidden_from_talent = true;
      updateData.is_hidden_from_managers = true;
    } else if (admin_status === 'rejected' || admin_status === 'inappropriate') {
      updateData.is_hidden_from_talent = true;
      updateData.is_hidden_from_managers = false; // Managers can still see rejected jobs
    }

    const result = await this.updateOne({ _id: jobId }, { $set: updateData });
    return result.modifiedCount > 0;
  } catch (error) {
    console.error('Error updating job admin status:', error);
    throw error;
  }
};

jobSchema.statics.bulkUpdateAdminStatus = async function(jobIds, { admin_status, admin_notes, admin_reviewed_by }) {
  try {
    const updateData = {
      admin_status,
      admin_reviewed_at: new Date(),
      admin_reviewed_by
    };

    if (admin_notes !== undefined) {
      updateData.admin_notes = admin_notes;
    }

    // Set visibility based on admin status
    if (admin_status === 'approved') {
      updateData.is_hidden_from_talent = false;
      updateData.is_hidden_from_managers = false;
    } else if (admin_status === 'hidden') {
      updateData.is_hidden_from_talent = true;
      updateData.is_hidden_from_managers = true;
    } else if (admin_status === 'rejected' || admin_status === 'inappropriate') {
      updateData.is_hidden_from_talent = true;
      updateData.is_hidden_from_managers = false;
    }

    const result = await this.updateMany({ _id: { $in: jobIds } }, { $set: updateData });
    return result.modifiedCount;
  } catch (error) {
    console.error('Error bulk updating job admin status:', error);
    throw error;
  }
};

jobSchema.statics.getJobWithApplications = async function(jobId) {
  try {
    const job = await this.findById(jobId)
      .populate({
        path: 'manager_id',
        populate: {
          path: 'user_id',
          select: 'first_name last_name email'
        }
      })
      .populate('skills.skill_id', 'name')
      .populate('admin_reviewed_by', 'first_name last_name email');

    if (!job) {
      throw new Error('Job not found');
    }

    // Get applications (proposals) for this job
    const Proposal = mongoose.model('Proposal');
    const applications = await Proposal.find({ job_id: jobId })
      .populate({
        path: 'talent_id',
        populate: {
          path: 'user_id',
          select: 'first_name last_name email'
        }
      })
      .sort({ created_at: -1 });

    const formattedApplications = applications.map(app => ({
      id: app._id.toString(),
      cover_letter: app.cover_letter,
      bid_amount: app.bid_amount,
      timeline_days: app.timeline_days,
      status: app.status,
      applied_at: app.created_at,
      updated_at: app.updated_at,
      talent: {
        id: app.talent_id._id.toString(),
        name: app.talent_id.user_id ? `${app.talent_id.user_id.first_name} ${app.talent_id.user_id.last_name}` : 'Unknown Talent',
        email: app.talent_id.user_id?.email || 'Unknown Email',
        title: app.talent_id.title || 'No Title',
        hourly_rate: app.talent_id.hourly_rate || 0
      }
    }));

    return {
      job: {
        id: job._id.toString(),
        title: job.title,
        description: job.description,
        budget_type: job.budget_type,
        budget_min: job.budget_min,
        budget_max: job.budget_max,
        currency: job.currency,
        category: job.category,
        status: job.status,
        admin_status: job.admin_status,
        admin_notes: job.admin_notes,
        admin_reviewed_at: job.admin_reviewed_at,
        admin_reviewed_by: job.admin_reviewed_by,
        experience_level: job.experience_level,
        created_at: job.created_at,
        updated_at: job.updated_at,
        deadline: job.deadline,
        location: job.location,
        featured: job.featured,
        skills: job.skills?.map(s => s.skill_id?.name).filter(Boolean) || [],
        company_name: job.manager_id?.company_name ||
          (job.manager_id?.user_id ? `${job.manager_id.user_id.first_name} ${job.manager_id.user_id.last_name}` : 'Company Name Not Set'),
        manager_name: job.manager_id?.user_id ? `${job.manager_id.user_id.first_name} ${job.manager_id.user_id.last_name}` : 'Unknown Manager',
        manager_email: job.manager_id?.user_id?.email || 'Unknown Email'
      },
      applications: formattedApplications
    };
  } catch (error) {
    console.error('Error getting job with applications:', error);
    throw error;
  }
};

const Job = mongoose.model('Job', jobSchema);

module.exports = Job;
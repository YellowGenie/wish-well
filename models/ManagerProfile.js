const { mongoose } = require('../config/mongodb');

// ManagerProfile Schema
const managerProfileSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  company_name: {
    type: String,
    trim: true
  },
  company_description: {
    type: String,
    trim: true
  },
  company_size: {
    type: String,
    enum: ['1-10', '11-50', '51-200', '201-500', '500+']
  },
  industry: {
    type: String,
    trim: true
  },
  location: {
    type: String,
    trim: true
  }
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

// Indexes
managerProfileSchema.index({ user_id: 1 });
managerProfileSchema.index({ industry: 1 });
managerProfileSchema.index({ company_size: 1 });

// Static methods
managerProfileSchema.statics.create = async function({ user_id, company_name, company_description, company_size, industry, location }) {
  const profile = new this({ user_id, company_name, company_description, company_size, industry, location });
  const savedProfile = await profile.save();
  return savedProfile._id;
};

managerProfileSchema.statics.findByUserId = async function(user_id) {
  return await this.findOne({ user_id })
    .populate('user_id', 'first_name last_name email');
};

managerProfileSchema.statics.findById = async function(id) {
  return await this.findOne({ _id: id })
    .populate('user_id', 'first_name last_name email');
};

managerProfileSchema.statics.update = async function(user_id, updates) {
  const result = await this.updateOne({ user_id }, { $set: updates });
  return result.modifiedCount > 0;
};

managerProfileSchema.statics.getJobsPosted = async function(manager_id, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  
  const Job = mongoose.model('Job');
  const Proposal = mongoose.model('Proposal');
  
  const jobs = await Job.aggregate([
    { $match: { manager_id: manager_id } },
    {
      $lookup: {
        from: 'proposals',
        localField: '_id',
        foreignField: 'job_id',
        as: 'proposals'
      }
    },
    {
      $addFields: {
        proposal_count: { $size: '$proposals' }
      }
    },
    { $sort: { created_at: -1 } },
    { $skip: skip },
    { $limit: limit }
  ]);
  
  const total = await Job.countDocuments({ manager_id });
  
  return {
    jobs: jobs.map(job => ({
      ...job,
      id: job._id
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
};

managerProfileSchema.statics.getDashboardStats = async function(manager_id) {
  const Job = mongoose.model('Job');
  const Proposal = mongoose.model('Proposal');
  const Payment = mongoose.model('Payment');
  
  // Get job stats
  const jobStats = await Job.aggregate([
    { $match: { manager_id: manager_id } },
    {
      $group: {
        _id: null,
        jobs_posted: { $sum: 1 },
        open_jobs: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } },
        in_progress_jobs: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
        completed_jobs: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }
      }
    }
  ]);
  
  // Get application stats
  const applicationStats = await Job.aggregate([
    { $match: { manager_id: manager_id } },
    {
      $lookup: {
        from: 'proposals',
        localField: '_id',
        foreignField: 'job_id',
        as: 'proposals'
      }
    },
    {
      $group: {
        _id: null,
        applications_received: { $sum: { $size: '$proposals' } },
        pending_applications: {
          $sum: {
            $size: {
              $filter: {
                input: '$proposals',
                cond: { $eq: ['$$this.status', 'pending'] }
              }
            }
          }
        },
        hires_made: {
          $sum: {
            $size: {
              $filter: {
                input: '$proposals',
                cond: { $eq: ['$$this.status', 'accepted'] }
              }
            }
          }
        }
      }
    }
  ]);
  
  // Get payment stats
  const manager = await this.findById(manager_id);
  const paymentStats = await Payment.aggregate([
    { $match: { user_id: manager.user_id, status: 'completed' } },
    {
      $group: {
        _id: null,
        total_spent: { $sum: '$amount' }
      }
    }
  ]);
  
  // Get recent jobs
  const recentJobs = await Job.aggregate([
    { $match: { manager_id: manager_id } },
    {
      $lookup: {
        from: 'proposals',
        localField: '_id',
        foreignField: 'job_id',
        as: 'proposals'
      }
    },
    {
      $addFields: {
        applications: { $size: '$proposals' }
      }
    },
    { $sort: { created_at: -1 } },
    { $limit: 5 }
  ]);
  
  // Get pending applications
  const pendingApplications = await Job.aggregate([
    { $match: { manager_id: manager_id } },
    {
      $lookup: {
        from: 'proposals',
        let: { jobId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$job_id', '$$jobId'] },
                  { $eq: ['$status', 'pending'] }
                ]
              }
            }
          },
          {
            $lookup: {
              from: 'talentprofiles',
              localField: 'talent_id',
              foreignField: '_id',
              as: 'talent'
            }
          },
          {
            $lookup: {
              from: 'users',
              localField: 'talent.user_id',
              foreignField: '_id',
              as: 'user'
            }
          }
        ],
        as: 'pendingProposals'
      }
    },
    { $unwind: '$pendingProposals' },
    { $sort: { 'pendingProposals.created_at': -1 } },
    { $limit: 10 }
  ]);
  
  const stats = jobStats[0] || { jobs_posted: 0, open_jobs: 0, in_progress_jobs: 0, completed_jobs: 0 };
  const appStats = applicationStats[0] || { applications_received: 0, pending_applications: 0, hires_made: 0 };
  const payStats = paymentStats[0] || { total_spent: 0 };
  
  return {
    stats: {
      jobs_posted: stats.jobs_posted,
      applications_received: appStats.applications_received,
      hires_made: appStats.hires_made,
      total_spent: payStats.total_spent
    },
    recent_jobs: recentJobs.map(job => ({
      id: job._id.toString(),
      title: job.title,
      location: 'Remote',
      posted_at: job.created_at.toISOString().split('T')[0],
      status: job.status,
      applications: job.applications,
      budget: job.budget_type === 'fixed' 
        ? `$${job.budget_min}${job.budget_max ? ` - $${job.budget_max}` : ''}` 
        : `$${job.budget_min}${job.budget_max ? ` - $${job.budget_max}` : ''}/hr`
    })),
    pending_applications: pendingApplications.map(item => ({
      id: item.pendingProposals._id.toString(),
      job_id: item._id.toString(),
      applicant_name: item.pendingProposals.user ? `${item.pendingProposals.user[0].first_name} ${item.pendingProposals.user[0].last_name}` : 'Unknown',
      job_title: item.title,
      applied_at: item.pendingProposals.created_at.toISOString().split('T')[0],
      rating: 4.5,
      experience: '3+ years',
      location: item.pendingProposals.talent ? item.pendingProposals.talent[0].location || 'Remote' : 'Remote'
    }))
  };
};

const ManagerProfile = mongoose.model('ManagerProfile', managerProfileSchema);

module.exports = ManagerProfile;
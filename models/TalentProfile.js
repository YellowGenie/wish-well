const { mongoose } = require('../config/mongodb');

// Import related models to ensure they're registered
require('./TalentSkill');
require('./Skill');

// TalentProfile Schema
const talentProfileSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  title: {
    type: String,
    trim: true
  },
  bio: {
    type: String,
    trim: true
  },
  hourly_rate: {
    type: Number,
    min: 0
  },
  availability: {
    type: String,
    enum: ['full-time', 'part-time', 'contract'],
    default: 'contract'
  },
  location: {
    type: String,
    trim: true
  },
  portfolio_description: {
    type: String,
    trim: true
  },
  profile_picture: {
    type: String,
    trim: true
  },
  is_featured: {
    type: Boolean,
    default: false
  },
  rating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0
  },
  jobs_completed: {
    type: Number,
    min: 0,
    default: 0
  },
  success_rate: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  }
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

// Indexes
talentProfileSchema.index({ user_id: 1 });
talentProfileSchema.index({ hourly_rate: 1 });
talentProfileSchema.index({ availability: 1 });
talentProfileSchema.index({ location: 1 });

// Static methods
talentProfileSchema.statics.create = async function({ user_id, title, bio, hourly_rate, availability, location, portfolio_description }) {
  const profile = new this({ user_id, title, bio, hourly_rate, availability, location, portfolio_description });
  const savedProfile = await profile.save();
  return savedProfile._id;
};

talentProfileSchema.statics.findByUserId = async function(user_id) {
  return await this.findOne({ user_id })
    .populate('user_id', 'first_name last_name email');
};

talentProfileSchema.statics.findById = async function(id) {
  return await this.findOne({ _id: id })
    .populate('user_id', 'first_name last_name email');
};

talentProfileSchema.statics.update = async function(user_id, updates) {
  const result = await this.updateOne({ user_id }, { $set: updates });
  return result.modifiedCount > 0;
};

talentProfileSchema.statics.addSkill = async function(talent_id, skill_id, proficiency = 'intermediate') {
  try {
    const TalentSkill = mongoose.model('TalentSkill');
    const skill = new TalentSkill({ talent_id, skill_id, proficiency });
    const savedSkill = await skill.save();
    return savedSkill._id;
  } catch (error) {
    if (error.code === 11000) { // Duplicate key error
      return null; // Skill already exists
    }
    throw error;
  }
};

talentProfileSchema.statics.removeSkill = async function(talent_id, skill_id) {
  const TalentSkill = mongoose.model('TalentSkill');
  const result = await TalentSkill.deleteOne({ talent_id, skill_id });
  return result.deletedCount > 0;
};

talentProfileSchema.statics.getSkills = async function(talent_id) {
  try {
    const TalentSkill = mongoose.model('TalentSkill');
    const skills = await TalentSkill.find({ talent_id })
      .populate('skill_id', 'name category')
      .sort({ 'skill_id.name': 1 });

    return skills.map(ts => ({
      id: ts.skill_id._id,
      name: ts.skill_id.name,
      category: ts.skill_id.category,
      proficiency: ts.proficiency
    }));
  } catch (error) {
    console.error('Error getting skills for talent:', talent_id, error);
    return []; // Return empty array if there's an error
  }
};

talentProfileSchema.statics.searchTalents = async function({ skills, hourly_rate_min, hourly_rate_max, availability, location, page = 1, limit = 20 }) {
  const skip = (page - 1) * limit;

  let query = { };

  // Build query conditions - only include active users (email verification optional for now)
  const User = mongoose.model('User');
  const activeUsers = await User.find({
    is_active: true
    // Removed email_verified requirement to show new talents immediately
  });

  console.log('🔍 SEARCH DEBUG - Active users found:', activeUsers.length);
  console.log('🔍 SEARCH DEBUG - Active user emails:', activeUsers.map(u => u.email));

  // Check specifically for the problematic user
  const problemUser = await User.findByEmail('navan.sami@outlook.com');
  if (problemUser) {
    console.log('🔍 SEARCH DEBUG - Found navan.sami@outlook.com:', {
      id: problemUser.id,
      is_active: problemUser.is_active,
      email_verified: problemUser.email_verified,
      role: problemUser.role
    });
  } else {
    console.log('🔍 SEARCH DEBUG - navan.sami@outlook.com NOT FOUND in User table');
  }

  const activeUserIds = activeUsers.map(u => u._id);
  query.user_id = { $in: activeUserIds };

  if (hourly_rate_min !== undefined) {
    query.hourly_rate = { ...query.hourly_rate, $gte: hourly_rate_min };
  }

  if (hourly_rate_max !== undefined) {
    query.hourly_rate = { ...query.hourly_rate, $lte: hourly_rate_max };
  }

  if (availability) {
    query.availability = availability;
  }

  if (location) {
    query.location = new RegExp(location, 'i'); // Case-insensitive search
  }

  console.log('🔍 SEARCH DEBUG - TalentProfile query:', query);

  // Sort by featured first, then by creation date
  const talents = await this.find(query)
    .populate('user_id', 'first_name last_name email profile_image')
    .sort({ is_featured: -1, created_at: -1 })
    .skip(skip)
    .limit(limit);

  console.log('🔍 SEARCH DEBUG - TalentProfiles found:', talents.length);
  console.log('🔍 SEARCH DEBUG - TalentProfile user emails:', talents.map(t => t.user_id?.email));

  // Check if navan.sami@outlook.com has a TalentProfile
  const allTalentProfiles = await this.find({}).populate('user_id');
  const navanTalentProfile = allTalentProfiles.find(p => p.user_id?.email === 'navan.sami@outlook.com');

  if (navanTalentProfile) {
    console.log('🔍 SEARCH DEBUG - navan.sami@outlook.com TalentProfile exists:', {
      id: navanTalentProfile._id,
      user_email: navanTalentProfile.user_id?.email,
      title: navanTalentProfile.title,
      user_is_active: navanTalentProfile.user_id?.is_active
    });
  } else {
    console.log('🔍 SEARCH DEBUG - navan.sami@outlook.com has NO TalentProfile');
  }

  const total = await this.countDocuments(query);

  return {
    talents: talents.map(talent => ({
      id: talent._id,
      user_id: talent.user_id._id,
      title: talent.title,
      bio: talent.bio,
      hourly_rate: talent.hourly_rate,
      availability: talent.availability,
      location: talent.location,
      is_featured: talent.is_featured || false,
      created_at: talent.created_at,
      updated_at: talent.updated_at,
      user: {
        id: talent.user_id._id,
        first_name: talent.user_id.first_name,
        last_name: talent.user_id.last_name,
        email: talent.user_id.email,
        profile_image: talent.user_id.profile_image
      },
      // Real data from database - will be 0/null if not set
      rating: talent.rating || 0,
      jobs_completed: talent.jobs_completed || 0,
      success_rate: talent.success_rate || 0
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
};

talentProfileSchema.statics.getDashboardStats = async function(talent_id) {
  try {
    const Proposal = mongoose.model('Proposal');
    const Job = mongoose.model('Job');

    // Get talent's proposals
    const proposals = await Proposal.find({ talent_id });

    // Calculate stats
    const applications_sent = proposals.length;
    const interviews_scheduled = proposals.filter(p => p.status === 'accepted').length; // Assuming accepted means interview scheduled
    const jobs_completed = proposals.filter(p => p.status === 'accepted').length; // This should be based on actual job completion
    const total_earned = proposals
      .filter(p => p.status === 'accepted')
      .reduce((sum, p) => sum + (p.bid_amount || 0), 0);

    // Get recent applications (latest 3)
    const recent_applications = await Proposal.find({ talent_id })
      .populate('job_id', 'title')
      .populate({
        path: 'job_id',
        populate: {
          path: 'manager_id',
          populate: {
            path: 'user_id',
            select: 'first_name last_name'
          }
        }
      })
      .sort({ created_at: -1 })
      .limit(3)
      .lean();

    // Transform recent applications
    const transformedApplications = recent_applications.map(app => ({
      id: app._id.toString(),
      job_title: app.job_id?.title || 'Unknown Job',
      company_name: app.job_id?.manager_id?.user_id ?
        `${app.job_id.manager_id.user_id.first_name} ${app.job_id.manager_id.user_id.last_name}` :
        'Unknown Company',
      applied_at: app.created_at.toISOString().split('T')[0],
      status: app.status === 'pending' ? 'under_review' :
              app.status === 'accepted' ? 'interview_scheduled' :
              app.status
    }));

    // Get recommended jobs (open jobs that match talent's skills/preferences)
    const openJobs = await Job.find({ status: 'open' })
      .populate('manager_id')
      .populate({
        path: 'manager_id',
        populate: {
          path: 'user_id',
          select: 'first_name last_name'
        }
      })
      .populate('skills.skill_id', 'name')
      .sort({ created_at: -1 })
      .limit(3)
      .lean();

    // Transform recommended jobs
    const recommended_jobs = openJobs.map(job => ({
      id: job._id.toString(),
      title: job.title,
      company_name: job.manager_id?.company_name ||
        (job.manager_id?.user_id ? `${job.manager_id.user_id.first_name} ${job.manager_id.user_id.last_name}` : 'Company Name Not Set'),
      location: job.manager_id?.location || 'Location Not Set',
      salary_range: job.budget_type === 'fixed' ?
        `$${job.budget_min || 0} - $${job.budget_max || 0}` :
        `$${job.budget_min || 0}/hr - $${job.budget_max || 0}/hr`,
      posted_at: this.getRelativeTime(job.created_at)
    }));

    return {
      stats: {
        applications_sent,
        interviews_scheduled,
        jobs_completed,
        total_earned
      },
      recent_applications: transformedApplications,
      recommended_jobs
    };
  } catch (error) {
    console.error('Error getting talent dashboard stats:', error);
    throw error;
  }
};

// Helper method for relative time
talentProfileSchema.statics.getRelativeTime = function(date) {
  const now = new Date();
  const diffInHours = Math.floor((now - date) / (1000 * 60 * 60));

  if (diffInHours < 1) return 'Just now';
  if (diffInHours < 24) return `${diffInHours} hours ago`;

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays === 1) return '1 day ago';
  if (diffInDays < 7) return `${diffInDays} days ago`;

  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks === 1) return '1 week ago';
  return `${diffInWeeks} weeks ago`;
};

const TalentProfile = mongoose.model('TalentProfile', talentProfileSchema);

module.exports = TalentProfile;
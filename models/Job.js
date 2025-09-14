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
jobSchema.index({ category: 1 });
jobSchema.index({ budget_type: 1 });
jobSchema.index({ created_at: -1 });
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
        
        let skill = await Skill.findOne({ name: { $regex: new RegExp(skillName.trim(), 'i') } }).session(session);
        
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
    .populate('manager_id')
    .populate('skills.skill_id');
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
    let query = { status: 'open' };

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
    const jobs = await this.find({ status: 'open', featured: true })
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
    let query = { status: 'open' };

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
      totalPages: Math.ceil(total / limit),
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1
    };
  } catch (error) {
    console.error('Error fetching jobs:', error);
    throw error;
  }
};

const Job = mongoose.model('Job', jobSchema);

module.exports = Job;
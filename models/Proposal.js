const { mongoose } = require('../config/mongodb');

// Proposal Schema
const proposalSchema = new mongoose.Schema({
  job_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true
  },
  talent_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TalentProfile',
    required: true
  },
  cover_letter: {
    type: String,
    required: true,
    trim: true
  },
  bid_amount: {
    type: Number,
    required: true,
    min: 0
  },
  timeline_days: {
    type: Number,
    min: 1
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'withdrawn'],
    default: 'pending'
  }
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

// Compound unique index to prevent duplicate proposals
proposalSchema.index({ job_id: 1, talent_id: 1 }, { unique: true });
proposalSchema.index({ job_id: 1 });
proposalSchema.index({ talent_id: 1 });
proposalSchema.index({ status: 1 });

// Static methods
proposalSchema.statics.create = async function({ job_id, talent_id, cover_letter, bid_amount, timeline_days }) {
  const proposal = new this({ job_id, talent_id, cover_letter, bid_amount, timeline_days });
  const savedProposal = await proposal.save();
  return savedProposal._id;
};

proposalSchema.statics.findById = async function(id) {
  return await this.findOne({ _id: id })
    .populate('job_id')
    .populate('talent_id');
};

proposalSchema.statics.getProposalsByJob = async function(job_id, page = 1, limit = 20) {
  try {
    const skip = (page - 1) * limit;
    
    const [proposals, total] = await Promise.all([
      this.find({ job_id: new mongoose.Types.ObjectId(job_id) })
        .populate({
          path: 'talent_id',
          populate: {
            path: 'user_id',
            select: 'first_name last_name email'
          }
        })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.countDocuments({ job_id: new mongoose.Types.ObjectId(job_id) })
    ]);
    
    // Transform to match original format
    const transformedProposals = proposals.map(p => ({
      ...p,
      talent_title: p.talent_id?.title,
      hourly_rate: p.talent_id?.hourly_rate,
      first_name: p.talent_id?.user_id?.first_name,
      last_name: p.talent_id?.user_id?.last_name,
      email: p.talent_id?.user_id?.email
    }));
    
    return {
      proposals: transformedProposals,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  } catch (error) {
    console.error('Error getting proposals by job:', error);
    throw error;
  }
};

proposalSchema.statics.updateStatus = async function(id, status) {
  const result = await this.updateOne({ _id: id }, { $set: { status } });
  return result.modifiedCount > 0;
};

proposalSchema.statics.getProposalsByTalent = async function(talent_id, page = 1, limit = 20) {
  try {
    const skip = (page - 1) * limit;

    const [proposals, total] = await Promise.all([
      this.find({ talent_id: new mongoose.Types.ObjectId(talent_id) })
        .populate({
          path: 'job_id',
          populate: {
            path: 'manager_id',
            populate: {
              path: 'user_id',
              select: 'first_name last_name email'
            }
          }
        })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.countDocuments({ talent_id: new mongoose.Types.ObjectId(talent_id) })
    ]);

    // Transform proposals to match the expected format for applications
    const applications = proposals.map(p => ({
      id: p._id.toString(),
      job_id: p.job_id?._id?.toString(),
      job_title: p.job_id?.title || 'Unknown Job',
      company_name: p.job_id?.manager_id?.user_id
        ? `${p.job_id.manager_id.user_id.first_name} ${p.job_id.manager_id.user_id.last_name}`
        : 'Unknown Company',
      cover_letter: p.cover_letter,
      bid_amount: p.bid_amount,
      timeline_days: p.timeline_days,
      status: p.status,
      applied_at: p.created_at,
      updated_at: p.updated_at
    }));

    return {
      applications,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  } catch (error) {
    console.error('Error getting proposals by talent:', error);
    throw error;
  }
};

const Proposal = mongoose.model('Proposal', proposalSchema);

module.exports = Proposal;
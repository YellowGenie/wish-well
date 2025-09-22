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
  draft_offering: {
    type: String,
    trim: true
  },
  pricing_details: {
    type: String,
    trim: true
  },
  availability: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'withdrawn', 'interview', 'approved', 'no_longer_accepting', 'inappropriate'],
    default: 'pending'
  },
  viewed_by_manager: {
    type: Boolean,
    default: false
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
proposalSchema.statics.create = async function({
  job_id,
  talent_id,
  cover_letter,
  bid_amount,
  timeline_days,
  draft_offering,
  pricing_details,
  availability
}) {
  const proposal = new this({
    job_id,
    talent_id,
    cover_letter,
    bid_amount,
    timeline_days,
    draft_offering,
    pricing_details,
    availability
  });
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
            select: 'first_name last_name'
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
      id: p._id.toString(), // Ensure ID is properly set
      talent_title: p.talent_id?.title,
      hourly_rate: p.talent_id?.hourly_rate,
      first_name: p.talent_id?.user_id?.first_name,
      last_name: p.talent_id?.user_id?.last_name,
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
              select: 'first_name last_name'
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

proposalSchema.statics.hasExistingProposal = async function(job_id, talent_id) {
  const existingProposal = await this.findOne({
    job_id: new mongoose.Types.ObjectId(job_id),
    talent_id: new mongoose.Types.ObjectId(talent_id)
  });
  return !!existingProposal;
};

proposalSchema.statics.findUserProposalForJob = async function(job_id, talent_id) {
  return await this.findOne({
    job_id: new mongoose.Types.ObjectId(job_id),
    talent_id: new mongoose.Types.ObjectId(talent_id)
  })
    .populate('job_id')
    .populate('talent_id')
    .lean();
};

proposalSchema.statics.updateProposalStatus = async function(proposalId, status, managerId) {
  const Job = require('./Job');
  const ManagerProfile = require('./ManagerProfile');

  // Get the proposal
  const proposal = await this.findById(proposalId);
  if (!proposal) {
    throw new Error('Proposal not found');
  }

  // Get the job and verify manager ownership
  const job = await Job.findById(proposal.job_id);
  if (!job) {
    throw new Error('Job not found');
  }

  // Verify manager owns this job - handle both ObjectId and populated object cases
  const jobManagerId = job.manager_id._id || job.manager_id;
  if (jobManagerId.toString() !== managerId.toString()) {
    throw new Error('Unauthorized: You can only update proposals for your own jobs');
  }

  // Validate status
  const validStatuses = ['pending', 'accepted', 'rejected', 'withdrawn', 'interview', 'approved', 'no_longer_accepting', 'inappropriate'];
  if (!validStatuses.includes(status)) {
    throw new Error('Invalid status');
  }

  // Update the proposal
  const result = await this.updateOne(
    { _id: proposalId },
    { $set: { status, viewed_by_manager: true } }
  );

  return result.modifiedCount > 0;
};

proposalSchema.statics.acceptProposal = async function(proposalId, managerId) {
  return this.updateProposalStatus(proposalId, 'accepted', managerId);
};

proposalSchema.statics.rejectProposal = async function(proposalId, managerId) {
  return this.updateProposalStatus(proposalId, 'rejected', managerId);
};

proposalSchema.statics.withdrawProposal = async function(proposalId, talentId) {
  // Get the proposal
  const proposal = await this.findById(proposalId);
  if (!proposal) {
    throw new Error('Proposal not found');
  }

  // Verify talent owns this proposal
  if (proposal.talent_id.toString() !== talentId.toString()) {
    throw new Error('Unauthorized: You can only withdraw your own proposals');
  }

  // Only allow withdrawal if proposal is pending
  if (proposal.status !== 'pending') {
    throw new Error('Proposal cannot be withdrawn - it has already been processed');
  }

  // Update the proposal
  const result = await this.updateOne(
    { _id: proposalId },
    { $set: { status: 'withdrawn' } }
  );

  return result.modifiedCount > 0;
};

proposalSchema.statics.update = async function(proposalId, updateData) {
  const result = await this.updateOne(
    { _id: proposalId },
    { $set: updateData }
  );
  return result.modifiedCount > 0;
};

proposalSchema.statics.delete = async function(proposalId) {
  const result = await this.deleteOne({ _id: proposalId });
  return result.deletedCount > 0;
};

proposalSchema.statics.getProposalsByStatus = async function(job_id, status, page = 1, limit = 20) {
  try {
    const skip = (page - 1) * limit;

    const [proposals, total] = await Promise.all([
      this.find({
        job_id: new mongoose.Types.ObjectId(job_id),
        status: status
      })
        .populate({
          path: 'talent_id',
          populate: {
            path: 'user_id',
            select: 'first_name last_name'
          }
        })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.countDocuments({
        job_id: new mongoose.Types.ObjectId(job_id),
        status: status
      })
    ]);

    // Transform to match original format
    const transformedProposals = proposals.map(p => ({
      ...p,
      id: p._id.toString(), // Ensure ID is properly set
      talent_title: p.talent_id?.title,
      hourly_rate: p.talent_id?.hourly_rate,
      first_name: p.talent_id?.user_id?.first_name,
      last_name: p.talent_id?.user_id?.last_name,
    }));

    return {
      proposals: transformedProposals,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  } catch (error) {
    console.error('Error getting proposals by status:', error);
    throw error;
  }
};

const Proposal = mongoose.model('Proposal', proposalSchema);

module.exports = Proposal;
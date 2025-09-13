const { mongoose } = require('../config/mongodb');

const contractMilestoneSchema = new mongoose.Schema({
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
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  due_date: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'submitted', 'approved', 'paid'],
    default: 'pending'
  },
  submitted_at: Date,
  approved_at: Date,
  paid_at: Date
}, {
  _id: true,
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

const contractSchema = new mongoose.Schema({
  proposal_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Proposal',
    required: true
  },
  job_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true
  },
  manager_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManagerProfile',
    required: true
  },
  talent_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TalentProfile',
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
  total_amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'usd'
  },
  payment_type: {
    type: String,
    enum: ['fixed', 'hourly', 'milestone'],
    required: true
  },
  hourly_rate: {
    type: Number,
    min: 0
  },
  estimated_hours: {
    type: Number,
    min: 0
  },
  start_date: {
    type: Date,
    required: true
  },
  end_date: {
    type: Date,
    required: true
  },
  milestones: [contractMilestoneSchema],
  terms_and_conditions: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'sent', 'accepted', 'declined', 'active', 'completed', 'cancelled'],
    default: 'draft'
  },
  sent_at: Date,
  accepted_at: Date,
  declined_at: Date,
  completed_at: Date,
  cancelled_at: Date,
  cancellation_reason: String,
  // Revision tracking
  revision: {
    type: Number,
    default: 1
  },
  parent_contract_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contract'
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Indexes
contractSchema.index({ proposal_id: 1 });
contractSchema.index({ job_id: 1 });
contractSchema.index({ manager_id: 1 });
contractSchema.index({ talent_id: 1 });
contractSchema.index({ status: 1 });
contractSchema.index({ created_at: -1 });

// Static methods
contractSchema.statics.create = async function(contractData) {
  const contract = new this(contractData);
  const savedContract = await contract.save();
  return savedContract._id;
};

contractSchema.statics.findById = async function(id) {
  return await this.findOne({ _id: id })
    .populate('proposal_id')
    .populate('job_id')
    .populate({
      path: 'manager_id',
      populate: {
        path: 'user_id',
        select: 'first_name last_name email'
      }
    })
    .populate({
      path: 'talent_id',
      populate: {
        path: 'user_id',
        select: 'first_name last_name email'
      }
    });
};

contractSchema.statics.findByManagerId = async function(managerId, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  
  const [contracts, total] = await Promise.all([
    this.find({ manager_id: managerId })
      .populate('job_id', 'title')
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
    this.countDocuments({ manager_id: managerId })
  ]);
  
  return {
    contracts,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
};

contractSchema.statics.findByTalentId = async function(talentId, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  
  const [contracts, total] = await Promise.all([
    this.find({ talent_id: talentId })
      .populate('job_id', 'title')
      .populate({
        path: 'manager_id',
        populate: {
          path: 'user_id',
          select: 'first_name last_name'
        }
      })
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    this.countDocuments({ talent_id: talentId })
  ]);
  
  return {
    contracts,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
};

contractSchema.statics.updateStatus = async function(id, status, additionalData = {}) {
  const updateData = { 
    status,
    ...additionalData
  };
  
  // Set appropriate timestamp based on status
  const timestampField = `${status}_at`;
  if (['sent', 'accepted', 'declined', 'completed', 'cancelled'].includes(status)) {
    updateData[timestampField] = new Date();
  }
  
  const result = await this.updateOne({ _id: id }, { $set: updateData });
  return result.modifiedCount > 0;
};

contractSchema.statics.updateMilestoneStatus = async function(contractId, milestoneId, status, additionalData = {}) {
  const updateData = { 
    'milestones.$.status': status,
    ...Object.keys(additionalData).reduce((acc, key) => {
      acc[`milestones.$.${key}`] = additionalData[key];
      return acc;
    }, {})
  };
  
  // Set appropriate timestamp based on status
  const timestampField = `milestones.$.${status}_at`;
  if (['submitted', 'approved', 'paid'].includes(status)) {
    updateData[timestampField] = new Date();
  }
  
  const result = await this.updateOne(
    { _id: contractId, 'milestones._id': milestoneId },
    { $set: updateData }
  );
  return result.modifiedCount > 0;
};

const Contract = mongoose.model('Contract', contractSchema);

module.exports = Contract;
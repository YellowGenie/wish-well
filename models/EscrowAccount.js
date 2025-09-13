const { mongoose } = require('../config/mongodb');

const escrowTransactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['deposit', 'hold', 'release', 'refund'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  stripe_payment_intent_id: String,
  stripe_transfer_id: String,
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  description: String,
  milestone_id: mongoose.Schema.Types.ObjectId,
  processed_at: Date
}, {
  _id: true,
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

const escrowAccountSchema = new mongoose.Schema({
  contract_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contract',
    required: true,
    unique: true
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
  stripe_customer_id: {
    type: String,
    required: true
  },
  stripe_connected_account_id: String, // For talent's connected account
  total_amount: {
    type: Number,
    required: true,
    min: 0
  },
  held_amount: {
    type: Number,
    default: 0,
    min: 0
  },
  released_amount: {
    type: Number,
    default: 0,
    min: 0
  },
  refunded_amount: {
    type: Number,
    default: 0,
    min: 0
  },
  currency: {
    type: String,
    default: 'usd'
  },
  status: {
    type: String,
    enum: ['created', 'funded', 'partial_release', 'completed', 'refunded', 'disputed'],
    default: 'created'
  },
  transactions: [escrowTransactionSchema],
  platform_fee_percentage: {
    type: Number,
    default: 5.0, // 5% platform fee
    min: 0,
    max: 100
  },
  platform_fee_amount: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Indexes
escrowAccountSchema.index({ contract_id: 1 });
escrowAccountSchema.index({ manager_id: 1 });
escrowAccountSchema.index({ talent_id: 1 });
escrowAccountSchema.index({ status: 1 });
escrowAccountSchema.index({ created_at: -1 });

// Virtual for available balance
escrowAccountSchema.virtual('available_balance').get(function() {
  return this.held_amount - this.released_amount - this.refunded_amount;
});

// Static methods
escrowAccountSchema.statics.create = async function(escrowData) {
  const escrow = new this(escrowData);
  const savedEscrow = await escrow.save();
  return savedEscrow._id;
};

escrowAccountSchema.statics.findByContractId = async function(contractId) {
  return await this.findOne({ contract_id: contractId })
    .populate('contract_id')
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

escrowAccountSchema.statics.addTransaction = async function(escrowId, transactionData) {
  const result = await this.updateOne(
    { _id: escrowId },
    { $push: { transactions: transactionData } }
  );
  return result.modifiedCount > 0;
};

escrowAccountSchema.statics.updateAmounts = async function(escrowId, amounts) {
  const result = await this.updateOne(
    { _id: escrowId },
    { $set: amounts }
  );
  return result.modifiedCount > 0;
};

escrowAccountSchema.statics.updateTransactionStatus = async function(escrowId, transactionId, status, additionalData = {}) {
  const updateData = {
    'transactions.$.status': status,
    ...Object.keys(additionalData).reduce((acc, key) => {
      acc[`transactions.$.${key}`] = additionalData[key];
      return acc;
    }, {})
  };
  
  if (status === 'completed') {
    updateData['transactions.$.processed_at'] = new Date();
  }
  
  const result = await this.updateOne(
    { _id: escrowId, 'transactions._id': transactionId },
    { $set: updateData }
  );
  return result.modifiedCount > 0;
};

escrowAccountSchema.statics.findByManagerId = async function(managerId, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  
  const [accounts, total] = await Promise.all([
    this.find({ manager_id: managerId })
      .populate({
        path: 'contract_id',
        select: 'title status',
        populate: {
          path: 'job_id',
          select: 'title'
        }
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
    this.countDocuments({ manager_id: managerId })
  ]);
  
  return {
    accounts,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
};

escrowAccountSchema.statics.findByTalentId = async function(talentId, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  
  const [accounts, total] = await Promise.all([
    this.find({ talent_id: talentId })
      .populate({
        path: 'contract_id',
        select: 'title status',
        populate: {
          path: 'job_id',
          select: 'title'
        }
      })
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
    accounts,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
};

const EscrowAccount = mongoose.model('EscrowAccount', escrowAccountSchema);

module.exports = EscrowAccount;
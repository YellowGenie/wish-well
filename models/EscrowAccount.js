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
  },
  admin_controls: {
    is_frozen: {
      type: Boolean,
      default: false
    },
    frozen_reason: String,
    frozen_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    frozen_at: Date,
    auto_release_enabled: {
      type: Boolean,
      default: true
    },
    auto_release_delay_hours: {
      type: Number,
      default: 72
    },
    dispute_resolution_mode: {
      type: Boolean,
      default: false
    },
    requires_manual_approval: {
      type: Boolean,
      default: false
    },
    priority_level: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    admin_notes: [String],
    last_admin_action: {
      action_type: String,
      admin_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      timestamp: Date,
      reason: String
    }
  },
  audit_trail: [{
    action: {
      type: String,
      enum: [
        'created',
        'funded',
        'released',
        'refunded',
        'frozen',
        'unfrozen',
        'disputed',
        'resolved',
        'emergency_release',
        'manual_adjustment'
      ]
    },
    amount: Number,
    performed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    metadata: mongoose.Schema.Types.Mixed
  }],
  compliance: {
    kyc_verified: {
      type: Boolean,
      default: false
    },
    aml_checked: {
      type: Boolean,
      default: false
    },
    sanctions_cleared: {
      type: Boolean,
      default: false
    },
    risk_score: {
      type: Number,
      min: 0,
      max: 100
    },
    compliance_notes: String,
    last_compliance_check: Date
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

// Admin control methods
escrowAccountSchema.statics.freezeAccount = async function(escrowId, adminId, reason) {
  const updateData = {
    'admin_controls.is_frozen': true,
    'admin_controls.frozen_reason': reason,
    'admin_controls.frozen_by': adminId,
    'admin_controls.frozen_at': new Date(),
    'admin_controls.last_admin_action': {
      action_type: 'freeze',
      admin_id: adminId,
      timestamp: new Date(),
      reason: reason
    }
  };

  await this.updateOne(
    { _id: escrowId },
    {
      $set: updateData,
      $push: {
        audit_trail: {
          action: 'frozen',
          performed_by: adminId,
          reason: reason,
          timestamp: new Date()
        }
      }
    }
  );

  return true;
};

escrowAccountSchema.statics.unfreezeAccount = async function(escrowId, adminId, reason) {
  const updateData = {
    'admin_controls.is_frozen': false,
    'admin_controls.frozen_reason': null,
    'admin_controls.frozen_by': null,
    'admin_controls.frozen_at': null,
    'admin_controls.last_admin_action': {
      action_type: 'unfreeze',
      admin_id: adminId,
      timestamp: new Date(),
      reason: reason
    }
  };

  await this.updateOne(
    { _id: escrowId },
    {
      $set: updateData,
      $push: {
        audit_trail: {
          action: 'unfrozen',
          performed_by: adminId,
          reason: reason,
          timestamp: new Date()
        }
      }
    }
  );

  return true;
};

escrowAccountSchema.statics.emergencyRelease = async function(escrowId, adminId, amount, reason, recipient = 'talent') {
  const escrow = await this.findById(escrowId);
  if (!escrow) throw new Error('Escrow account not found');

  if (amount > escrow.held_amount) {
    throw new Error('Release amount exceeds held amount');
  }

  // Create release transaction
  const transaction = {
    type: 'release',
    amount: amount,
    status: 'completed',
    description: `Emergency release: ${reason}`,
    processed_at: new Date(),
    stripe_transfer_id: `emergency_${Date.now()}`
  };

  const updateData = {
    released_amount: escrow.released_amount + amount,
    held_amount: escrow.held_amount - amount,
    'admin_controls.last_admin_action': {
      action_type: 'emergency_release',
      admin_id: adminId,
      timestamp: new Date(),
      reason: reason
    }
  };

  await this.updateOne(
    { _id: escrowId },
    {
      $set: updateData,
      $push: {
        transactions: transaction,
        audit_trail: {
          action: 'emergency_release',
          amount: amount,
          performed_by: adminId,
          reason: reason,
          timestamp: new Date(),
          metadata: { recipient }
        }
      }
    }
  );

  return transaction;
};

escrowAccountSchema.statics.adjustPlatformFee = async function(escrowId, adminId, newPercentage, reason) {
  const escrow = await this.findById(escrowId);
  if (!escrow) throw new Error('Escrow account not found');

  const newFeeAmount = (escrow.total_amount * newPercentage) / 100;
  const oldPercentage = escrow.platform_fee_percentage;

  const updateData = {
    platform_fee_percentage: newPercentage,
    platform_fee_amount: newFeeAmount,
    'admin_controls.last_admin_action': {
      action_type: 'fee_adjustment',
      admin_id: adminId,
      timestamp: new Date(),
      reason: reason
    }
  };

  await this.updateOne(
    { _id: escrowId },
    {
      $set: updateData,
      $push: {
        audit_trail: {
          action: 'manual_adjustment',
          performed_by: adminId,
          reason: reason,
          timestamp: new Date(),
          metadata: {
            old_fee_percentage: oldPercentage,
            new_fee_percentage: newPercentage,
            adjustment_type: 'platform_fee'
          }
        }
      }
    }
  );

  return { old_percentage: oldPercentage, new_percentage: newPercentage };
};

escrowAccountSchema.statics.addAdminNote = async function(escrowId, adminId, note) {
  await this.updateOne(
    { _id: escrowId },
    {
      $push: { 'admin_controls.admin_notes': note },
      $set: {
        'admin_controls.last_admin_action': {
          action_type: 'note_added',
          admin_id: adminId,
          timestamp: new Date(),
          reason: 'Admin note added'
        }
      }
    }
  );

  return true;
};

escrowAccountSchema.statics.setDisputeMode = async function(escrowId, adminId, enabled, reason) {
  const updateData = {
    'admin_controls.dispute_resolution_mode': enabled,
    'admin_controls.last_admin_action': {
      action_type: enabled ? 'dispute_mode_enabled' : 'dispute_mode_disabled',
      admin_id: adminId,
      timestamp: new Date(),
      reason: reason
    }
  };

  await this.updateOne(
    { _id: escrowId },
    {
      $set: updateData,
      $push: {
        audit_trail: {
          action: enabled ? 'disputed' : 'resolved',
          performed_by: adminId,
          reason: reason,
          timestamp: new Date()
        }
      }
    }
  );

  return true;
};

escrowAccountSchema.statics.updateComplianceStatus = async function(escrowId, adminId, complianceData) {
  const updateData = {
    'compliance.kyc_verified': complianceData.kyc_verified || false,
    'compliance.aml_checked': complianceData.aml_checked || false,
    'compliance.sanctions_cleared': complianceData.sanctions_cleared || false,
    'compliance.risk_score': complianceData.risk_score || 0,
    'compliance.compliance_notes': complianceData.notes || '',
    'compliance.last_compliance_check': new Date(),
    'admin_controls.last_admin_action': {
      action_type: 'compliance_update',
      admin_id: adminId,
      timestamp: new Date(),
      reason: 'Compliance status updated'
    }
  };

  await this.updateOne({ _id: escrowId }, { $set: updateData });
  return true;
};

escrowAccountSchema.statics.getAccountsRequiringAttention = async function() {
  return await this.find({
    $or: [
      { 'admin_controls.is_frozen': true },
      { 'admin_controls.dispute_resolution_mode': true },
      { 'admin_controls.requires_manual_approval': true },
      { 'admin_controls.priority_level': { $in: ['high', 'critical'] } },
      { 'compliance.risk_score': { $gte: 75 } },
      { status: 'disputed' }
    ]
  })
    .populate('contract_id', 'title')
    .populate('manager_id talent_id', 'user_id')
    .populate('admin_controls.frozen_by admin_controls.last_admin_action.admin_id', 'first_name last_name')
    .sort({ 'admin_controls.priority_level': -1, created_at: -1 })
    .limit(50);
};

escrowAccountSchema.statics.getAnalytics = async function(startDate, endDate) {
  const match = {};
  if (startDate || endDate) {
    match.created_at = {};
    if (startDate) match.created_at.$gte = new Date(startDate);
    if (endDate) match.created_at.$lte = new Date(endDate);
  }

  const pipeline = [
    { $match: match },
    {
      $group: {
        _id: null,
        total_accounts: { $sum: 1 },
        total_amount: { $sum: '$total_amount' },
        total_held: { $sum: '$held_amount' },
        total_released: { $sum: '$released_amount' },
        total_refunded: { $sum: '$refunded_amount' },
        total_fees: { $sum: '$platform_fee_amount' },
        frozen_accounts: {
          $sum: {
            $cond: [{ $eq: ['$admin_controls.is_frozen', true] }, 1, 0]
          }
        },
        disputed_accounts: {
          $sum: {
            $cond: [{ $eq: ['$status', 'disputed'] }, 1, 0]
          }
        },
        high_risk_accounts: {
          $sum: {
            $cond: [{ $gte: ['$compliance.risk_score', 75] }, 1, 0]
          }
        }
      }
    }
  ];

  const result = await this.aggregate(pipeline);
  return result[0] || {
    total_accounts: 0,
    total_amount: 0,
    total_held: 0,
    total_released: 0,
    total_refunded: 0,
    total_fees: 0,
    frozen_accounts: 0,
    disputed_accounts: 0,
    high_risk_accounts: 0
  };
};

const EscrowAccount = mongoose.model('EscrowAccount', escrowAccountSchema);

module.exports = EscrowAccount;
const express = require('express');
const router = express.Router();
const { auth, adminAuth } = require('../../middleware/auth');
const Contract = require('../../models/Contract');
const EscrowAccount = require('../../models/EscrowAccount');

// Get all contracts (admin only)
router.get('/', auth, adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const [contracts, total] = await Promise.all([
      Contract.find({})
        .populate({
          path: 'job_id',
          select: 'title'
        })
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
        })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Contract.countDocuments({})
    ]);

    res.json({
      contracts,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });

  } catch (error) {
    console.error('Admin contracts retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve contracts',
      details: error.message
    });
  }
});

// Get contract statistics (admin only)
router.get('/stats', auth, adminAuth, async (req, res) => {
  try {
    const stats = await Contract.aggregate([
      {
        $group: {
          _id: null,
          total_contracts: { $sum: 1 },
          active_contracts: { 
            $sum: { 
              $cond: [{ $eq: ['$status', 'active'] }, 1, 0] 
            }
          },
          completed_contracts: { 
            $sum: { 
              $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] 
            }
          },
          disputed_contracts: { 
            $sum: { 
              $cond: [{ $eq: ['$status', 'disputed'] }, 1, 0] 
            }
          },
          total_value: { $sum: '$total_amount' }
        }
      }
    ]);

    const result = stats.length > 0 ? stats[0] : {
      total_contracts: 0,
      active_contracts: 0,
      completed_contracts: 0,
      disputed_contracts: 0,
      total_value: 0
    };

    // Remove the _id field
    delete result._id;

    res.json({ stats: result });

  } catch (error) {
    console.error('Admin contract stats error:', error);
    res.status(500).json({
      error: 'Failed to retrieve contract statistics',
      details: error.message
    });
  }
});

// Get contract by ID with full details (admin only)
router.get('/:id', auth, adminAuth, async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.id)
      .populate({
        path: 'proposal_id',
        select: 'bid_amount timeline_days cover_letter'
      })
      .populate({
        path: 'job_id',
        select: 'title description budget'
      })
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

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Get associated escrow account if exists
    const escrowAccount = await EscrowAccount.findOne({ contract_id: contract._id });

    res.json({
      contract,
      escrow_account: escrowAccount
    });

  } catch (error) {
    console.error('Admin contract retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve contract',
      details: error.message
    });
  }
});

// Update contract status (admin only) - for dispute resolution
router.put('/:id/status', auth, adminAuth, async (req, res) => {
  try {
    const { status, notes } = req.body;
    const contractId = req.params.id;

    if (!['draft', 'sent', 'accepted', 'declined', 'active', 'completed', 'cancelled', 'disputed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const contract = await Contract.findById(contractId);
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Update contract status
    const updated = await Contract.updateStatus(contractId, status, {
      admin_notes: notes,
      admin_updated_at: new Date()
    });

    if (!updated) {
      return res.status(400).json({ error: 'Failed to update contract status' });
    }

    res.json({
      success: true,
      message: 'Contract status updated successfully'
    });

  } catch (error) {
    console.error('Admin contract status update error:', error);
    res.status(500).json({
      error: 'Failed to update contract status',
      details: error.message
    });
  }
});

// Get contracts by status (admin only)
router.get('/status/:status', auth, adminAuth, async (req, res) => {
  try {
    const { status } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    if (!['draft', 'sent', 'accepted', 'declined', 'active', 'completed', 'cancelled', 'disputed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const [contracts, total] = await Promise.all([
      Contract.find({ status })
        .populate({
          path: 'job_id',
          select: 'title'
        })
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
        })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Contract.countDocuments({ status })
    ]);

    res.json({
      contracts,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });

  } catch (error) {
    console.error('Admin contracts by status error:', error);
    res.status(500).json({
      error: 'Failed to retrieve contracts by status',
      details: error.message
    });
  }
});

// Get disputed contracts (admin only)
router.get('/disputes/all', auth, adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [contracts, total] = await Promise.all([
      Contract.find({ status: 'disputed' })
        .populate({
          path: 'job_id',
          select: 'title'
        })
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
        })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Contract.countDocuments({ status: 'disputed' })
    ]);

    // Get escrow account info for disputed contracts
    const contractsWithEscrow = await Promise.all(
      contracts.map(async (contract) => {
        const escrowAccount = await EscrowAccount.findOne({ contract_id: contract._id });
        return {
          ...contract,
          escrow_account: escrowAccount
        };
      })
    );

    res.json({
      contracts: contractsWithEscrow,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });

  } catch (error) {
    console.error('Admin disputed contracts error:', error);
    res.status(500).json({
      error: 'Failed to retrieve disputed contracts',
      details: error.message
    });
  }
});

// Get contract activity/timeline (admin only)
router.get('/:id/activity', auth, adminAuth, async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.id);
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Build activity timeline
    const activity = [];

    if (contract.created_at) {
      activity.push({
        type: 'created',
        timestamp: contract.created_at,
        description: 'Contract created'
      });
    }

    if (contract.sent_at) {
      activity.push({
        type: 'sent',
        timestamp: contract.sent_at,
        description: 'Contract sent to talent'
      });
    }

    if (contract.accepted_at) {
      activity.push({
        type: 'accepted',
        timestamp: contract.accepted_at,
        description: 'Contract accepted by talent'
      });
    }

    if (contract.declined_at) {
      activity.push({
        type: 'declined',
        timestamp: contract.declined_at,
        description: 'Contract declined by talent',
        notes: contract.cancellation_reason
      });
    }

    if (contract.completed_at) {
      activity.push({
        type: 'completed',
        timestamp: contract.completed_at,
        description: 'Contract completed'
      });
    }

    if (contract.cancelled_at) {
      activity.push({
        type: 'cancelled',
        timestamp: contract.cancelled_at,
        description: 'Contract cancelled',
        notes: contract.cancellation_reason
      });
    }

    // Add milestone activities
    if (contract.milestones && contract.milestones.length > 0) {
      contract.milestones.forEach((milestone, index) => {
        if (milestone.submitted_at) {
          activity.push({
            type: 'milestone_submitted',
            timestamp: milestone.submitted_at,
            description: `Milestone ${index + 1} "${milestone.title}" submitted`,
            milestone_id: milestone._id
          });
        }

        if (milestone.approved_at) {
          activity.push({
            type: 'milestone_approved',
            timestamp: milestone.approved_at,
            description: `Milestone ${index + 1} "${milestone.title}" approved`,
            milestone_id: milestone._id
          });
        }

        if (milestone.paid_at) {
          activity.push({
            type: 'milestone_paid',
            timestamp: milestone.paid_at,
            description: `Milestone ${index + 1} "${milestone.title}" paid ($${milestone.amount.toFixed(2)})`,
            milestone_id: milestone._id
          });
        }
      });
    }

    // Get escrow activities
    const escrowAccount = await EscrowAccount.findOne({ contract_id: contract._id });
    if (escrowAccount && escrowAccount.transactions) {
      escrowAccount.transactions.forEach(transaction => {
        activity.push({
          type: `escrow_${transaction.type}`,
          timestamp: transaction.created_at,
          description: transaction.description,
          amount: transaction.amount
        });
      });
    }

    // Sort by timestamp
    activity.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    res.json({ activity });

  } catch (error) {
    console.error('Admin contract activity error:', error);
    res.status(500).json({
      error: 'Failed to retrieve contract activity',
      details: error.message
    });
  }
});

// Force complete contract (admin only) - for dispute resolution
router.post('/:id/force-complete', auth, adminAuth, async (req, res) => {
  try {
    const { notes } = req.body;
    const contractId = req.params.id;

    const contract = await Contract.findById(contractId);
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Update contract status to completed
    const updated = await Contract.updateStatus(contractId, 'completed', {
      admin_notes: notes,
      admin_force_completed: true,
      admin_completed_at: new Date()
    });

    if (!updated) {
      return res.status(400).json({ error: 'Failed to complete contract' });
    }

    // If there's an escrow account, complete it too
    const escrowAccount = await EscrowAccount.findOne({ contract_id: contractId });
    if (escrowAccount) {
      await EscrowAccount.updateOne(
        { _id: escrowAccount._id },
        { 
          $set: { 
            status: 'completed',
            admin_notes: notes 
          }
        }
      );
    }

    res.json({
      success: true,
      message: 'Contract force completed successfully'
    });

  } catch (error) {
    console.error('Admin contract force complete error:', error);
    res.status(500).json({
      error: 'Failed to force complete contract',
      details: error.message
    });
  }
});

module.exports = router;
const express = require('express');
const router = express.Router();
const { auth, adminAuth } = require('../../middleware/auth');
const EscrowAccount = require('../../models/EscrowAccount');
const Contract = require('../../models/Contract');

// Get all escrow accounts (admin only)
router.get('/', auth, adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const [escrows, total] = await Promise.all([
      EscrowAccount.find({})
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
      EscrowAccount.countDocuments({})
    ]);

    // Add available balance to each escrow
    const escrowsWithBalance = escrows.map(escrow => ({
      ...escrow,
      available_balance: escrow.held_amount - escrow.released_amount - escrow.refunded_amount
    }));

    res.json({
      escrows: escrowsWithBalance,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });

  } catch (error) {
    console.error('Admin escrows retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve escrow accounts',
      details: error.message
    });
  }
});

// Get escrow statistics (admin only)
router.get('/stats', auth, adminAuth, async (req, res) => {
  try {
    const stats = await EscrowAccount.aggregate([
      {
        $group: {
          _id: null,
          total_escrows: { $sum: 1 },
          total_value: { $sum: '$total_amount' },
          total_held: { $sum: '$held_amount' },
          total_released: { $sum: '$released_amount' },
          total_refunded: { $sum: '$refunded_amount' },
          platform_fees_collected: { $sum: '$platform_fee_amount' }
        }
      }
    ]);

    const result = stats.length > 0 ? stats[0] : {
      total_escrows: 0,
      total_value: 0,
      total_held: 0,
      total_released: 0,
      total_refunded: 0,
      platform_fees_collected: 0
    };

    // Remove the _id field
    delete result._id;

    res.json({ stats: result });

  } catch (error) {
    console.error('Admin escrow stats error:', error);
    res.status(500).json({
      error: 'Failed to retrieve escrow statistics',
      details: error.message
    });
  }
});

// Get escrow by ID with full details (admin only)
router.get('/:id', auth, adminAuth, async (req, res) => {
  try {
    const escrow = await EscrowAccount.findById(req.params.id)
      .populate({
        path: 'contract_id',
        populate: {
          path: 'job_id',
          select: 'title description'
        }
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

    if (!escrow) {
      return res.status(404).json({ error: 'Escrow account not found' });
    }

    // Add available balance
    const available_balance = escrow.held_amount - escrow.released_amount - escrow.refunded_amount;

    res.json({
      escrow: {
        ...escrow._doc,
        available_balance
      }
    });

  } catch (error) {
    console.error('Admin escrow retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve escrow account',
      details: error.message
    });
  }
});

// Update escrow status (admin only) - for dispute resolution
router.put('/:id/status', auth, adminAuth, async (req, res) => {
  try {
    const { status, notes } = req.body;
    const escrowId = req.params.id;

    if (!['created', 'funded', 'partial_release', 'completed', 'refunded', 'disputed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const escrow = await EscrowAccount.findById(escrowId);
    if (!escrow) {
      return res.status(404).json({ error: 'Escrow account not found' });
    }

    // Update escrow status
    await EscrowAccount.updateOne(
      { _id: escrowId },
      { 
        $set: { 
          status: status,
          admin_notes: notes,
          updated_at: new Date()
        }
      }
    );

    // Log the admin action as a transaction
    if (notes) {
      await EscrowAccount.addTransaction(escrowId, {
        type: 'admin_action',
        amount: 0,
        status: 'completed',
        description: `Admin status change to ${status}: ${notes}`,
        processed_at: new Date()
      });
    }

    res.json({
      success: true,
      message: 'Escrow status updated successfully'
    });

  } catch (error) {
    console.error('Admin escrow status update error:', error);
    res.status(500).json({
      error: 'Failed to update escrow status',
      details: error.message
    });
  }
});

// Force refund escrow (admin only) - for dispute resolution
router.post('/:id/refund', auth, adminAuth, async (req, res) => {
  try {
    const { amount, reason } = req.body;
    const escrowId = req.params.id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid refund amount is required' });
    }

    if (!reason) {
      return res.status(400).json({ error: 'Refund reason is required' });
    }

    const escrow = await EscrowAccount.findById(escrowId);
    if (!escrow) {
      return res.status(404).json({ error: 'Escrow account not found' });
    }

    // Check if there are sufficient funds to refund
    const availableBalance = escrow.held_amount - escrow.released_amount - escrow.refunded_amount;
    if (amount > availableBalance) {
      return res.status(400).json({ 
        error: 'Insufficient funds for refund',
        available_balance: availableBalance 
      });
    }

    // Add refund transaction
    await EscrowAccount.addTransaction(escrowId, {
      type: 'refund',
      amount: amount,
      status: 'completed',
      description: `Admin-initiated refund: ${reason}`,
      processed_at: new Date()
    });

    // Update escrow amounts
    const newRefundedAmount = escrow.refunded_amount + amount;
    const newStatus = newRefundedAmount >= escrow.held_amount ? 'refunded' : 'partial_refund';

    await EscrowAccount.updateAmounts(escrowId, {
      refunded_amount: newRefundedAmount,
      status: newStatus
    });

    res.json({
      success: true,
      message: `Refund of $${amount.toFixed(2)} processed successfully`,
      refunded_amount: amount,
      remaining_balance: availableBalance - amount
    });

  } catch (error) {
    console.error('Admin escrow refund error:', error);
    res.status(500).json({
      error: 'Failed to process refund',
      details: error.message
    });
  }
});

// Get escrows by status (admin only)
router.get('/status/:status', auth, adminAuth, async (req, res) => {
  try {
    const { status } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    if (!['created', 'funded', 'partial_release', 'completed', 'refunded', 'disputed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const [escrows, total] = await Promise.all([
      EscrowAccount.find({ status })
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
      EscrowAccount.countDocuments({ status })
    ]);

    // Add available balance to each escrow
    const escrowsWithBalance = escrows.map(escrow => ({
      ...escrow,
      available_balance: escrow.held_amount - escrow.released_amount - escrow.refunded_amount
    }));

    res.json({
      escrows: escrowsWithBalance,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });

  } catch (error) {
    console.error('Admin escrows by status error:', error);
    res.status(500).json({
      error: 'Failed to retrieve escrow accounts by status',
      details: error.message
    });
  }
});

// Get disputed escrows (admin only)
router.get('/disputes/all', auth, adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [escrows, total] = await Promise.all([
      EscrowAccount.find({ status: 'disputed' })
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
      EscrowAccount.countDocuments({ status: 'disputed' })
    ]);

    // Add available balance to each escrow
    const escrowsWithBalance = escrows.map(escrow => ({
      ...escrow,
      available_balance: escrow.held_amount - escrow.released_amount - escrow.refunded_amount
    }));

    res.json({
      escrows: escrowsWithBalance,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });

  } catch (error) {
    console.error('Admin disputed escrows error:', error);
    res.status(500).json({
      error: 'Failed to retrieve disputed escrow accounts',
      details: error.message
    });
  }
});

module.exports = router;
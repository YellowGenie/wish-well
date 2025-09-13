const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { body, validationResult, param } = require('express-validator');
const Contract = require('../models/Contract');
const Proposal = require('../models/Proposal');
const Job = require('../models/Job');
const ManagerProfile = require('../models/ManagerProfile');
const TalentProfile = require('../models/TalentProfile');
const EscrowAccount = require('../models/EscrowAccount');
const Notification = require('../models/Notification');

// Validation middleware
const validateContract = [
  body('proposal_id').isMongoId().withMessage('Valid proposal ID is required'),
  body('title').isLength({ min: 5, max: 200 }).withMessage('Title must be between 5-200 characters'),
  body('description').isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),
  body('total_amount').isFloat({ min: 1 }).withMessage('Total amount must be at least $1'),
  body('payment_type').isIn(['fixed', 'hourly', 'milestone']).withMessage('Invalid payment type'),
  body('start_date').isISO8601().withMessage('Valid start date is required'),
  body('end_date').isISO8601().withMessage('Valid end date is required'),
  body('terms_and_conditions').isLength({ min: 50 }).withMessage('Terms and conditions must be at least 50 characters'),
  // Conditional validations
  body('hourly_rate').if(body('payment_type').equals('hourly')).isFloat({ min: 1 }).withMessage('Hourly rate is required for hourly contracts'),
  body('estimated_hours').if(body('payment_type').equals('hourly')).isFloat({ min: 1 }).withMessage('Estimated hours is required for hourly contracts'),
  body('milestones').if(body('payment_type').equals('milestone')).isArray({ min: 1 }).withMessage('At least one milestone is required for milestone contracts'),
  body('milestones.*.title').if(body('payment_type').equals('milestone')).isLength({ min: 3 }).withMessage('Milestone title is required'),
  body('milestones.*.description').if(body('payment_type').equals('milestone')).isLength({ min: 10 }).withMessage('Milestone description is required'),
  body('milestones.*.amount').if(body('payment_type').equals('milestone')).isFloat({ min: 1 }).withMessage('Milestone amount is required'),
  body('milestones.*.due_date').if(body('payment_type').equals('milestone')).isISO8601().withMessage('Milestone due date is required')
];

// Create a new contract
router.post('/', auth, validateContract, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const {
      proposal_id,
      title,
      description,
      total_amount,
      payment_type,
      hourly_rate,
      estimated_hours,
      start_date,
      end_date,
      milestones,
      terms_and_conditions
    } = req.body;

    // Verify the proposal exists and user is the manager
    const proposal = await Proposal.findById(proposal_id).populate('job_id');
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    // Get manager profile
    const managerProfile = await ManagerProfile.findByUserId(req.user.id);
    if (!managerProfile) {
      return res.status(403).json({ error: 'Only managers can create contracts' });
    }

    // Verify manager owns the job
    if (proposal.job_id.manager_id.toString() !== managerProfile._id.toString()) {
      return res.status(403).json({ error: 'You can only create contracts for your own job postings' });
    }

    // Validate proposal is accepted
    if (proposal.status !== 'accepted') {
      return res.status(400).json({ error: 'Can only create contracts for accepted proposals' });
    }

    // Check if contract already exists for this proposal
    const existingContract = await Contract.findOne({ proposal_id });
    if (existingContract) {
      return res.status(400).json({ error: 'Contract already exists for this proposal' });
    }

    // Validate dates
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    if (startDate >= endDate) {
      return res.status(400).json({ error: 'End date must be after start date' });
    }

    // Validate milestone amounts sum up to total for milestone contracts
    if (payment_type === 'milestone') {
      const milestoneSum = milestones.reduce((sum, m) => sum + parseFloat(m.amount), 0);
      if (Math.abs(milestoneSum - parseFloat(total_amount)) > 0.01) {
        return res.status(400).json({ error: 'Sum of milestone amounts must equal total amount' });
      }
    }

    // Create contract
    const contractData = {
      proposal_id,
      job_id: proposal.job_id._id,
      manager_id: managerProfile._id,
      talent_id: proposal.talent_id,
      title,
      description,
      total_amount: parseFloat(total_amount),
      payment_type,
      start_date: startDate,
      end_date: endDate,
      terms_and_conditions,
      status: 'draft'
    };

    if (payment_type === 'hourly') {
      contractData.hourly_rate = parseFloat(hourly_rate);
      contractData.estimated_hours = parseFloat(estimated_hours);
    }

    if (payment_type === 'milestone') {
      contractData.milestones = milestones.map(m => ({
        title: m.title,
        description: m.description,
        amount: parseFloat(m.amount),
        due_date: new Date(m.due_date)
      }));
    }

    const contractId = await Contract.create(contractData);

    // Get full contract details
    const contract = await Contract.findById(contractId);

    res.status(201).json({
      success: true,
      message: 'Contract created successfully',
      contract
    });

  } catch (error) {
    console.error('Contract creation error:', error);
    res.status(500).json({
      error: 'Failed to create contract',
      details: error.message
    });
  }
});

// Send contract to talent
router.post('/:id/send', auth, [
  param('id').isMongoId().withMessage('Valid contract ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const contractId = req.params.id;
    
    // Get manager profile
    const managerProfile = await ManagerProfile.findByUserId(req.user.id);
    if (!managerProfile) {
      return res.status(403).json({ error: 'Only managers can send contracts' });
    }

    const contract = await Contract.findById(contractId);
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Verify manager owns the contract
    if (contract.manager_id.toString() !== managerProfile._id.toString()) {
      return res.status(403).json({ error: 'You can only send your own contracts' });
    }

    // Verify contract is in draft status
    if (contract.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft contracts can be sent' });
    }

    // Update contract status
    const updated = await Contract.updateStatus(contractId, 'sent');
    if (!updated) {
      return res.status(400).json({ error: 'Failed to update contract status' });
    }

    // Get talent user info for notification
    const talentProfile = await TalentProfile.findById(contract.talent_id).populate('user_id');
    
    // Create notification for talent
    await Notification.create({
      user_id: talentProfile.user_id._id,
      type: 'contract_received',
      title: 'New Contract Received',
      message: `You have received a contract for "${contract.title}". Please review and respond.`,
      data: {
        contract_id: contractId,
        job_id: contract.job_id
      }
    });

    res.json({
      success: true,
      message: 'Contract sent successfully'
    });

  } catch (error) {
    console.error('Contract sending error:', error);
    res.status(500).json({
      error: 'Failed to send contract',
      details: error.message
    });
  }
});

// Get contracts for current user (manager or talent)
router.get('/', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status; // Optional status filter

    // Try to get manager profile first
    let managerProfile = null;
    let talentProfile = null;
    
    try {
      managerProfile = await ManagerProfile.findByUserId(req.user.id);
    } catch (err) {
      // User might not be a manager
    }
    
    if (!managerProfile) {
      try {
        talentProfile = await TalentProfile.findByUserId(req.user.id);
      } catch (err) {
        // User might not be a talent
      }
    }

    if (!managerProfile && !talentProfile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    let result;
    if (managerProfile) {
      result = await Contract.findByManagerId(managerProfile._id, page, limit);
    } else {
      result = await Contract.findByTalentId(talentProfile._id, page, limit);
    }

    // Apply status filter if provided
    if (status) {
      result.contracts = result.contracts.filter(contract => contract.status === status);
      result.total = result.contracts.length;
      result.totalPages = Math.ceil(result.total / limit);
    }

    res.json(result);

  } catch (error) {
    console.error('Contracts retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve contracts',
      details: error.message
    });
  }
});

// Get specific contract details
router.get('/:id', auth, [
  param('id').isMongoId().withMessage('Valid contract ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const contract = await Contract.findById(req.params.id);
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Check if user has access to this contract
    const managerProfile = await ManagerProfile.findByUserId(req.user.id);
    const talentProfile = await TalentProfile.findByUserId(req.user.id);
    
    const hasAccess = (
      (managerProfile && contract.manager_id.toString() === managerProfile._id.toString()) ||
      (talentProfile && contract.talent_id.toString() === talentProfile._id.toString())
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ contract });

  } catch (error) {
    console.error('Contract retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve contract',
      details: error.message
    });
  }
});

// Accept contract (talent only)
router.post('/:id/accept', auth, [
  param('id').isMongoId().withMessage('Valid contract ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const contractId = req.params.id;
    
    // Get talent profile
    const talentProfile = await TalentProfile.findByUserId(req.user.id);
    if (!talentProfile) {
      return res.status(403).json({ error: 'Only talents can accept contracts' });
    }

    const contract = await Contract.findById(contractId);
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Verify talent owns the contract
    if (contract.talent_id.toString() !== talentProfile._id.toString()) {
      return res.status(403).json({ error: 'You can only accept contracts sent to you' });
    }

    // Verify contract is in sent status
    if (contract.status !== 'sent') {
      return res.status(400).json({ error: 'Only sent contracts can be accepted' });
    }

    // Update contract status
    const updated = await Contract.updateStatus(contractId, 'accepted');
    if (!updated) {
      return res.status(400).json({ error: 'Failed to update contract status' });
    }

    // Get manager user info for notification
    const managerProfile = await ManagerProfile.findById(contract.manager_id).populate('user_id');
    
    // Create notification for manager
    await Notification.create({
      user_id: managerProfile.user_id._id,
      type: 'contract_accepted',
      title: 'Contract Accepted',
      message: `Your contract for "${contract.title}" has been accepted. You can now fund the escrow account.`,
      data: {
        contract_id: contractId,
        job_id: contract.job_id
      }
    });

    res.json({
      success: true,
      message: 'Contract accepted successfully'
    });

  } catch (error) {
    console.error('Contract acceptance error:', error);
    res.status(500).json({
      error: 'Failed to accept contract',
      details: error.message
    });
  }
});

// Decline contract (talent only)
router.post('/:id/decline', auth, [
  param('id').isMongoId().withMessage('Valid contract ID is required'),
  body('reason').optional().isLength({ max: 500 }).withMessage('Decline reason cannot exceed 500 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const contractId = req.params.id;
    const { reason } = req.body;
    
    // Get talent profile
    const talentProfile = await TalentProfile.findByUserId(req.user.id);
    if (!talentProfile) {
      return res.status(403).json({ error: 'Only talents can decline contracts' });
    }

    const contract = await Contract.findById(contractId);
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Verify talent owns the contract
    if (contract.talent_id.toString() !== talentProfile._id.toString()) {
      return res.status(403).json({ error: 'You can only decline contracts sent to you' });
    }

    // Verify contract is in sent status
    if (contract.status !== 'sent') {
      return res.status(400).json({ error: 'Only sent contracts can be declined' });
    }

    // Update contract status
    const updated = await Contract.updateStatus(contractId, 'declined', {
      cancellation_reason: reason
    });
    if (!updated) {
      return res.status(400).json({ error: 'Failed to update contract status' });
    }

    // Get manager user info for notification
    const managerProfile = await ManagerProfile.findById(contract.manager_id).populate('user_id');
    
    // Create notification for manager
    await Notification.create({
      user_id: managerProfile.user_id._id,
      type: 'contract_declined',
      title: 'Contract Declined',
      message: `Your contract for "${contract.title}" has been declined.${reason ? ' Reason: ' + reason : ''}`,
      data: {
        contract_id: contractId,
        job_id: contract.job_id,
        reason: reason
      }
    });

    res.json({
      success: true,
      message: 'Contract declined successfully'
    });

  } catch (error) {
    console.error('Contract decline error:', error);
    res.status(500).json({
      error: 'Failed to decline contract',
      details: error.message
    });
  }
});

module.exports = router;
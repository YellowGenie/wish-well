const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { body, validationResult, param } = require('express-validator');
const Contract = require('../models/Contract');
const ManagerProfile = require('../models/ManagerProfile');
const TalentProfile = require('../models/TalentProfile');
const Notification = require('../models/Notification');

// Submit milestone work (talent only)
router.post('/:contract_id/milestones/:milestone_id/submit', auth, [
  param('contract_id').isMongoId().withMessage('Valid contract ID is required'),
  param('milestone_id').isMongoId().withMessage('Valid milestone ID is required'),
  body('submission_notes').optional().isLength({ max: 1000 }).withMessage('Submission notes cannot exceed 1000 characters'),
  body('deliverable_urls').optional().isArray().withMessage('Deliverable URLs must be an array'),
  body('deliverable_urls.*').optional().isURL().withMessage('Each deliverable URL must be valid')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { contract_id, milestone_id } = req.params;
    const { submission_notes, deliverable_urls = [] } = req.body;
    
    // Get talent profile
    const talentProfile = await TalentProfile.findByUserId(req.user.id);
    if (!talentProfile) {
      return res.status(403).json({ error: 'Only talents can submit milestone work' });
    }

    // Get contract
    const contract = await Contract.findById(contract_id);
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Verify talent owns the contract
    if (contract.talent_id.toString() !== talentProfile._id.toString()) {
      return res.status(403).json({ error: 'You can only submit work for your own contracts' });
    }

    // Verify contract is active
    if (contract.status !== 'active') {
      return res.status(400).json({ error: 'Contract must be active to submit milestone work' });
    }

    // Find the milestone
    const milestone = contract.milestones.find(m => m._id.toString() === milestone_id);
    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }

    // Verify milestone is in correct status
    if (milestone.status !== 'pending' && milestone.status !== 'in_progress') {
      return res.status(400).json({ error: 'Milestone must be pending or in progress to submit work' });
    }

    // Update milestone status to submitted
    const updated = await Contract.updateMilestoneStatus(contract_id, milestone_id, 'submitted', {
      submission_notes: submission_notes,
      deliverable_urls: deliverable_urls
    });

    if (!updated) {
      return res.status(400).json({ error: 'Failed to submit milestone work' });
    }

    // Notify manager about milestone submission
    const managerProfile = await ManagerProfile.findById(contract.manager_id).populate('user_id');
    
    await Notification.create({
      user_id: managerProfile.user_id._id,
      type: 'milestone_submitted',
      title: 'Milestone Submitted',
      message: `${milestone.title} has been submitted for review in "${contract.title}".`,
      data: {
        contract_id: contract_id,
        milestone_id: milestone_id,
        submission_notes: submission_notes
      }
    });

    res.json({
      success: true,
      message: 'Milestone work submitted successfully'
    });

  } catch (error) {
    console.error('Milestone submission error:', error);
    res.status(500).json({
      error: 'Failed to submit milestone work',
      details: error.message
    });
  }
});

// Approve milestone work (manager only)
router.post('/:contract_id/milestones/:milestone_id/approve', auth, [
  param('contract_id').isMongoId().withMessage('Valid contract ID is required'),
  param('milestone_id').isMongoId().withMessage('Valid milestone ID is required'),
  body('approval_notes').optional().isLength({ max: 500 }).withMessage('Approval notes cannot exceed 500 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { contract_id, milestone_id } = req.params;
    const { approval_notes } = req.body;
    
    // Get manager profile
    const managerProfile = await ManagerProfile.findByUserId(req.user.id);
    if (!managerProfile) {
      return res.status(403).json({ error: 'Only managers can approve milestone work' });
    }

    // Get contract
    const contract = await Contract.findById(contract_id);
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Verify manager owns the contract
    if (contract.manager_id.toString() !== managerProfile._id.toString()) {
      return res.status(403).json({ error: 'You can only approve milestones for your own contracts' });
    }

    // Find the milestone
    const milestone = contract.milestones.find(m => m._id.toString() === milestone_id);
    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }

    // Verify milestone is submitted
    if (milestone.status !== 'submitted') {
      return res.status(400).json({ error: 'Only submitted milestones can be approved' });
    }

    // Update milestone status to approved
    const updated = await Contract.updateMilestoneStatus(contract_id, milestone_id, 'approved', {
      approval_notes: approval_notes
    });

    if (!updated) {
      return res.status(400).json({ error: 'Failed to approve milestone' });
    }

    // Notify talent about milestone approval
    const talentProfile = await TalentProfile.findById(contract.talent_id).populate('user_id');
    
    await Notification.create({
      user_id: talentProfile.user_id._id,
      type: 'milestone_approved',
      title: 'Milestone Approved',
      message: `${milestone.title} has been approved for "${contract.title}". Funds will be released shortly.`,
      data: {
        contract_id: contract_id,
        milestone_id: milestone_id,
        approval_notes: approval_notes
      }
    });

    res.json({
      success: true,
      message: 'Milestone approved successfully'
    });

  } catch (error) {
    console.error('Milestone approval error:', error);
    res.status(500).json({
      error: 'Failed to approve milestone',
      details: error.message
    });
  }
});

// Request revision for milestone work (manager only)
router.post('/:contract_id/milestones/:milestone_id/request-revision', auth, [
  param('contract_id').isMongoId().withMessage('Valid contract ID is required'),
  param('milestone_id').isMongoId().withMessage('Valid milestone ID is required'),
  body('revision_notes').isLength({ min: 10, max: 1000 }).withMessage('Revision notes must be between 10-1000 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { contract_id, milestone_id } = req.params;
    const { revision_notes } = req.body;
    
    // Get manager profile
    const managerProfile = await ManagerProfile.findByUserId(req.user.id);
    if (!managerProfile) {
      return res.status(403).json({ error: 'Only managers can request milestone revisions' });
    }

    // Get contract
    const contract = await Contract.findById(contract_id);
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Verify manager owns the contract
    if (contract.manager_id.toString() !== managerProfile._id.toString()) {
      return res.status(403).json({ error: 'You can only request revisions for your own contracts' });
    }

    // Find the milestone
    const milestone = contract.milestones.find(m => m._id.toString() === milestone_id);
    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }

    // Verify milestone is submitted
    if (milestone.status !== 'submitted') {
      return res.status(400).json({ error: 'Only submitted milestones can have revisions requested' });
    }

    // Update milestone status back to in_progress with revision notes
    const updated = await Contract.updateMilestoneStatus(contract_id, milestone_id, 'in_progress', {
      revision_notes: revision_notes,
      revision_requested_at: new Date()
    });

    if (!updated) {
      return res.status(400).json({ error: 'Failed to request milestone revision' });
    }

    // Notify talent about revision request
    const talentProfile = await TalentProfile.findById(contract.talent_id).populate('user_id');
    
    await Notification.create({
      user_id: talentProfile.user_id._id,
      type: 'milestone_revision_requested',
      title: 'Milestone Revision Requested',
      message: `Revision requested for ${milestone.title} in "${contract.title}".`,
      data: {
        contract_id: contract_id,
        milestone_id: milestone_id,
        revision_notes: revision_notes
      }
    });

    res.json({
      success: true,
      message: 'Milestone revision requested successfully'
    });

  } catch (error) {
    console.error('Milestone revision request error:', error);
    res.status(500).json({
      error: 'Failed to request milestone revision',
      details: error.message
    });
  }
});

// Start working on a milestone (talent only)
router.post('/:contract_id/milestones/:milestone_id/start', auth, [
  param('contract_id').isMongoId().withMessage('Valid contract ID is required'),
  param('milestone_id').isMongoId().withMessage('Valid milestone ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { contract_id, milestone_id } = req.params;
    
    // Get talent profile
    const talentProfile = await TalentProfile.findByUserId(req.user.id);
    if (!talentProfile) {
      return res.status(403).json({ error: 'Only talents can start milestone work' });
    }

    // Get contract
    const contract = await Contract.findById(contract_id);
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Verify talent owns the contract
    if (contract.talent_id.toString() !== talentProfile._id.toString()) {
      return res.status(403).json({ error: 'You can only start work on your own contracts' });
    }

    // Verify contract is active
    if (contract.status !== 'active') {
      return res.status(400).json({ error: 'Contract must be active to start milestone work' });
    }

    // Find the milestone
    const milestone = contract.milestones.find(m => m._id.toString() === milestone_id);
    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }

    // Verify milestone is pending
    if (milestone.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending milestones can be started' });
    }

    // Update milestone status to in_progress
    const updated = await Contract.updateMilestoneStatus(contract_id, milestone_id, 'in_progress');

    if (!updated) {
      return res.status(400).json({ error: 'Failed to start milestone work' });
    }

    // Notify manager that work has started
    const managerProfile = await ManagerProfile.findById(contract.manager_id).populate('user_id');
    
    await Notification.create({
      user_id: managerProfile.user_id._id,
      type: 'milestone_started',
      title: 'Milestone Work Started',
      message: `Work has started on ${milestone.title} for "${contract.title}".`,
      data: {
        contract_id: contract_id,
        milestone_id: milestone_id
      }
    });

    res.json({
      success: true,
      message: 'Milestone work started successfully'
    });

  } catch (error) {
    console.error('Milestone start error:', error);
    res.status(500).json({
      error: 'Failed to start milestone work',
      details: error.message
    });
  }
});

// Get milestone details
router.get('/:contract_id/milestones/:milestone_id', auth, [
  param('contract_id').isMongoId().withMessage('Valid contract ID is required'),
  param('milestone_id').isMongoId().withMessage('Valid milestone ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { contract_id, milestone_id } = req.params;

    // Get contract
    const contract = await Contract.findById(contract_id);
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Check user access
    const managerProfile = await ManagerProfile.findByUserId(req.user.id);
    const talentProfile = await TalentProfile.findByUserId(req.user.id);
    
    const hasAccess = (
      (managerProfile && contract.manager_id.toString() === managerProfile._id.toString()) ||
      (talentProfile && contract.talent_id.toString() === talentProfile._id.toString())
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Find the milestone
    const milestone = contract.milestones.find(m => m._id.toString() === milestone_id);
    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }

    res.json({ 
      milestone: milestone,
      contract_title: contract.title,
      contract_status: contract.status
    });

  } catch (error) {
    console.error('Milestone retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve milestone',
      details: error.message
    });
  }
});

// Get all milestones for a contract
router.get('/:contract_id/milestones', auth, [
  param('contract_id').isMongoId().withMessage('Valid contract ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { contract_id } = req.params;

    // Get contract
    const contract = await Contract.findById(contract_id);
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Check user access
    const managerProfile = await ManagerProfile.findByUserId(req.user.id);
    const talentProfile = await TalentProfile.findByUserId(req.user.id);
    
    const hasAccess = (
      (managerProfile && contract.manager_id.toString() === managerProfile._id.toString()) ||
      (talentProfile && contract.talent_id.toString() === talentProfile._id.toString())
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Only include milestones if payment type is milestone
    if (contract.payment_type !== 'milestone') {
      return res.status(400).json({ error: 'This contract does not use milestone-based payments' });
    }

    res.json({ 
      milestones: contract.milestones,
      contract_title: contract.title,
      contract_status: contract.status,
      total_milestones: contract.milestones.length,
      completed_milestones: contract.milestones.filter(m => m.status === 'paid').length,
      pending_milestones: contract.milestones.filter(m => m.status === 'pending').length,
      in_progress_milestones: contract.milestones.filter(m => m.status === 'in_progress').length
    });

  } catch (error) {
    console.error('Milestones retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve milestones',
      details: error.message
    });
  }
});

module.exports = router;
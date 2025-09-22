const { body, validationResult } = require('express-validator');
const Proposal = require('../models/Proposal');
const TalentProfile = require('../models/TalentProfile');
const ManagerProfile = require('../models/ManagerProfile');
const Job = require('../models/Job');

class ProposalController {
  static validateCreateProposal = [
    body('cover_letter').trim().isLength({ min: 50 }).withMessage('Cover letter must be at least 50 characters long'),
    body('bid_amount').isFloat({ min: 0 }).withMessage('Bid amount must be a valid positive number'),
    body('timeline_days').optional().isInt({ min: 1 }).withMessage('Timeline must be at least 1 day'),
    body('draft_offering').optional().trim().isLength({ min: 10 }).withMessage('Draft offering must be at least 10 characters long'),
    body('pricing_details').optional().trim(),
    body('availability').optional().trim()
  ];

  static validateUpdateProposal = [
    body('cover_letter').optional().trim().isLength({ min: 50 }),
    body('bid_amount').optional().isFloat({ min: 0 }),
    body('timeline_days').optional().isInt({ min: 1 }),
    body('draft_offering').optional().trim().isLength({ min: 10 }),
    body('pricing_details').optional().trim(),
    body('availability').optional().trim(),
    body('status').optional().isIn(['pending', 'accepted', 'rejected', 'withdrawn', 'interview', 'approved', 'no_longer_accepting', 'inappropriate'])
  ];

  static async createProposal(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { job_id } = req.params;
      const { cover_letter, bid_amount, timeline_days, draft_offering, pricing_details, availability } = req.body;

      // Check if job exists and is open
      const job = await Job.findById(job_id);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      if (job.status !== 'open') {
        return res.status(400).json({ error: 'Job is not accepting proposals' });
      }

      // Get talent profile
      const talentProfile = await TalentProfile.findByUserId(req.user.id);
      if (!talentProfile) {
        return res.status(400).json({ error: 'Talent profile not found' });
      }

      // Check if talent has already submitted a proposal for this job
      const hasExisting = await Proposal.hasExistingProposal(job_id, talentProfile.id);
      if (hasExisting) {
        return res.status(400).json({ error: 'You have already submitted a proposal for this job' });
      }

      const proposalData = {
        job_id: job_id,
        talent_id: talentProfile.id,
        cover_letter,
        bid_amount,
        timeline_days,
        draft_offering,
        pricing_details,
        availability
      };

      const proposalId = await Proposal.create(proposalData);

      res.status(201).json({
        message: 'Proposal submitted successfully',
        proposal_id: proposalId
      });
    } catch (error) {
      if (error.message.includes('already submitted')) {
        return res.status(400).json({ error: error.message });
      }
      if (error.code === 11000 && error.message.includes('job_id_1_talent_id_1')) {
        return res.status(400).json({ error: 'You have already submitted a proposal for this job' });
      }
      console.error('Create proposal error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getProposal(req, res) {
    try {
      const { id } = req.params;
      const proposal = await Proposal.findById(id);
      
      if (!proposal) {
        return res.status(404).json({ error: 'Proposal not found' });
      }

      // Check if user has access to view this proposal
      const canView = await ProposalController.canUserAccessProposal(proposal, req.user);
      if (!canView) {
        return res.status(403).json({ error: 'Not authorized to view this proposal' });
      }

      res.json({ proposal });
    } catch (error) {
      console.error('Get proposal error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async updateProposal(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const proposal = await Proposal.findById(id);
      
      if (!proposal) {
        return res.status(404).json({ error: 'Proposal not found' });
      }

      // Check if user owns this proposal
      const talentProfile = await TalentProfile.findByUserId(req.user.id);
      if (!talentProfile || proposal.talent_id !== talentProfile.id) {
        return res.status(403).json({ error: 'Not authorized to update this proposal' });
      }

      // Only allow updates if proposal is still pending
      if (proposal.status !== 'pending') {
        return res.status(400).json({ error: 'Cannot update proposal that is not pending' });
      }

      const updated = await Proposal.update(id, req.body);
      
      if (!updated) {
        return res.status(400).json({ error: 'No changes made' });
      }

      res.json({ message: 'Proposal updated successfully' });
    } catch (error) {
      console.error('Update proposal error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async deleteProposal(req, res) {
    try {
      const { id } = req.params;
      const proposal = await Proposal.findById(id);
      
      if (!proposal) {
        return res.status(404).json({ error: 'Proposal not found' });
      }

      // Check if user owns this proposal
      const talentProfile = await TalentProfile.findByUserId(req.user.id);
      if (!talentProfile || proposal.talent_id !== talentProfile.id) {
        return res.status(403).json({ error: 'Not authorized to delete this proposal' });
      }

      // Only allow deletion if proposal is still pending
      if (proposal.status !== 'pending') {
        return res.status(400).json({ error: 'Cannot delete proposal that is not pending' });
      }

      const deleted = await Proposal.delete(id);
      
      if (!deleted) {
        return res.status(400).json({ error: 'Failed to delete proposal' });
      }

      res.json({ message: 'Proposal deleted successfully' });
    } catch (error) {
      console.error('Delete proposal error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getJobProposals(req, res) {
    try {
      const { job_id } = req.params;
      const { page = 1, limit = 20 } = req.query;

      // Check if job exists and user is the manager
      const job = await Job.findById(job_id);

      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      const managerProfile = await ManagerProfile.findByUserId(req.user.id);

      // Handle both ObjectId and populated object cases
      const jobManagerId = job.manager_id._id ? job.manager_id._id.toString() : job.manager_id.toString();
      const currentManagerId = managerProfile.id.toString();

      if (!managerProfile || jobManagerId !== currentManagerId) {
        return res.status(403).json({ error: 'Not authorized to view proposals for this job' });
      }

      const result = await Proposal.getProposalsByJob(
        job_id,
        parseInt(page),
        parseInt(limit)
      );

      res.json(result);
    } catch (error) {
      console.error('Get job proposals error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getMyProposals(req, res) {
    try {
      const { page = 1, limit = 20 } = req.query;

      // Get talent profile
      const talentProfile = await TalentProfile.findByUserId(req.user.id);
      if (!talentProfile) {
        return res.status(400).json({ error: 'Talent profile not found' });
      }

      const result = await Proposal.getProposalsByTalent(
        talentProfile.id,
        parseInt(page),
        parseInt(limit)
      );

      res.json(result);
    } catch (error) {
      console.error('Get my proposals error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async acceptProposal(req, res) {
    try {
      const { id } = req.params;

      // Get manager profile
      const managerProfile = await ManagerProfile.findByUserId(req.user.id);
      if (!managerProfile) {
        return res.status(400).json({ error: 'Manager profile not found' });
      }

      const success = await Proposal.acceptProposal(id, managerProfile.id);
      
      if (!success) {
        return res.status(400).json({ error: 'Failed to accept proposal' });
      }

      res.json({ message: 'Proposal accepted successfully' });
    } catch (error) {
      if (error.message.includes('not found') || error.message.includes('Unauthorized')) {
        return res.status(404).json({ error: error.message });
      }
      console.error('Accept proposal error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async rejectProposal(req, res) {
    try {
      const { id } = req.params;

      // Get manager profile
      const managerProfile = await ManagerProfile.findByUserId(req.user.id);
      if (!managerProfile) {
        return res.status(400).json({ error: 'Manager profile not found' });
      }

      const success = await Proposal.rejectProposal(id, managerProfile.id);
      
      if (!success) {
        return res.status(400).json({ error: 'Failed to reject proposal' });
      }

      res.json({ message: 'Proposal rejected successfully' });
    } catch (error) {
      if (error.message.includes('not found') || error.message.includes('Unauthorized')) {
        return res.status(404).json({ error: error.message });
      }
      console.error('Reject proposal error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async withdrawProposal(req, res) {
    try {
      const { id } = req.params;

      // Get talent profile
      const talentProfile = await TalentProfile.findByUserId(req.user.id);
      if (!talentProfile) {
        return res.status(400).json({ error: 'Talent profile not found' });
      }

      const success = await Proposal.withdrawProposal(id, talentProfile.id);
      
      if (!success) {
        return res.status(400).json({ error: 'Failed to withdraw proposal' });
      }

      res.json({ message: 'Proposal withdrawn successfully' });
    } catch (error) {
      if (error.message.includes('not found') || error.message.includes('cannot be withdrawn')) {
        return res.status(404).json({ error: error.message });
      }
      console.error('Withdraw proposal error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async updateProposalStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      // Get manager profile
      const managerProfile = await ManagerProfile.findByUserId(req.user.id);
      if (!managerProfile) {
        return res.status(400).json({ error: 'Manager profile not found' });
      }

      const success = await Proposal.updateProposalStatus(id, status, managerProfile.id);
      
      if (!success) {
        return res.status(400).json({ error: 'Failed to update proposal status' });
      }

      res.json({ message: `Proposal status updated to ${status} successfully` });
    } catch (error) {
      if (error.message.includes('not found') || error.message.includes('Unauthorized') || error.message.includes('Invalid')) {
        return res.status(400).json({ error: error.message });
      }
      console.error('Update proposal status error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async markProposalsAsViewed(req, res) {
    try {
      const { job_id } = req.params;

      // Get manager profile
      const managerProfile = await ManagerProfile.findByUserId(req.user.id);
      if (!managerProfile) {
        return res.status(400).json({ error: 'Manager profile not found' });
      }

      const affectedRows = await Job.markProposalsAsViewed(job_id, managerProfile.id);
      
      res.json({ 
        message: 'Proposals marked as viewed successfully',
        affected_proposals: affectedRows
      });
    } catch (error) {
      if (error.message.includes('not found') || error.message.includes('unauthorized')) {
        return res.status(404).json({ error: error.message });
      }
      console.error('Mark proposals as viewed error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getTotalNewProposals(req, res) {
    try {
      // Get manager profile
      const managerProfile = await ManagerProfile.findByUserId(req.user.id);
      if (!managerProfile) {
        return res.status(400).json({ error: 'Manager profile not found' });
      }

      const totalNewProposals = await Job.getTotalNewProposalsForManager(managerProfile.id);
      
      res.json({ total_new_proposals: totalNewProposals });
    } catch (error) {
      console.error('Get total new proposals error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getProposalsByStatus(req, res) {
    try {
      const { job_id, status } = req.params;
      const { page = 1, limit = 20 } = req.query;

      // Check if job exists and user is the manager
      const job = await Job.findById(job_id);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      const managerProfile = await ManagerProfile.findByUserId(req.user.id);

      // Handle both ObjectId and populated object cases
      const jobManagerId = job.manager_id._id ? job.manager_id._id.toString() : job.manager_id.toString();
      const currentManagerId = managerProfile ? managerProfile.id.toString() : '';

      if (!managerProfile || jobManagerId !== currentManagerId) {
        return res.status(403).json({ error: 'Not authorized to view proposals for this job' });
      }

      const result = await Proposal.getProposalsByStatus(
        job_id,
        status,
        parseInt(page),
        parseInt(limit)
      );

      res.json(result);
    } catch (error) {
      console.error('Get proposals by status error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Helper method to check if user can access proposal
  static async getUserProposalForJob(req, res) {
    try {
      const { job_id } = req.params;

      // Get talent profile
      const talentProfile = await TalentProfile.findByUserId(req.user.id);
      if (!talentProfile) {
        return res.json({ proposal: null });
      }

      // Find the user's proposal for this job
      const proposal = await Proposal.findUserProposalForJob(job_id, talentProfile.id);

      res.json({ proposal });
    } catch (error) {
      console.error('Get user proposal for job error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async canUserAccessProposal(proposal, user) {
    try {
      // Check if user is the talent who submitted the proposal
      const talentProfile = await TalentProfile.findByUserId(user.id);
      if (talentProfile && proposal.talent_id === talentProfile.id) {
        return true;
      }

      // Check if user is the manager of the job
      const managerProfile = await ManagerProfile.findByUserId(user.id);
      if (managerProfile) {
        const job = await Job.findById(proposal.job_id);
        if (job && job.manager_id === managerProfile.id) {
          return true;
        }
      }

      // Admin can access all proposals
      if (user.role === 'admin') {
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error checking proposal access:', error);
      return false;
    }
  }
}

module.exports = ProposalController;
const express = require('express');
const ProposalController = require('../controllers/proposalController');
const { auth, requireTalent, requireManager, requireManagerOrTalent } = require('../middleware/auth');

const router = express.Router();

// Talent routes
router.post('/jobs/:job_id/proposals', auth, requireTalent, ProposalController.validateCreateProposal, ProposalController.createProposal);
router.get('/talent/my-proposals', auth, requireTalent, ProposalController.getMyProposals);
router.put('/:id', auth, requireTalent, ProposalController.validateUpdateProposal, ProposalController.updateProposal);
router.delete('/:id', auth, requireTalent, ProposalController.deleteProposal);
router.post('/:id/withdraw', auth, requireTalent, ProposalController.withdrawProposal);

// Manager routes
router.get('/jobs/:job_id/proposals', auth, requireManager, ProposalController.getJobProposals);
router.get('/jobs/:job_id/proposals/:status', auth, requireManager, ProposalController.getProposalsByStatus);
router.post('/:id/accept', auth, requireManager, ProposalController.acceptProposal);
router.post('/:id/reject', auth, requireManager, ProposalController.rejectProposal);
router.put('/:id/status', auth, requireManager, ProposalController.validateUpdateProposal, ProposalController.updateProposalStatus);
router.post('/jobs/:job_id/mark-viewed', auth, requireManager, ProposalController.markProposalsAsViewed);
router.get('/manager/new-proposals-count', auth, requireManager, ProposalController.getTotalNewProposals);

// Shared routes (talent and manager can view their own proposals)
router.get('/:id', auth, requireManagerOrTalent, ProposalController.getProposal);

module.exports = router;
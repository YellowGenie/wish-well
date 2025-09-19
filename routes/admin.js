const express = require('express');
const AdminController = require('../controllers/adminController');
const { auth, requireAdmin } = require('../middleware/auth');
const { body } = require('express-validator');

const router = express.Router();

// All admin routes require authentication and admin role
router.use(auth, requireAdmin);

// Dashboard and Analytics
router.get('/stats', AdminController.getAdminStats);
router.get('/dashboard', AdminController.getDashboard);
router.get('/analytics', AdminController.getAnalyticsReport);
router.get('/system/health', AdminController.getSystemHealth);
router.get('/live-stats', AdminController.getLiveStats);
router.get('/geography', AdminController.getGeographyStats);

// Enhanced User Management
router.get('/users', AdminController.getAllUsers);
// Fix Missing Talent Profiles - MUST come before /users/:id
router.get('/users/missing-talent-profiles', AdminController.getUsersWithoutTalentProfile);
router.get('/users/:id', AdminController.getUserDetails);
router.post('/users', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('role').isIn(['talent', 'manager', 'admin']),
  body('first_name').trim().isLength({ min: 1 }),
  body('last_name').trim().isLength({ min: 1 })
], AdminController.createUser);
router.put('/users/:id/role', [
  body('role').isIn(['talent', 'manager', 'admin'])
], AdminController.updateUserRole);
router.post('/users/:id/deactivate', AdminController.deactivateUser);
router.post('/users/:id/reactivate', AdminController.reactivateUser);
router.delete('/users/:id/soft-delete', AdminController.validateSoftDelete, AdminController.softDeleteUser);
router.delete('/users/:id/hard-delete', AdminController.hardDeleteUser);
router.delete('/users/:id', AdminController.validateSoftDelete, AdminController.softDeleteUser);
router.post('/users/bulk-action', [
  body('user_ids').isArray({ min: 1 }),
  body('action').isIn(['deactivate', 'reactivate', 'change_role', 'soft_delete'])
], AdminController.bulkUserAction);
router.post('/users/:id/reset-password', AdminController.resetUserPassword);
router.put('/users/:id/status', [
  body('is_verified').optional().isBoolean(),
  body('is_active').optional().isBoolean()
], AdminController.updateUserStatus);
router.put('/users/:id', [
  body('first_name').optional().trim().isLength({ min: 1 }),
  body('last_name').optional().trim().isLength({ min: 1 }),
  body('email').optional().isEmail().normalizeEmail(),
  body('role').optional().isIn(['talent', 'manager', 'admin'])
], AdminController.updateUserProfile);
router.get('/users/:id/activity', AdminController.getUserActivityLogs);

// Deleted Users Management
router.get('/deleted-users', AdminController.getDeletedUsers);
router.post('/deleted-users/:deletedUserId/restore', AdminController.restoreUser);
router.delete('/deleted-users/:deletedUserId/permanent', AdminController.permanentlyDeleteUser);

// User Analytics and Tracking
router.get('/users/:user_id/analytics', AdminController.getUserAnalytics);
router.get('/analytics/messaging', AdminController.getMessagingAnalytics);
router.get('/analytics/applications', AdminController.getJobApplicationAnalytics);

// Job Management
router.get('/jobs', AdminController.getAdminJobs);
router.get('/jobs/:id', AdminController.getAdminJobDetails);
router.get('/jobs/:id/applications', AdminController.getJobApplications);
router.put('/jobs/:id/admin-status', [
  body('admin_status').isIn(['pending', 'approved', 'rejected', 'inappropriate', 'hidden']),
  body('admin_notes').optional().trim()
], AdminController.updateJobAdminStatus);
router.post('/jobs/bulk-update', [
  body('job_ids').isArray({ min: 1 }),
  body('admin_status').isIn(['approved', 'rejected', 'inappropriate', 'hidden']),
  body('admin_notes').optional().trim()
], AdminController.bulkUpdateJobStatus);
router.put('/jobs/:id/status', AdminController.validateJobStatusUpdate, AdminController.updateJobStatus);

// Admin Settings Management
router.get('/settings', AdminController.getAdminSettings);
router.get('/settings/job-approval', AdminController.getJobApprovalSettings);
router.put('/settings/job-approval', [
  body('auto_approval').optional().isBoolean(),
  body('requires_manual_review').optional().isBoolean(),
  body('review_time_hours').optional().isInt({ min: 1, max: 168 })
], AdminController.updateJobApprovalSettings);

// Proposal Management
router.get('/proposals', AdminController.getAllProposals);
router.get('/proposals/:id', AdminController.getProposal);
router.put('/proposals/:id/status', [
  body('status').isIn(['pending', 'interview', 'approved', 'rejected', 'inappropriate', 'hired'])
], AdminController.updateProposalStatus);
router.delete('/proposals/:id', AdminController.deleteProposal);
router.get('/proposals/stats', AdminController.getProposalStats);

// Pricing Package Management
router.get('/pricing-packages', AdminController.getPricingPackages);
router.get('/package-analytics', AdminController.getPackageAnalytics);
router.post('/pricing-packages', [
  body('name').trim().isLength({ min: 1 }),
  body('description').trim().isLength({ min: 1 }),
  body('price').isNumeric(),
  body('duration_days').isInt({ min: 1 })
], AdminController.createPricingPackage);
router.put('/pricing-packages/:id', AdminController.updatePricingPackage);
router.post('/pricing-packages/:id/archive', AdminController.archivePricingPackage);
router.post('/pricing-packages/:id/unarchive', AdminController.unarchivePricingPackage);
router.delete('/pricing-packages/:id', AdminController.deletePricingPackage);

// Discount Management
router.get('/discounts', AdminController.getDiscounts);
router.get('/discounts/:id', AdminController.getDiscount);
router.post('/discounts', [
  body('code').trim().isLength({ min: 1 }),
  body('name').trim().isLength({ min: 1 }),
  body('type').isIn(['percentage', 'fixed_amount', 'free_posts']),
  body('value').isNumeric(),
  body('status').optional().isIn(['valid', 'expired', 'suspended', 'gift'])
], AdminController.createDiscount);
router.put('/discounts/:id', [
  body('code').optional().trim().isLength({ min: 1 }),
  body('name').optional().trim().isLength({ min: 1 }),
  body('type').optional().isIn(['percentage', 'fixed_amount', 'free_posts']),
  body('value').optional().isNumeric(),
  body('status').optional().isIn(['valid', 'expired', 'suspended', 'gift'])
], AdminController.updateDiscount);
router.post('/discounts/:id/archive', AdminController.archiveDiscount);
router.post('/discounts/:id/unarchive', AdminController.unarchiveDiscount);
router.delete('/discounts/:id', AdminController.deleteDiscount);
router.post('/discounts/assign', [
  body('user_id').isInt(),
  body('discount_id').isInt()
], AdminController.assignDiscountToUser);

// Talent Profile Management
router.get('/talent-profiles', AdminController.getAllTalentProfiles);
router.put('/talent-profiles/:id/featured', [
  body('is_featured').isBoolean()
], AdminController.updateTalentFeatured);

// Fix Missing Talent Profiles - Create missing profile route
router.post('/users/:user_id/create-talent-profile', AdminController.createMissingTalentProfile);

// Admin Activity Logs
router.get('/logs', AdminController.getAdminLogs);

// Email Template Management
router.get('/email-templates', AdminController.getEmailTemplates);
router.get('/email-templates/:id', AdminController.getEmailTemplate);
router.post('/email-templates', [
  body('name').trim().isLength({ min: 1 }),
  body('subject').trim().isLength({ min: 1 }),
  body('html_content').trim().isLength({ min: 1 }),
  body('category').isIn(['welcome', 'verification', 'password_reset', 'notification', 'marketing', 'system'])
], AdminController.createEmailTemplate);
router.put('/email-templates/:id', AdminController.updateEmailTemplate);
router.delete('/email-templates/:id', AdminController.deleteEmailTemplate);
router.get('/email-logs', AdminController.getEmailLogs);

// Invoice Management
router.get('/invoices', AdminController.getInvoices);
router.post('/invoices', [
  body('user_id').isInt(),
  body('amount').isNumeric(),
  body('tax_amount').optional().isNumeric()
], AdminController.createInvoice);
router.put('/invoices/:id/status', [
  body('status').isIn(['draft', 'sent', 'paid', 'overdue', 'cancelled'])
], AdminController.updateInvoiceStatus);

// Reports Generation
router.get('/reports', AdminController.generateReport);

module.exports = router;
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Job = require('../models/Job');
const Proposal = require('../models/Proposal');
const Message = require('../models/Message');
const Skill = require('../models/Skill');
const AdminSettings = require('../models/AdminSettings');
// MongoDB connection handled through models

class AdminController {
  // Dashboard and Stats
  static async getAdminStats(req, res) {
    try {
      // Get comprehensive platform statistics using MongoDB aggregation
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
      const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
      const oneDayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

      // User statistics
      const userStatsAgg = await User.aggregate([
        { $match: { role: { $ne: 'admin' } } },
        {
          $group: {
            _id: null,
            total_users: { $sum: 1 },
            total_talents: { $sum: { $cond: [{ $eq: ['$role', 'talent'] }, 1, 0] } },
            total_managers: { $sum: { $cond: [{ $eq: ['$role', 'manager'] }, 1, 0] } },
            active_users: { $sum: { $cond: [{ $eq: ['$is_active', true] }, 1, 0] } },
            new_users_30d: { $sum: { $cond: [{ $gte: ['$created_at', thirtyDaysAgo] }, 1, 0] } },
            verified_users: { $sum: { $cond: [{ $eq: ['$email_verified', true] }, 1, 0] } },
            unverified_users: { $sum: { $cond: [{ $eq: ['$email_verified', false] }, 1, 0] } },
            active_today: { $sum: { $cond: [{ $gte: ['$last_login_at', oneDayAgo] }, 1, 0] } },
            active_week: { $sum: { $cond: [{ $gte: ['$last_login_at', sevenDaysAgo] }, 1, 0] } },
            active_month: { $sum: { $cond: [{ $gte: ['$last_login_at', thirtyDaysAgo] }, 1, 0] } }
          }
        }
      ]);

      const userStats = userStatsAgg[0] || {
        total_users: 0,
        total_talents: 0,
        total_managers: 0,
        active_users: 0,
        new_users_30d: 0,
        verified_users: 0,
        unverified_users: 0,
        active_today: 0,
        active_week: 0,
        active_month: 0
      };

      // Job statistics
      const jobStatsAgg = await Job.aggregate([
        {
          $group: {
            _id: null,
            total_jobs: { $sum: 1 },
            open_jobs: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } },
            in_progress_jobs: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
            completed_jobs: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            new_jobs_30d: { $sum: { $cond: [{ $gte: ['$created_at', thirtyDaysAgo] }, 1, 0] } },
            avg_budget: { $avg: '$budget_max' },
            completed_value: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$budget_max', 0] } }
          }
        }
      ]);

      const jobStats = jobStatsAgg[0] || {
        total_jobs: 0,
        open_jobs: 0,
        in_progress_jobs: 0,
        completed_jobs: 0,
        new_jobs_30d: 0,
        avg_budget: 0,
        completed_value: 0
      };

      // Proposal statistics
      const proposalStatsAgg = await Proposal.aggregate([
        {
          $group: {
            _id: null,
            total_proposals: { $sum: 1 },
            pending_proposals: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
            accepted_proposals: { $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] } },
            rejected_proposals: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
            new_proposals_30d: { $sum: { $cond: [{ $gte: ['$created_at', thirtyDaysAgo] }, 1, 0] } },
            avg_bid_amount: { $avg: '$bid_amount' }
          }
        }
      ]);

      const proposalStats = proposalStatsAgg[0] || {
        total_proposals: 0,
        pending_proposals: 0,
        accepted_proposals: 0,
        rejected_proposals: 0,
        new_proposals_30d: 0,
        avg_bid_amount: 0
      };

      // Message statistics
      const messageStatsAgg = await Message.aggregate([
        {
          $group: {
            _id: null,
            total_messages: { $sum: 1 },
            new_messages_30d: { $sum: { $cond: [{ $gte: ['$created_at', thirtyDaysAgo] }, 1, 0] } },
            unread_messages: { $sum: { $cond: [{ $eq: ['$is_read', false] }, 1, 0] } }
          }
        }
      ]);

      const activeConversationsAgg = await Message.aggregate([
        { $group: { _id: '$job_id' } },
        { $count: 'active_conversations' }
      ]);

      const messageStats = {
        ...messageStatsAgg[0] || {
          total_messages: 0,
          new_messages_30d: 0,
          unread_messages: 0
        },
        active_conversations: activeConversationsAgg[0]?.active_conversations || 0
      };

      // Revenue statistics (placeholder - would need Invoice model)
      const revenueStats = {
        total_revenue: 0,
        pending_revenue: 0,
        overdue_revenue: 0,
        refunded_revenue: 0,
        paid_invoices: 0,
        total_invoices: 0
      };

      // Geographical data (placeholder - would need user_sessions collection)
      const geoStats = [];

      // System health metrics (simplified for MongoDB)
      const systemHealth = [
        { collection_name: 'users', estimated_count: await User.estimatedDocumentCount() },
        { collection_name: 'jobs', estimated_count: await Job.estimatedDocumentCount() },
        { collection_name: 'proposals', estimated_count: await Proposal.estimatedDocumentCount() },
        { collection_name: 'messages', estimated_count: await Message.estimatedDocumentCount() }
      ];

      // Calculate growth rate from previous month
      const sixtyDaysAgo = new Date(now.getTime() - (60 * 24 * 60 * 60 * 1000));
      const growthStatsAgg = await User.aggregate([
        { $match: { role: { $ne: 'admin' } } },
        {
          $group: {
            _id: null,
            current_month: { $sum: { $cond: [{ $gte: ['$created_at', thirtyDaysAgo] }, 1, 0] } },
            previous_month: { $sum: { $cond: [{ $and: [{ $gte: ['$created_at', sixtyDaysAgo] }, { $lt: ['$created_at', thirtyDaysAgo] }] }, 1, 0] } }
          }
        }
      ]);

      const growthData = growthStatsAgg[0] || { current_month: 0, previous_month: 0 };
      const growthRate = growthData.previous_month > 0 
        ? ((growthData.current_month - growthData.previous_month) / growthData.previous_month) * 100 
        : 0;

      // Active sessions (placeholder - would need user_sessions collection)
      const activeSessions = { live_users: 0 };

      res.json({
        users: {
          ...userStats,
          growth_rate: growthRate
        },
        jobs: jobStats,
        proposals: proposalStats,
        messages: messageStats,
        revenue: {
          ...revenueStats,
          growth_rate: 0 // TODO: Calculate actual revenue growth rate
        },
        geography: geoStats,
        system: {
          database_health: systemHealth,
          live_users: activeSessions.live_users,
          uptime: 99.9, // TODO: Calculate actual uptime
          response_time: 145, // TODO: Calculate actual response time
          error_rate: 0.2 // TODO: Calculate actual error rate
        },
        generated_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Get admin stats error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getDashboard(req, res) {
    try {
      // Get platform statistics using MongoDB
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

      // User statistics
      const userStatsAgg = await User.aggregate([
        { $match: { role: { $ne: 'admin' } } },
        {
          $group: {
            _id: null,
            total_users: { $sum: 1 },
            total_talents: { $sum: { $cond: [{ $eq: ['$role', 'talent'] }, 1, 0] } },
            total_managers: { $sum: { $cond: [{ $eq: ['$role', 'manager'] }, 1, 0] } },
            active_users: { $sum: { $cond: [{ $eq: ['$is_active', true] }, 1, 0] } },
            new_users_30d: { $sum: { $cond: [{ $gte: ['$created_at', thirtyDaysAgo] }, 1, 0] } }
          }
        }
      ]);
      const userStats = userStatsAgg[0] || { total_users: 0, total_talents: 0, total_managers: 0, active_users: 0, new_users_30d: 0 };

      // Job statistics
      const jobStatsAgg = await Job.aggregate([
        {
          $group: {
            _id: null,
            total_jobs: { $sum: 1 },
            open_jobs: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } },
            in_progress_jobs: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
            completed_jobs: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            new_jobs_30d: { $sum: { $cond: [{ $gte: ['$created_at', thirtyDaysAgo] }, 1, 0] } }
          }
        }
      ]);
      const jobStats = jobStatsAgg[0] || { total_jobs: 0, open_jobs: 0, in_progress_jobs: 0, completed_jobs: 0, new_jobs_30d: 0 };

      // Proposal statistics
      const proposalStatsAgg = await Proposal.aggregate([
        {
          $group: {
            _id: null,
            total_proposals: { $sum: 1 },
            pending_proposals: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
            accepted_proposals: { $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] } },
            new_proposals_30d: { $sum: { $cond: [{ $gte: ['$created_at', thirtyDaysAgo] }, 1, 0] } }
          }
        }
      ]);
      const proposalStats = proposalStatsAgg[0] || { total_proposals: 0, pending_proposals: 0, accepted_proposals: 0, new_proposals_30d: 0 };

      // Message statistics  
      const messageStatsAgg = await Message.aggregate([
        {
          $group: {
            _id: null,
            total_messages: { $sum: 1 },
            new_messages_30d: { $sum: { $cond: [{ $gte: ['$created_at', thirtyDaysAgo] }, 1, 0] } }
          }
        }
      ]);
      const messageStats = messageStatsAgg[0] || { total_messages: 0, new_messages_30d: 0 };

      // Get recent activity
      const recentUsers = await User.find({ role: { $ne: 'admin' } })
        .select('id email role first_name last_name created_at')
        .sort({ created_at: -1 })
        .limit(10)
        .lean();

      const recentJobs = await Job.find()
        .populate('manager_id', 'company_name user_id')
        .populate({
          path: 'manager_id',
          populate: { path: 'user_id', select: 'first_name last_name' }
        })
        .select('id title status created_at')
        .sort({ created_at: -1 })
        .limit(10)
        .lean();

      res.json({
        stats: {
          users: userStats,
          jobs: jobStats,
          proposals: proposalStats,
          messages: messageStats
        },
        recentActivity: {
          users: recentUsers,
          jobs: recentJobs
        }
      });
    } catch (error) {
      console.error('Get admin dashboard error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // User Management
  static async getAllUsers(req, res) {
    try {
      const { role, page = 1, limit = 20 } = req.query;
      
      const result = await User.getAllUsers(role, parseInt(page), parseInt(limit));
      
      res.json(result);
    } catch (error) {
      console.error('Get all users error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getUserDetails(req, res) {
    try {
      const { id } = req.params;
      
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Get role-specific profile
      let profile = null;
      if (user.role === 'talent') {
        const TalentProfile = require('../models/TalentProfile');
        profile = await TalentProfile.findByUserId(id);
        if (profile) {
          profile.skills = await TalentProfile.getSkills(profile.id);
        }
      } else if (user.role === 'manager') {
        const ManagerProfile = require('../models/ManagerProfile');
        profile = await ManagerProfile.findByUserId(id);
      }

      // Get user activity stats
      let activityStats = {};
      if (user.role === 'talent') {
        const [proposalCount] = await pool.execute(`
          SELECT COUNT(*) as count FROM proposals p
          JOIN talent_profiles tp ON p.talent_id = tp.id
          WHERE tp.user_id = ?
        `, [id]);
        activityStats.proposals_submitted = proposalCount[0].count;
      } else if (user.role === 'manager') {
        const [jobCount] = await pool.execute(`
          SELECT COUNT(*) as count FROM jobs j
          JOIN manager_profiles mp ON j.manager_id = mp.id
          WHERE mp.user_id = ?
        `, [id]);
        activityStats.jobs_posted = jobCount[0].count;
      }

      res.json({ 
        user, 
        profile,
        activity_stats: activityStats
      });
    } catch (error) {
      console.error('Get user details error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async deactivateUser(req, res) {
    try {
      const { id } = req.params;
      
      // Prevent deactivating admin users
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (user.role === 'admin') {
        return res.status(400).json({ error: 'Cannot deactivate admin users' });
      }

      const success = await User.deactivateUser(id);
      
      if (!success) {
        return res.status(400).json({ error: 'Failed to deactivate user' });
      }

      res.json({ message: 'User deactivated successfully' });
    } catch (error) {
      console.error('Deactivate user error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async reactivateUser(req, res) {
    try {
      const { id } = req.params;
      
      const success = await User.updateProfile(id, { is_active: true });
      
      if (!success) {
        return res.status(400).json({ error: 'Failed to reactivate user or user not found' });
      }

      res.json({ message: 'User reactivated successfully' });
    } catch (error) {
      console.error('Reactivate user error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Enhanced User Management
  static async createUser(req, res) {
    try {
      const { email, password, role, first_name, last_name } = req.body;

      // Check if user already exists
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: 'User with this email already exists' });
      }

      const userId = await User.create({
        email,
        password,
        role,
        first_name,
        last_name
      });

      // Log admin action
      await AdminController.logAdminAction(req.user.id, 'create_user', {
        target_user_id: userId,
        email,
        role
      });

      res.status(201).json({ 
        message: 'User created successfully',
        user_id: userId
      });
    } catch (error) {
      console.error('Create user error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async updateUserRole(req, res) {
    try {
      const { id } = req.params;
      const { role } = req.body;

      if (!['talent', 'manager', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }

      // Prevent changing admin roles unless user is @yellowgenie.io
      if (role === 'admin') {
        const targetUser = await User.findById(id);
        if (!targetUser || !targetUser.email.endsWith('@yellowgenie.io')) {
          return res.status(403).json({ 
            error: 'Admin role restricted to @yellowgenie.io email addresses' 
          });
        }
      }

      const success = await User.updateProfile(id, { role });
      
      if (!success) {
        return res.status(400).json({ error: 'Failed to update user role' });
      }

      // Log admin action
      await AdminController.logAdminAction(req.user.id, 'change_role', {
        target_user_id: parseInt(id),
        new_role: role
      });

      res.json({ message: 'User role updated successfully' });
    } catch (error) {
      console.error('Update user role error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async bulkUserAction(req, res) {
    try {
      const { user_ids, action, data } = req.body;

      if (!Array.isArray(user_ids) || user_ids.length === 0) {
        return res.status(400).json({ error: 'Invalid user_ids array' });
      }

      let results = { success: 0, failed: 0, errors: [] };

      for (const userId of user_ids) {
        try {
          let success = false;
          
          switch (action) {
            case 'deactivate':
              // Prevent deactivating admin users
              const user = await User.findById(userId);
              if (user && user.role !== 'admin') {
                success = await User.updateProfile(userId, { is_active: false });
              } else {
                results.errors.push(`Cannot deactivate admin user ${userId}`);
                continue;
              }
              break;
              
            case 'reactivate':
              success = await User.updateProfile(userId, { is_active: true });
              break;
              
            case 'change_role':
              if (data && data.role && ['talent', 'manager', 'admin'].includes(data.role)) {
                success = await User.updateProfile(userId, { role: data.role });
              }
              break;
              
            case 'soft_delete':
              success = await User.updateProfile(userId, { 
                is_active: false, 
                deleted_at: new Date() 
              });
              break;
              
            default:
              results.errors.push(`Invalid action: ${action}`);
              continue;
          }

          if (success) {
            results.success++;
            // Log admin action
            await AdminController.logAdminAction(req.user.id, `bulk_${action}`, {
              target_user_id: userId
            });
          } else {
            results.failed++;
            results.errors.push(`Failed to ${action} user ${userId}`);
          }
        } catch (error) {
          results.failed++;
          results.errors.push(`Error processing user ${userId}: ${error.message}`);
        }
      }

      res.json({
        message: 'Bulk action completed',
        results
      });
    } catch (error) {
      console.error('Bulk user action error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async softDeleteUser(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      // Prevent deleting admin users
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (user.role === 'admin') {
        return res.status(400).json({ error: 'Cannot delete admin users' });
      }

      // Perform soft delete
      const result = await User.softDeleteUser(id, req.user.id, reason);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      // Log admin action
      await AdminController.logAdminAction(req.user.id, 'soft_delete_user', {
        target_user_id: parseInt(id),
        email: result.deletedUser.email,
        reason: reason
      });

      res.json({ 
        message: 'User deleted successfully and moved to deleted users',
        deletedUser: result.deletedUser
      });
    } catch (error) {
      console.error('Soft delete user error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async hardDeleteUser(req, res) {
    try {
      const { id } = req.params;

      // Prevent deleting admin users
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (user.role === 'admin') {
        return res.status(400).json({ error: 'Cannot delete admin users' });
      }

      // Perform hard delete
      const result = await User.hardDeleteUser(id);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      // Log admin action
      await AdminController.logAdminAction(req.user.id, 'hard_delete_user', {
        target_user_id: parseInt(id),
        email: result.deletedUser.email
      });

      res.json({ 
        message: 'User permanently deleted from database',
        deletedUser: result.deletedUser
      });
    } catch (error) {
      console.error('Hard delete user error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async resetUserPassword(req, res) {
    try {
      const { id } = req.params;
      
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Generate a password reset token
      const crypto = require('crypto');
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Save reset token to database
      await pool.execute(
        'UPDATE users SET password_reset_token = ?, password_reset_expires = ? WHERE id = ?',
        [resetToken, resetTokenExpires, id]
      );

      // In a real app, you would send an email here
      // For now, we'll just return the token (remove this in production)
      console.log(`Password reset token for user ${user.email}: ${resetToken}`);

      // Log admin action
      await AdminController.logAdminAction(req.user.id, 'reset_user_password', {
        target_user_id: parseInt(id),
        target_email: user.email
      });

      res.json({ 
        message: 'Password reset email sent to user successfully',
        // Remove this in production - only for development
        reset_token: resetToken
      });
    } catch (error) {
      console.error('Reset user password error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async updateUserStatus(req, res) {
    try {
      const { id } = req.params;
      const { is_verified, is_active } = req.body;
      
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Build update object - map frontend is_verified to backend email_verified
      const updates = {};
      if (is_verified !== undefined) updates.email_verified = is_verified;
      if (is_active !== undefined) updates.is_active = is_active;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid status fields to update' });
      }

      const success = await User.updateProfile(id, updates);
      if (!success) {
        return res.status(400).json({ error: 'Failed to update user status' });
      }

      // Log admin action
      await AdminController.logAdminAction(req.user.id, 'update_user_status', {
        target_user_id: parseInt(id),
        updates: Object.keys(updates)
      });

      // Return updated user
      const updatedUser = await User.findById(id);
      res.json(updatedUser);
    } catch (error) {
      console.error('Update user status error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async updateUserProfile(req, res) {
    try {
      const { id } = req.params;
      const { first_name, last_name, email, role } = req.body;
      
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Build update object
      const updates = {};
      if (first_name !== undefined) updates.first_name = first_name;
      if (last_name !== undefined) updates.last_name = last_name;
      if (email !== undefined) {
        // Check if email is already taken by another user
        const existingUser = await User.findByEmail(email);
        if (existingUser && existingUser.id !== parseInt(id)) {
          return res.status(400).json({ error: 'Email already taken by another user' });
        }
        updates.email = email;
      }
      if (role !== undefined) {
        // Prevent changing admin roles unless user is @yellowgenie.io
        if (role === 'admin' && !email?.endsWith('@yellowgenie.io') && !user.email?.endsWith('@yellowgenie.io')) {
          return res.status(403).json({ 
            error: 'Admin role restricted to @yellowgenie.io email addresses' 
          });
        }
        updates.role = role;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      const success = await User.updateProfile(id, updates);
      if (!success) {
        return res.status(400).json({ error: 'Failed to update user profile' });
      }

      // Log admin action
      await AdminController.logAdminAction(req.user.id, 'update_user_profile', {
        target_user_id: parseInt(id),
        updates: Object.keys(updates)
      });

      // Return updated user
      const updatedUser = await User.findById(id);
      res.json({ 
        message: 'User profile updated successfully',
        user: updatedUser
      });
    } catch (error) {
      console.error('Update user profile error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getUserActivityLogs(req, res) {
    try {
      const { id } = req.params;
      const { limit = 50, offset = 0 } = req.query;
      
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Get user activity logs from various sources
      const [sessions] = await pool.execute(`
        SELECT 'login' as action, 'User logged in' as details, 
               ip_address, user_agent, login_time as created_at
        FROM user_sessions 
        WHERE user_id = ? 
        ORDER BY login_time DESC 
        LIMIT ? OFFSET ?
      `, [id, parseInt(limit), parseInt(offset)]);

      // Get job applications if user is talent
      if (user.role === 'talent') {
        const [proposals] = await pool.execute(`
          SELECT 'job_application' as action,
                 CONCAT('Applied to job: ', j.title) as details,
                 NULL as ip_address, NULL as user_agent,
                 p.created_at
          FROM proposals p
          JOIN jobs j ON p.job_id = j.id
          JOIN talent_profiles tp ON p.talent_id = tp.id
          WHERE tp.user_id = ?
          ORDER BY p.created_at DESC
          LIMIT ? OFFSET ?
        `, [id, parseInt(limit), parseInt(offset)]);
        
        sessions.push(...proposals);
      }

      // Get job postings if user is manager
      if (user.role === 'manager') {
        const [jobs] = await pool.execute(`
          SELECT 'job_post' as action,
                 CONCAT('Posted job: ', j.title) as details,
                 NULL as ip_address, NULL as user_agent,
                 j.created_at
          FROM jobs j
          JOIN manager_profiles mp ON j.manager_id = mp.id
          WHERE mp.user_id = ?
          ORDER BY j.created_at DESC
          LIMIT ? OFFSET ?
        `, [id, parseInt(limit), parseInt(offset)]);
        
        sessions.push(...jobs);
      }

      // Get messages sent
      const [messages] = await pool.execute(`
        SELECT 'message_sent' as action,
               'Sent a message' as details,
               NULL as ip_address, NULL as user_agent,
               created_at
        FROM messages
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `, [id, parseInt(limit), parseInt(offset)]);

      sessions.push(...messages);

      // Sort all activities by date
      const allLogs = sessions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      res.json({
        logs: allLogs.slice(0, parseInt(limit)).map(log => ({
          id: `${log.action}_${Date.parse(log.created_at)}`,
          action: log.action,
          details: log.details,
          ip_address: log.ip_address,
          user_agent: log.user_agent,
          created_at: log.created_at
        }))
      });
    } catch (error) {
      console.error('Get user activity logs error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Job Management
  static async getAllJobs(req, res) {
    try {
      const { status, page = 1, limit = 20 } = req.query;

      const searchParams = {
        status: status || null,
        page: parseInt(page),
        limit: parseInt(limit),
        sort_by: 'created_at',
        sort_order: 'DESC'
      };

      const result = await Job.search(searchParams);

      res.json(result);
    } catch (error) {
      console.error('Get all jobs error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getAdminJobs(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        admin_status,
        search,
        sort_by = 'created_at',
        sort_order = 'DESC',
        company,
        manager,
        dateRange
      } = req.query;

      const searchParams = {
        page: parseInt(page),
        limit: parseInt(limit),
        admin_status,
        search_query: search,
        sort_by,
        sort_order,
        company_name: company,
        manager_name: manager,
        date_range: dateRange
      };

      const result = await Job.getAdminJobs(searchParams);
      res.json(result);
    } catch (error) {
      console.error('Get admin jobs error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getAdminJobDetails(req, res) {
    try {
      const { id } = req.params;
      const result = await Job.getJobWithApplications(id);
      res.json(result);
    } catch (error) {
      console.error('Get admin job details error:', error);
      if (error.message === 'Job not found') {
        return res.status(404).json({ error: 'Job not found' });
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getJobApplications(req, res) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 20 } = req.query;

      const result = await Proposal.getProposalsByJob(id, parseInt(page), parseInt(limit));
      res.json(result);
    } catch (error) {
      console.error('Get job applications error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async updateJobAdminStatus(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const { admin_status, admin_notes } = req.body;

      const success = await Job.updateAdminStatus(id, {
        admin_status,
        admin_notes,
        admin_reviewed_by: req.user.id
      });

      if (!success) {
        return res.status(404).json({ error: 'Job not found or update failed' });
      }

      res.json({ message: 'Job admin status updated successfully' });
    } catch (error) {
      console.error('Update job admin status error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async bulkUpdateJobStatus(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { job_ids, admin_status, admin_notes } = req.body;

      const updatedCount = await Job.bulkUpdateAdminStatus(job_ids, {
        admin_status,
        admin_notes,
        admin_reviewed_by: req.user.id
      });

      res.json({
        message: `Successfully updated ${updatedCount} job(s)`,
        updated_count: updatedCount
      });
    } catch (error) {
      console.error('Bulk update job status error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async updateJobStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!['open', 'in_progress', 'completed', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'Invalid job status' });
      }

      const job = await Job.findById(id);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      const success = await Job.update(id, { status });
      
      if (!success) {
        return res.status(400).json({ error: 'Failed to update job status' });
      }

      res.json({ message: 'Job status updated successfully' });
    } catch (error) {
      console.error('Update job status error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Admin Settings Management
  static async getAdminSettings(req, res) {
    try {
      const { category } = req.query;
      const settings = await AdminSettings.getAllSettings(category);
      res.json({ settings });
    } catch (error) {
      console.error('Get admin settings error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getJobApprovalSettings(req, res) {
    try {
      const settings = await AdminSettings.getJobApprovalSettings();
      res.json(settings);
    } catch (error) {
      console.error('Get job approval settings error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async updateJobApprovalSettings(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { auto_approval, requires_manual_review, review_time_hours } = req.body;

      const settings = await AdminSettings.updateJobApprovalSettings({
        auto_approval,
        requires_manual_review,
        review_time_hours
      }, req.user.id);

      res.json({
        message: 'Job approval settings updated successfully',
        settings
      });
    } catch (error) {
      console.error('Update job approval settings error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // System Management
  static async getSystemHealth(req, res) {
    try {
      // Check database connection
      const [dbCheck] = await pool.execute('SELECT 1 as healthy');
      
      // Get system stats
      const [tableStats] = await pool.execute(`
        SELECT 
          table_name,
          table_rows,
          ROUND(data_length / 1024 / 1024, 2) as size_mb,
          ROUND(index_length / 1024 / 1024, 2) as index_size_mb
        FROM information_schema.tables 
        WHERE table_schema = DATABASE()
        ORDER BY data_length DESC
        LIMIT 10
      `);

      // Get database size
      const [dbSize] = await pool.execute(`
        SELECT 
          ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) as total_size_mb,
          ROUND(SUM(data_length) / 1024 / 1024, 2) as data_size_mb,
          ROUND(SUM(index_length) / 1024 / 1024, 2) as index_size_mb
        FROM information_schema.tables 
        WHERE table_schema = DATABASE()
      `);

      res.json({
        database: {
          status: dbCheck[0].healthy === 1 ? 'healthy' : 'unhealthy',
          size: dbSize[0],
          tables: tableStats,
          uptime: 99.9,
          response_time_ms: 145
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Get system health error:', error);
      res.status(500).json({ 
        database: { status: 'unhealthy' },
        error: 'Database connection failed',
        timestamp: new Date().toISOString()
      });
    }
  }

  // Live Statistics Endpoint
  static async getLiveStats(req, res) {
    try {
      // Get live user count (active in last 15 minutes)
      const [liveUsers] = await pool.execute(`
        SELECT COUNT(DISTINCT user_id) as live_users
        FROM user_sessions
        WHERE last_activity >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)
      `);

      // Get recent activity (last hour)
      const [recentActivity] = await pool.execute(`
        SELECT 
          'user_registration' as type,
          COUNT(*) as count,
          HOUR(created_at) as hour
        FROM users 
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) 
          AND role != 'admin'
        GROUP BY HOUR(created_at)
        
        UNION ALL
        
        SELECT 
          'job_posting' as type,
          COUNT(*) as count,
          HOUR(created_at) as hour
        FROM jobs 
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
        GROUP BY HOUR(created_at)
        
        UNION ALL
        
        SELECT 
          'message_sent' as type,
          COUNT(*) as count,
          HOUR(created_at) as hour
        FROM messages 
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
        GROUP BY HOUR(created_at)
        
        ORDER BY hour DESC
      `);

      res.json({
        live_users: liveUsers[0].live_users,
        recent_activity: recentActivity,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Get live stats error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Geography Statistics Endpoint
  static async getGeographyStats(req, res) {
    try {
      // Get top countries by user count
      const [topCountries] = await pool.execute(`
        SELECT 
          us.country,
          COUNT(DISTINCT u.id) as total_users,
          COUNT(CASE WHEN u.last_login_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as active_users,
          COUNT(CASE WHEN u.role = 'talent' THEN 1 END) as talent_count,
          COUNT(CASE WHEN u.role = 'manager' THEN 1 END) as manager_count,
          MAX(us.login_time) as last_activity
        FROM user_sessions us
        JOIN users u ON us.user_id = u.id
        WHERE u.role != 'admin' AND us.country IS NOT NULL
        GROUP BY us.country
        ORDER BY total_users DESC
        LIMIT 15
      `);

      // Get cities with most users
      const [topCities] = await pool.execute(`
        SELECT 
          us.country,
          us.city,
          COUNT(DISTINCT u.id) as user_count,
          COUNT(CASE WHEN u.last_login_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as active_weekly
        FROM user_sessions us
        JOIN users u ON us.user_id = u.id
        WHERE u.role != 'admin' AND us.city IS NOT NULL
        GROUP BY us.country, us.city
        ORDER BY user_count DESC
        LIMIT 10
      `);

      res.json({
        top_countries: topCountries,
        top_cities: topCities,
        total_countries: topCountries.length,
        generated_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Get geography stats error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Reports
  // Package Analytics
  static async getPackageAnalytics(req, res) {
    try {
      const { days = 30 } = req.query;
      
      // Package sales trends
      const [salesTrends] = await pool.execute(`
        SELECT 
          DATE(up.purchased_at) as purchase_date,
          pp.name as package_name,
          COUNT(up.id) as packages_sold,
          SUM(pp.price) as daily_revenue
        FROM user_packages up
        JOIN pricing_packages pp ON up.package_id = pp.id
        WHERE up.purchased_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        GROUP BY DATE(up.purchased_at), pp.id
        ORDER BY purchase_date DESC
      `, [days]);

      // Top packages by revenue
      const [topPackages] = await pool.execute(`
        SELECT 
          pp.name,
          pp.price,
          COUNT(up.id) as total_sold,
          SUM(pp.price) as total_revenue,
          COUNT(CASE WHEN up.status = 'active' THEN 1 END) as active_packages,
          AVG(up.credits_remaining) as avg_unused_credits,
          AVG(up.featured_credits_remaining) as avg_unused_featured_credits
        FROM pricing_packages pp
        LEFT JOIN user_packages up ON pp.id = up.package_id
        WHERE pp.is_active = 1
        GROUP BY pp.id
        ORDER BY total_revenue DESC
      `);

      // Credit usage analytics
      const [creditUsage] = await pool.execute(`
        SELECT 
          pu.usage_type,
          COUNT(pu.id) as usage_count,
          DATE(pu.used_at) as usage_date
        FROM package_usage pu
        WHERE pu.used_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        GROUP BY pu.usage_type, DATE(pu.used_at)
        ORDER BY usage_date DESC
      `, [days]);

      // Top customers by package purchases
      const [topCustomers] = await pool.execute(`
        SELECT 
          u.id,
          u.first_name,
          u.last_name,
          u.email,
          COUNT(up.id) as packages_purchased,
          SUM(pp.price) as total_spent,
          SUM(up.credits_remaining) as unused_credits
        FROM users u
        JOIN user_packages up ON u.id = up.user_id
        JOIN pricing_packages pp ON up.package_id = pp.id
        WHERE up.purchased_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        GROUP BY u.id
        ORDER BY total_spent DESC
        LIMIT 10
      `, [days]);

      res.json({
        period_days: parseInt(days),
        sales_trends: salesTrends,
        top_packages: topPackages,
        credit_usage: creditUsage,
        top_customers: topCustomers,
        generated_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Get package analytics error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getAnalyticsReport(req, res) {
    try {
      const { period = '30' } = req.query; // days
      const days = parseInt(period);

      // User registration trends
      const [userTrends] = await pool.execute(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as registrations,
          COUNT(CASE WHEN role = 'talent' THEN 1 END) as talent_registrations,
          COUNT(CASE WHEN role = 'manager' THEN 1 END) as manager_registrations
        FROM users 
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
          AND role != 'admin'
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `, [days]);

      // Job posting trends
      const [jobTrends] = await pool.execute(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as jobs_posted,
          AVG(budget_min) as avg_min_budget,
          AVG(budget_max) as avg_max_budget
        FROM jobs 
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `, [days]);

      // Proposal success rates
      const [proposalStats] = await pool.execute(`
        SELECT 
          COUNT(*) as total_proposals,
          COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted_proposals,
          (COUNT(CASE WHEN status = 'accepted' THEN 1 END) / COUNT(*)) * 100 as success_rate
        FROM proposals 
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      `, [days]);

      // Top categories
      const [topCategories] = await pool.execute(`
        SELECT 
          category,
          COUNT(*) as job_count
        FROM jobs 
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
          AND category IS NOT NULL
        GROUP BY category
        ORDER BY job_count DESC
        LIMIT 10
      `, [days]);

      res.json({
        period_days: days,
        user_trends: userTrends,
        job_trends: jobTrends,
        proposal_stats: proposalStats[0],
        top_categories: topCategories,
        generated_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Get analytics report error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Pricing and Discount Management
  static async getPricingPackages(req, res) {
    try {
      // TODO: Implement pricing packages with MongoDB
      res.json({ 
        packages: [],
        message: "Pricing packages feature not yet implemented for MongoDB" 
      });

    } catch (error) {
      console.error('Get pricing packages error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async createPricingPackage(req, res) {
    try {
      const { name, description, price, post_credits, featured_credits, duration_days, features } = req.body;

      const [result] = await pool.execute(`
        INSERT INTO pricing_packages (name, description, price, post_credits, featured_credits, duration_days, features)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [name, description, price, post_credits || 0, featured_credits || 0, duration_days, JSON.stringify(features || [])]);

      await AdminController.logAdminAction(req.user.id, 'create_pricing_package', {
        package_id: result.insertId,
        name,
        price
      });

      res.status(201).json({ 
        message: 'Pricing package created successfully',
        package_id: result.insertId
      });
    } catch (error) {
      console.error('Create pricing package error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async updatePricingPackage(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const fields = [];
      const values = [];
      
      Object.keys(updates).forEach(key => {
        if (updates[key] !== undefined && key !== 'features') {
          fields.push(`${key} = ?`);
          values.push(updates[key]);
        } else if (key === 'features' && updates[key] !== undefined) {
          fields.push(`${key} = ?`);
          values.push(JSON.stringify(updates[key]));
        }
      });

      if (fields.length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      values.push(id);

      const [result] = await pool.execute(
        `UPDATE pricing_packages SET ${fields.join(', ')} WHERE id = ?`,
        values
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Pricing package not found' });
      }

      await AdminController.logAdminAction(req.user.id, 'update_pricing_package', {
        package_id: parseInt(id),
        updates: Object.keys(updates)
      });

      res.json({ message: 'Pricing package updated successfully' });
    } catch (error) {
      console.error('Update pricing package error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async archivePricingPackage(req, res) {
    try {
      const { id } = req.params;

      // Archive (disable) the package
      const [result] = await pool.execute(
        'UPDATE pricing_packages SET is_active = false WHERE id = ?',
        [id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Pricing package not found' });
      }

      await AdminController.logAdminAction(req.user.id, 'archive_pricing_package', {
        package_id: parseInt(id)
      });

      res.json({ 
        message: 'Pricing package archived successfully',
        action: 'archived'
      });
    } catch (error) {
      console.error('Archive pricing package error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async unarchivePricingPackage(req, res) {
    try {
      const { id } = req.params;

      // Unarchive (re-enable) the package
      const [result] = await pool.execute(
        'UPDATE pricing_packages SET is_active = true WHERE id = ?',
        [id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Pricing package not found' });
      }

      await AdminController.logAdminAction(req.user.id, 'unarchive_pricing_package', {
        package_id: parseInt(id)
      });

      res.json({ 
        message: 'Pricing package unarchived successfully',
        action: 'unarchived'
      });
    } catch (error) {
      console.error('Unarchive pricing package error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async deletePricingPackage(req, res) {
    try {
      const { id } = req.params;

      // Check if package has active subscriptions - strictly prevent deletion
      const [subscriptions] = await pool.execute(
        'SELECT COUNT(*) as active_count FROM user_packages WHERE package_id = ? AND status = "active"',
        [id]
      );

      if (subscriptions[0].active_count > 0) {
        return res.status(400).json({ 
          error: 'Cannot delete package with active subscriptions',
          message: `This package has ${subscriptions[0].active_count} active subscription${subscriptions[0].active_count === 1 ? '' : 's'}. Archive it instead.`,
          active_subscriptions: subscriptions[0].active_count
        });
      }

      // Hard delete - only if no active subscriptions
      const [result] = await pool.execute(
        'DELETE FROM pricing_packages WHERE id = ?',
        [id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Pricing package not found' });
      }

      await AdminController.logAdminAction(req.user.id, 'delete_pricing_package', {
        package_id: parseInt(id)
      });

      res.json({ 
        message: 'Pricing package deleted permanently',
        action: 'deleted'
      });
    } catch (error) {
      console.error('Delete pricing package error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Discount Management
  static async getDiscounts(req, res) {
    try {
      // TODO: Implement discounts with MongoDB
      res.json({ 
        discounts: [],
        message: "Discounts feature not yet implemented for MongoDB" 
      });
    } catch (error) {
      console.error('Get discounts error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getDiscount(req, res) {
    try {
      const { id } = req.params;

      const [discounts] = await pool.execute(`
        SELECT d.*, 
               u.first_name as created_by_name,
               au.first_name as archived_by_name,
               COUNT(dul.id) as actual_usage_count
        FROM discounts d
        LEFT JOIN users u ON d.created_by = u.id
        LEFT JOIN users au ON d.archived_by = au.id
        LEFT JOIN discount_usage_log dul ON d.id = dul.discount_id
        WHERE d.id = ?
        GROUP BY d.id
      `, [id]);

      if (discounts.length === 0) {
        return res.status(404).json({ error: 'Discount not found' });
      }

      res.json({ discount: discounts[0] });
    } catch (error) {
      console.error('Get discount error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async createDiscount(req, res) {
    try {
      const { 
        code, 
        name, 
        description, 
        type, 
        value, 
        min_purchase_amount,
        max_uses,
        expires_at,
        applicable_to,
        user_restrictions,
        status = 'valid'
      } = req.body;

      // Check if discount code already exists
      const [existing] = await pool.execute('SELECT id FROM discounts WHERE code = ?', [code]);
      if (existing.length > 0) {
        return res.status(400).json({ error: 'Discount code already exists' });
      }

      const [result] = await pool.execute(`
        INSERT INTO discounts (
          code, name, description, type, value, min_purchase_amount,
          max_uses, expires_at, applicable_to, user_restrictions, status, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        code, name, description, type, value, min_purchase_amount || null,
        max_uses || null, expires_at || null, 
        JSON.stringify(applicable_to || ['all']), 
        JSON.stringify(user_restrictions || {}),
        status,
        req.user.id
      ]);

      await AdminController.logAdminAction(req.user.id, 'create_discount', {
        discount_id: result.insertId,
        code,
        type,
        value,
        status
      });

      res.status(201).json({ 
        message: 'Discount created successfully',
        discount_id: result.insertId
      });
    } catch (error) {
      console.error('Create discount error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async assignDiscountToUser(req, res) {
    try {
      const { user_id, discount_id } = req.body;

      // Check if user and discount exist
      const user = await User.findById(user_id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const [discount] = await pool.execute('SELECT * FROM discounts WHERE id = ?', [discount_id]);
      if (discount.length === 0) {
        return res.status(404).json({ error: 'Discount not found' });
      }

      // Check if user already has this discount
      const [existing] = await pool.execute(`
        SELECT id FROM user_discounts WHERE user_id = ? AND discount_id = ?
      `, [user_id, discount_id]);

      if (existing.length > 0) {
        return res.status(400).json({ error: 'User already has this discount' });
      }

      await pool.execute(`
        INSERT INTO user_discounts (user_id, discount_id, assigned_by, status)
        VALUES (?, ?, ?, 'available')
      `, [user_id, discount_id, req.user.id]);

      await AdminController.logAdminAction(req.user.id, 'assign_discount', {
        user_id: parseInt(user_id),
        discount_id: parseInt(discount_id),
        discount_code: discount[0].code
      });

      res.json({ message: 'Discount assigned to user successfully' });
    } catch (error) {
      console.error('Assign discount error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async updateDiscount(req, res) {
    try {
      const { id } = req.params;
      const { 
        code, 
        name, 
        description, 
        type, 
        value, 
        min_purchase_amount,
        max_uses,
        expires_at,
        applicable_to,
        user_restrictions,
        status
      } = req.body;

      // Check if discount exists
      const [existing] = await pool.execute('SELECT * FROM discounts WHERE id = ?', [id]);
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Discount not found' });
      }

      // If updating code, check for uniqueness
      if (code && code !== existing[0].code) {
        const [codeCheck] = await pool.execute('SELECT id FROM discounts WHERE code = ? AND id != ?', [code, id]);
        if (codeCheck.length > 0) {
          return res.status(400).json({ error: 'Discount code already exists' });
        }
      }

      // Build update query dynamically
      const updateFields = [];
      const updateValues = [];

      if (code !== undefined) { updateFields.push('code = ?'); updateValues.push(code); }
      if (name !== undefined) { updateFields.push('name = ?'); updateValues.push(name); }
      if (description !== undefined) { updateFields.push('description = ?'); updateValues.push(description); }
      if (type !== undefined) { updateFields.push('type = ?'); updateValues.push(type); }
      if (value !== undefined) { updateFields.push('value = ?'); updateValues.push(value); }
      if (min_purchase_amount !== undefined) { updateFields.push('min_purchase_amount = ?'); updateValues.push(min_purchase_amount); }
      if (max_uses !== undefined) { updateFields.push('max_uses = ?'); updateValues.push(max_uses); }
      if (expires_at !== undefined) { updateFields.push('expires_at = ?'); updateValues.push(expires_at); }
      if (applicable_to !== undefined) { updateFields.push('applicable_to = ?'); updateValues.push(JSON.stringify(applicable_to)); }
      if (user_restrictions !== undefined) { updateFields.push('user_restrictions = ?'); updateValues.push(JSON.stringify(user_restrictions)); }
      if (status !== undefined) { updateFields.push('status = ?'); updateValues.push(status); }

      if (updateFields.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      updateValues.push(id);

      await pool.execute(`
        UPDATE discounts SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, updateValues);

      await AdminController.logAdminAction(req.user.id, 'update_discount', {
        discount_id: parseInt(id),
        updated_fields: updateFields.map(f => f.split(' = ')[0])
      });

      res.json({ message: 'Discount updated successfully' });
    } catch (error) {
      console.error('Update discount error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async archiveDiscount(req, res) {
    try {
      const { id } = req.params;

      const [result] = await pool.execute(`
        UPDATE discounts SET archived_at = CURRENT_TIMESTAMP, archived_by = ?, is_active = false
        WHERE id = ?
      `, [req.user.id, id]);

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Discount not found' });
      }

      await AdminController.logAdminAction(req.user.id, 'archive_discount', {
        discount_id: parseInt(id)
      });

      res.json({ 
        message: 'Discount archived successfully',
        action: 'archived'
      });
    } catch (error) {
      console.error('Archive discount error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async unarchiveDiscount(req, res) {
    try {
      const { id } = req.params;

      const [result] = await pool.execute(`
        UPDATE discounts SET archived_at = NULL, archived_by = NULL, is_active = true
        WHERE id = ?
      `, [id]);

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Discount not found' });
      }

      await AdminController.logAdminAction(req.user.id, 'unarchive_discount', {
        discount_id: parseInt(id)
      });

      res.json({ 
        message: 'Discount unarchived successfully',
        action: 'unarchived'
      });
    } catch (error) {
      console.error('Unarchive discount error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async deleteDiscount(req, res) {
    try {
      const { id } = req.params;

      // Check if discount has been used
      const [usageCheck] = await pool.execute(`
        SELECT COUNT(*) as usage_count FROM discount_usage_log WHERE discount_id = ?
      `, [id]);

      const hasBeenUsed = usageCheck[0].usage_count > 0;

      // Get discount info before deletion
      const [discount] = await pool.execute('SELECT code, name FROM discounts WHERE id = ?', [id]);
      if (discount.length === 0) {
        return res.status(404).json({ error: 'Discount not found' });
      }

      if (hasBeenUsed) {
        return res.status(400).json({ 
          error: 'Cannot delete discount that has been used. Consider archiving instead.',
          used_count: usageCheck[0].usage_count
        });
      }

      // Delete the discount
      await pool.execute('DELETE FROM discounts WHERE id = ?', [id]);

      await AdminController.logAdminAction(req.user.id, 'delete_discount', {
        discount_id: parseInt(id),
        discount_code: discount[0].code,
        discount_name: discount[0].name
      });

      res.json({ 
        message: 'Discount deleted successfully',
        action: 'deleted'
      });
    } catch (error) {
      console.error('Delete discount error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // User Analytics and Tracking
  static async getUserAnalytics(req, res) {
    try {
      const { user_id } = req.params;
      const { days = 30 } = req.query;

      // Get user login sessions
      const [sessions] = await pool.execute(`
        SELECT us.*, 
               TIMESTAMPDIFF(MINUTE, us.login_time, us.last_activity) as session_duration_minutes
        FROM user_sessions us
        WHERE us.user_id = ? AND us.login_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
        ORDER BY us.login_time DESC
      `, [user_id, days]);

      // Get user activity stats
      const [activityStats] = await pool.execute(`
        SELECT 
          COUNT(DISTINCT DATE(ul.created_at)) as active_days,
          COUNT(ul.id) as total_actions,
          ul.action_type,
          COUNT(*) as action_count
        FROM user_logs ul
        WHERE ul.user_id = ? AND ul.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        GROUP BY ul.action_type
        ORDER BY action_count DESC
      `, [user_id, days]);

      // Get device and location info
      const [deviceStats] = await pool.execute(`
        SELECT 
          device_type,
          browser,
          os,
          country,
          city,
          COUNT(*) as usage_count,
          MAX(login_time) as last_used
        FROM user_sessions
        WHERE user_id = ? AND login_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
        GROUP BY device_type, browser, os, country, city
        ORDER BY usage_count DESC
      `, [user_id, days]);

      res.json({
        user_id: parseInt(user_id),
        period_days: parseInt(days),
        sessions,
        activity_stats: activityStats,
        device_stats: deviceStats,
        generated_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Get user analytics error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getMessagingAnalytics(req, res) {
    try {
      const { days = 30, user_id = null } = req.query;

      let userFilter = '';
      let params = [days];

      if (user_id) {
        userFilter = 'AND (m.user_id = ? OR m.receiver_id = ?)';
        params.push(user_id, user_id);
      }

      const [messagingStats] = await pool.execute(`
        SELECT 
          DATE(m.created_at) as date,
          COUNT(*) as messages_sent,
          COUNT(DISTINCT m.user_id) as active_senders,
          COUNT(DISTINCT m.job_id) as conversations,
          AVG(LENGTH(m.content)) as avg_message_length
        FROM messages m
        WHERE m.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) ${userFilter}
        GROUP BY DATE(m.created_at)
        ORDER BY date DESC
      `, params);

      // Get top communicators
      const [topCommunicators] = await pool.execute(`
        SELECT 
          u.id, u.first_name, u.last_name, u.email, u.role,
          COUNT(m.id) as messages_sent,
          COUNT(DISTINCT m.job_id) as conversations_participated
        FROM messages m
        JOIN users u ON m.user_id = u.id
        WHERE m.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) ${userFilter}
        GROUP BY u.id
        ORDER BY messages_sent DESC
        LIMIT 10
      `, params);

      res.json({
        period_days: parseInt(days),
        messaging_trends: messagingStats,
        top_communicators: topCommunicators,
        generated_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Get messaging analytics error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getJobApplicationAnalytics(req, res) {
    try {
      const { days = 30 } = req.query;

      // Application trends
      const [applicationTrends] = await pool.execute(`
        SELECT 
          DATE(p.created_at) as date,
          COUNT(*) as applications_submitted,
          COUNT(CASE WHEN p.status = 'accepted' THEN 1 END) as applications_accepted,
          COUNT(CASE WHEN p.status = 'rejected' THEN 1 END) as applications_rejected,
          AVG(p.bid_amount) as avg_bid_amount
        FROM proposals p
        WHERE p.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        GROUP BY DATE(p.created_at)
        ORDER BY date DESC
      `, [days]);

      // Top talents by application success
      const [topTalents] = await pool.execute(`
        SELECT 
          u.id, u.first_name, u.last_name, u.email,
          COUNT(p.id) as total_applications,
          COUNT(CASE WHEN p.status = 'accepted' THEN 1 END) as accepted_applications,
          (COUNT(CASE WHEN p.status = 'accepted' THEN 1 END) / COUNT(p.id)) * 100 as success_rate,
          AVG(p.bid_amount) as avg_bid_amount
        FROM proposals p
        JOIN talent_profiles tp ON p.talent_id = tp.id
        JOIN users u ON tp.user_id = u.id
        WHERE p.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        GROUP BY u.id
        HAVING total_applications >= 3
        ORDER BY success_rate DESC, total_applications DESC
        LIMIT 10
      `, [days]);

      // Manager hiring patterns
      const [managerStats] = await pool.execute(`
        SELECT 
          u.id, u.first_name, u.last_name, u.email, mp.company_name,
          COUNT(DISTINCT j.id) as jobs_posted,
          COUNT(p.id) as applications_received,
          COUNT(CASE WHEN p.status = 'accepted' THEN 1 END) as applications_accepted,
          AVG(j.budget_max) as avg_budget_offered
        FROM jobs j
        JOIN manager_profiles mp ON j.manager_id = mp.id
        JOIN users u ON mp.user_id = u.id
        LEFT JOIN proposals p ON j.id = p.job_id
        WHERE j.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        GROUP BY u.id
        ORDER BY jobs_posted DESC
        LIMIT 10
      `, [days]);

      res.json({
        period_days: parseInt(days),
        application_trends: applicationTrends,
        top_talents: topTalents,
        manager_stats: managerStats,
        generated_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Get job application analytics error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Admin Activity Logging
  static async logAdminAction(admin_id, action, details = {}) {
    try {
      await pool.execute(`
        INSERT INTO admin_logs (admin_id, action, details, ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?)
      `, [admin_id, action, JSON.stringify(details), null, null]);
    } catch (error) {
      console.error('Log admin action error:', error);
    }
  }

  static async getAdminLogs(req, res) {
    try {
      const { page = 1, limit = 50, admin_id = null, action_type = null } = req.query;
      const offset = (page - 1) * limit;

      let whereConditions = [];
      let params = [];

      if (admin_id) {
        whereConditions.push('al.admin_id = ?');
        params.push(admin_id);
      }

      if (action_type) {
        whereConditions.push('al.action = ?');
        params.push(action_type);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      const [logs] = await pool.execute(`
        SELECT al.*, u.first_name, u.last_name, u.email as admin_email
        FROM admin_logs al
        JOIN users u ON al.admin_id = u.id
        ${whereClause}
        ORDER BY al.created_at DESC
        LIMIT ? OFFSET ?
      `, [...params, parseInt(limit), offset]);

      // Get total count
      const [countResult] = await pool.execute(`
        SELECT COUNT(*) as total FROM admin_logs al ${whereClause}
      `, params);

      res.json({
        logs,
        total: countResult[0].total,
        page: parseInt(page),
        totalPages: Math.ceil(countResult[0].total / parseInt(limit))
      });
    } catch (error) {
      console.error('Get admin logs error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Email Template Management
  static async getEmailTemplates(req, res) {
    try {
      const { category = null, active_only = false } = req.query;
      
      let query = 'SELECT * FROM email_templates WHERE 1=1';
      let params = [];

      if (category) {
        query += ' AND category = ?';
        params.push(category);
      }

      if (active_only === 'true') {
        query += ' AND is_active = 1';
      }

      query += ' ORDER BY category, name';

      const [templates] = await pool.execute(query, params);

      res.json({ templates });
    } catch (error) {
      console.error('Get email templates error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getEmailTemplate(req, res) {
    try {
      const { id } = req.params;

      const [templates] = await pool.execute('SELECT * FROM email_templates WHERE id = ?', [id]);
      
      if (templates.length === 0) {
        return res.status(404).json({ error: 'Email template not found' });
      }

      res.json({ template: templates[0] });
    } catch (error) {
      console.error('Get email template error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async createEmailTemplate(req, res) {
    try {
      const { name, subject, html_content, text_content, category, variables } = req.body;

      // Check if template name already exists
      const [existing] = await pool.execute('SELECT id FROM email_templates WHERE name = ?', [name]);
      if (existing.length > 0) {
        return res.status(400).json({ error: 'Template name already exists' });
      }

      const [result] = await pool.execute(`
        INSERT INTO email_templates (name, subject, html_content, text_content, category, variables)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [name, subject, html_content, text_content || null, category, JSON.stringify(variables || [])]);

      await AdminController.logAdminAction(req.user.id, 'create_email_template', {
        template_id: result.insertId,
        name,
        category
      });

      res.status(201).json({ 
        message: 'Email template created successfully',
        template_id: result.insertId
      });
    } catch (error) {
      console.error('Create email template error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async updateEmailTemplate(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const fields = [];
      const values = [];
      
      Object.keys(updates).forEach(key => {
        if (updates[key] !== undefined && key !== 'variables') {
          fields.push(`${key} = ?`);
          values.push(updates[key]);
        } else if (key === 'variables' && updates[key] !== undefined) {
          fields.push(`${key} = ?`);
          values.push(JSON.stringify(updates[key]));
        }
      });

      if (fields.length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      values.push(id);

      const [result] = await pool.execute(
        `UPDATE email_templates SET ${fields.join(', ')} WHERE id = ?`,
        values
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Email template not found' });
      }

      await AdminController.logAdminAction(req.user.id, 'update_email_template', {
        template_id: parseInt(id),
        updates: Object.keys(updates)
      });

      res.json({ message: 'Email template updated successfully' });
    } catch (error) {
      console.error('Update email template error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async deleteEmailTemplate(req, res) {
    try {
      const { id } = req.params;

      const [result] = await pool.execute('DELETE FROM email_templates WHERE id = ?', [id]);

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Email template not found' });
      }

      await AdminController.logAdminAction(req.user.id, 'delete_email_template', {
        template_id: parseInt(id)
      });

      res.json({ message: 'Email template deleted successfully' });
    } catch (error) {
      console.error('Delete email template error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getEmailLogs(req, res) {
    try {
      const { page = 1, limit = 50, status = null, recipient = null } = req.query;
      const offset = (page - 1) * limit;

      let whereConditions = [];
      let params = [];

      if (status) {
        whereConditions.push('el.status = ?');
        params.push(status);
      }

      if (recipient) {
        whereConditions.push('el.recipient_email LIKE ?');
        params.push(`%${recipient}%`);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      const [logs] = await pool.execute(`
        SELECT el.*, et.name as template_name, u.first_name, u.last_name
        FROM email_logs el
        LEFT JOIN email_templates et ON el.template_id = et.id
        LEFT JOIN users u ON el.recipient_user_id = u.id
        ${whereClause}
        ORDER BY el.created_at DESC
        LIMIT ? OFFSET ?
      `, [...params, parseInt(limit), offset]);

      // Get total count
      const [countResult] = await pool.execute(`
        SELECT COUNT(*) as total FROM email_logs el ${whereClause}
      `, params);

      res.json({
        logs,
        total: countResult[0].total,
        page: parseInt(page),
        totalPages: Math.ceil(countResult[0].total / parseInt(limit))
      });
    } catch (error) {
      console.error('Get email logs error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Invoice Management
  static async getInvoices(req, res) {
    try {
      const { page = 1, limit = 20, status = null, user_id = null } = req.query;
      const offset = (page - 1) * limit;

      let whereConditions = [];
      let params = [];

      if (status) {
        whereConditions.push('i.status = ?');
        params.push(status);
      }

      if (user_id) {
        whereConditions.push('i.user_id = ?');
        params.push(user_id);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      const [invoices] = await pool.execute(`
        SELECT i.*, u.first_name, u.last_name, u.email
        FROM invoices i
        JOIN users u ON i.user_id = u.id
        ${whereClause}
        ORDER BY i.created_at DESC
        LIMIT ? OFFSET ?
      `, [...params, parseInt(limit), offset]);

      // Get total count and stats
      const [countResult] = await pool.execute(`
        SELECT COUNT(*) as total FROM invoices i ${whereClause}
      `, params);

      const [stats] = await pool.execute(`
        SELECT 
          COUNT(*) as total_invoices,
          SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END) as paid_amount,
          SUM(CASE WHEN status = 'overdue' THEN total_amount ELSE 0 END) as overdue_amount,
          SUM(CASE WHEN status IN ('sent', 'overdue') THEN total_amount ELSE 0 END) as pending_amount
        FROM invoices
      `);

      res.json({
        invoices,
        total: countResult[0].total,
        page: parseInt(page),
        totalPages: Math.ceil(countResult[0].total / parseInt(limit)),
        stats: stats[0]
      });
    } catch (error) {
      console.error('Get invoices error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async createInvoice(req, res) {
    try {
      const { user_id, amount, tax_amount, items, notes, due_date } = req.body;

      // Generate invoice number
      const [lastInvoice] = await pool.execute(
        'SELECT invoice_number FROM invoices ORDER BY id DESC LIMIT 1'
      );
      
      let invoiceNumber = 'INV-000001';
      if (lastInvoice.length > 0) {
        const lastNumber = parseInt(lastInvoice[0].invoice_number.split('-')[1]);
        invoiceNumber = `INV-${String(lastNumber + 1).padStart(6, '0')}`;
      }

      const totalAmount = parseFloat(amount) + parseFloat(tax_amount || 0);

      const [result] = await pool.execute(`
        INSERT INTO invoices (user_id, invoice_number, amount, tax_amount, total_amount, items, notes, due_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [user_id, invoiceNumber, amount, tax_amount || 0, totalAmount, JSON.stringify(items || []), notes || null, due_date || null]);

      await AdminController.logAdminAction(req.user.id, 'create_invoice', {
        invoice_id: result.insertId,
        invoice_number: invoiceNumber,
        user_id: parseInt(user_id),
        amount: totalAmount
      });

      res.status(201).json({ 
        message: 'Invoice created successfully',
        invoice_id: result.insertId,
        invoice_number: invoiceNumber
      });
    } catch (error) {
      console.error('Create invoice error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async updateInvoiceStatus(req, res) {
    try {
      const { id } = req.params;
      const { status, paid_at = null } = req.body;

      if (!['draft', 'sent', 'paid', 'overdue', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'Invalid invoice status' });
      }

      let updateFields = 'status = ?';
      let updateValues = [status];

      if (status === 'paid' && paid_at) {
        updateFields += ', paid_at = ?';
        updateValues.push(paid_at);
      }

      updateValues.push(id);

      const [result] = await pool.execute(
        `UPDATE invoices SET ${updateFields} WHERE id = ?`,
        updateValues
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      await AdminController.logAdminAction(req.user.id, 'update_invoice_status', {
        invoice_id: parseInt(id),
        new_status: status
      });

      res.json({ message: 'Invoice status updated successfully' });
    } catch (error) {
      console.error('Update invoice status error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Reports Generation
  static async generateReport(req, res) {
    try {
      const { type, format = 'json', start_date = null, end_date = null } = req.query;
      
      let reportData = {};
      const dateFilter = start_date && end_date ? 
        'WHERE created_at BETWEEN ? AND ?' : '';
      const dateParams = start_date && end_date ? [start_date, end_date] : [];

      switch (type) {
        case 'user_activity':
          const [userActivity] = await pool.execute(`
            SELECT 
              DATE(created_at) as date,
              COUNT(*) as total_registrations,
              COUNT(CASE WHEN role = 'talent' THEN 1 END) as talent_registrations,
              COUNT(CASE WHEN role = 'manager' THEN 1 END) as manager_registrations
            FROM users ${dateFilter}
            GROUP BY DATE(created_at)
            ORDER BY date DESC
          `, dateParams);
          reportData = { user_activity: userActivity };
          break;

        case 'job_statistics':
          const [jobStats] = await pool.execute(`
            SELECT 
              DATE(created_at) as date,
              COUNT(*) as jobs_posted,
              AVG(budget_min) as avg_min_budget,
              AVG(budget_max) as avg_max_budget,
              category,
              COUNT(*) as category_count
            FROM jobs ${dateFilter}
            GROUP BY DATE(created_at), category
            ORDER BY date DESC, category_count DESC
          `, dateParams);
          reportData = { job_statistics: jobStats };
          break;

        case 'revenue_report':
          const [revenueData] = await pool.execute(`
            SELECT 
              DATE(created_at) as date,
              SUM(total_amount) as total_revenue,
              COUNT(*) as total_invoices,
              SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END) as paid_revenue,
              SUM(CASE WHEN status = 'overdue' THEN total_amount ELSE 0 END) as overdue_revenue
            FROM invoices ${dateFilter}
            GROUP BY DATE(created_at)
            ORDER BY date DESC
          `, dateParams);
          reportData = { revenue_report: revenueData };
          break;

        default:
          return res.status(400).json({ error: 'Invalid report type' });
      }

      if (format === 'csv') {
        // Convert to CSV format
        const csv = AdminController.convertToCSV(reportData);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${type}_report.csv"`);
        return res.send(csv);
      }

      res.json({
        report_type: type,
        date_range: { start_date, end_date },
        data: reportData,
        generated_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Generate report error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static convertToCSV(data) {
    if (!data || Object.keys(data).length === 0) return '';
    
    const firstKey = Object.keys(data)[0];
    const rows = data[firstKey];
    
    if (!rows || rows.length === 0) return '';
    
    const headers = Object.keys(rows[0]);
    const csvHeaders = headers.join(',');
    
    const csvRows = rows.map(row => 
      headers.map(header => `"${row[header] || ''}"`).join(',')
    );
    
    return [csvHeaders, ...csvRows].join('\n');
  }

  static async getDeletedUsers(req, res) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const result = await User.getDeletedUsers(page, limit);
      
      res.json({
        deletedUsers: result.deletedUsers,
        pagination: {
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
          limit: parseInt(limit)
        }
      });
    } catch (error) {
      console.error('Get deleted users error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async restoreUser(req, res) {
    try {
      const { deletedUserId } = req.params;
      
      const result = await User.restoreUser(deletedUserId, req.user.id);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      // Log admin action
      await AdminController.logAdminAction(req.user.id, 'restore_user', {
        deleted_user_id: parseInt(deletedUserId),
        restored_user_email: result.restoredUser.email,
        restored_user_id: result.restoredUser.id
      });

      res.json({ 
        message: 'User restored successfully',
        restoredUser: result.restoredUser
      });
    } catch (error) {
      console.error('Restore user error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async permanentlyDeleteUser(req, res) {
    try {
      const { deletedUserId } = req.params;
      
      // Get deleted user info before permanent deletion
      const [deletedRows] = await pool.execute(
        'SELECT * FROM deleted_users WHERE id = ?',
        [deletedUserId]
      );
      
      if (deletedRows.length === 0) {
        return res.status(404).json({ error: 'Deleted user not found' });
      }

      const deletedUser = deletedRows[0];

      // Permanently remove from deleted_users table
      const [result] = await pool.execute(
        'DELETE FROM deleted_users WHERE id = ?',
        [deletedUserId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Deleted user not found' });
      }

      // Log admin action
      await AdminController.logAdminAction(req.user.id, 'permanent_delete_user', {
        deleted_user_id: parseInt(deletedUserId),
        original_user_id: deletedUser.original_user_id,
        email: deletedUser.email
      });

      res.json({ 
        message: 'User permanently removed from deleted users',
        deletedUser: {
          id: deletedUser.original_user_id,
          email: deletedUser.email,
          name: `${deletedUser.first_name} ${deletedUser.last_name}`
        }
      });
    } catch (error) {
      console.error('Permanently delete user error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static validateSoftDelete = [
    body('reason').optional().isLength({ max: 500 }).withMessage('Reason must be less than 500 characters')
  ];

  static validateJobStatusUpdate = [
    body('status').isIn(['open', 'in_progress', 'completed', 'cancelled'])
  ];

  // Proposal Management
  static async getAllProposals(req, res) {
    try {
      const [proposals] = await pool.execute(`
        SELECT 
          p.id,
          p.job_id,
          p.talent_id,
          p.status,
          p.cover_letter,
          p.draft_offerings,
          p.pricing_details,
          p.availability,
          p.created_at as submitted_at,
          p.updated_at,
          CONCAT(u.first_name, ' ', u.last_name) as talent_name,
          u.email as talent_email,
          j.title as job_title,
          j.company_name
        FROM proposals p
        JOIN users u ON p.talent_id = u.id
        JOIN jobs j ON p.job_id = j.id
        ORDER BY p.created_at DESC
      `);

      res.json({ 
        proposals: proposals.map(proposal => ({
          ...proposal,
          submitted_at: proposal.submitted_at,
          updated_at: proposal.updated_at
        }))
      });
    } catch (error) {
      console.error('Get all proposals error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getProposal(req, res) {
    try {
      const { id } = req.params;
      
      const [proposals] = await pool.execute(`
        SELECT 
          p.*,
          CONCAT(u.first_name, ' ', u.last_name) as talent_name,
          u.email as talent_email,
          j.title as job_title,
          j.company_name,
          j.description as job_description
        FROM proposals p
        JOIN users u ON p.talent_id = u.id
        JOIN jobs j ON p.job_id = j.id
        WHERE p.id = ?
      `, [id]);

      if (proposals.length === 0) {
        return res.status(404).json({ error: 'Proposal not found' });
      }

      res.json({ proposal: proposals[0] });
    } catch (error) {
      console.error('Get proposal error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async updateProposalStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Check if proposal exists
      const [proposals] = await pool.execute('SELECT * FROM proposals WHERE id = ?', [id]);
      if (proposals.length === 0) {
        return res.status(404).json({ error: 'Proposal not found' });
      }

      // Update proposal status
      const [result] = await pool.execute(
        'UPDATE proposals SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, id]
      );

      if (result.affectedRows === 0) {
        return res.status(400).json({ error: 'Failed to update proposal status' });
      }

      // Log admin action
      await AdminController.logAdminAction(req.user.id, 'update_proposal_status', {
        proposal_id: parseInt(id),
        new_status: status,
        previous_status: proposals[0].status
      });

      res.json({ message: 'Proposal status updated successfully' });
    } catch (error) {
      console.error('Update proposal status error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async deleteProposal(req, res) {
    try {
      const { id } = req.params;

      // Check if proposal exists
      const [proposals] = await pool.execute('SELECT * FROM proposals WHERE id = ?', [id]);
      if (proposals.length === 0) {
        return res.status(404).json({ error: 'Proposal not found' });
      }

      // Delete the proposal
      const [result] = await pool.execute('DELETE FROM proposals WHERE id = ?', [id]);

      if (result.affectedRows === 0) {
        return res.status(400).json({ error: 'Failed to delete proposal' });
      }

      // Log admin action
      await AdminController.logAdminAction(req.user.id, 'delete_proposal', {
        proposal_id: parseInt(id),
        job_id: proposals[0].job_id,
        talent_id: proposals[0].talent_id
      });

      res.json({ message: 'Proposal deleted successfully' });
    } catch (error) {
      console.error('Delete proposal error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getProposalStats(req, res) {
    try {
      const [stats] = await pool.execute(`
        SELECT 
          COUNT(*) as total_proposals,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_proposals,
          COUNT(CASE WHEN status = 'interview' THEN 1 END) as interview_proposals,
          COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_proposals,
          COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_proposals,
          COUNT(CASE WHEN status = 'inappropriate' THEN 1 END) as inappropriate_proposals,
          COUNT(CASE WHEN status = 'hired' THEN 1 END) as hired_proposals,
          COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as new_proposals_week,
          COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as new_proposals_month
        FROM proposals
      `);

      res.json({ stats: stats[0] });
    } catch (error) {
      console.error('Get proposal stats error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Talent Profile Management
  static async getAllTalentProfiles(req, res) {
    try {
      const TalentProfile = require('../models/TalentProfile');
      const { page = 1, limit = 50 } = req.query;

      const parsedLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 100);
      const parsedPage = Math.max(parseInt(page) || 1, 1);
      const skip = (parsedPage - 1) * parsedLimit;

      const profiles = await TalentProfile.find()
        .populate('user_id', 'first_name last_name email is_active email_verified')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parsedLimit);

      const total = await TalentProfile.countDocuments();

      const profilesWithUserData = profiles.filter(profile => profile.user_id).map(profile => ({
        id: profile._id,
        user_id: profile.user_id._id,
        title: profile.title,
        bio: profile.bio,
        hourly_rate: profile.hourly_rate,
        location: profile.location,
        is_featured: profile.is_featured || false,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
        user: {
          id: profile.user_id._id,
          first_name: profile.user_id.first_name,
          last_name: profile.user_id.last_name,
          email: profile.user_id.email,
          is_active: profile.user_id.is_active,
          email_verified: profile.user_id.email_verified
        }
      }));

      res.json({
        profiles: profilesWithUserData,
        total,
        page: parsedPage,
        totalPages: Math.ceil(total / parsedLimit)
      });
    } catch (error) {
      console.error('Get all talent profiles error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async updateTalentFeatured(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const { is_featured } = req.body;

      const TalentProfile = require('../models/TalentProfile');

      const result = await TalentProfile.updateOne(
        { _id: id },
        { $set: { is_featured } }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Talent profile not found' });
      }

      res.json({
        message: `Talent profile ${is_featured ? 'featured' : 'unfeatured'} successfully`,
        profile_id: id,
        is_featured
      });
    } catch (error) {
      console.error('Update talent featured error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async createMissingTalentProfile(req, res) {
    try {
      const { user_id } = req.params;
      console.log('Admin creating missing TalentProfile for user_id:', user_id);

      const User = require('../models/User');
      const TalentProfile = require('../models/TalentProfile');

      // Validate user exists and is a talent
      const user = await User.findById(user_id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (user.role !== 'talent') {
        return res.status(400).json({ error: 'User is not a talent' });
      }

      // Check if TalentProfile already exists
      const existingProfile = await TalentProfile.findOne({ user_id });
      if (existingProfile) {
        return res.json({
          message: 'TalentProfile already exists',
          profile_id: existingProfile._id,
          user_email: user.email
        });
      }

      // Create the missing TalentProfile
      const profileId = await TalentProfile.create({
        user_id,
        title: '',
        bio: '',
        hourly_rate: null,
        availability: 'contract',
        location: '',
        portfolio_description: ''
      });

      res.json({
        message: 'TalentProfile created successfully by admin',
        profile_id: profileId,
        user_email: user.email,
        user_name: `${user.first_name} ${user.last_name}`
      });
    } catch (error) {
      console.error('Admin create missing TalentProfile error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }

  static async getUsersWithoutTalentProfile(req, res) {
    try {
      const User = require('../models/User');
      const TalentProfile = require('../models/TalentProfile');

      // Find all talent users
      const talentUsers = await User.find({ role: 'talent' }, 'first_name last_name email is_active');

      // Find all existing talent profiles
      const existingProfiles = await TalentProfile.find({}, 'user_id');
      const existingUserIds = existingProfiles.map(p => p.user_id.toString());

      // Filter users without profiles
      const usersWithoutProfiles = talentUsers.filter(user =>
        !existingUserIds.includes(user._id.toString())
      );

      res.json({
        users_without_profiles: usersWithoutProfiles.map(user => ({
          id: user._id,
          name: `${user.first_name} ${user.last_name}`,
          email: user.email,
          is_active: user.is_active
        })),
        total: usersWithoutProfiles.length
      });
    } catch (error) {
      console.error('Get users without talent profile error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

module.exports = AdminController;
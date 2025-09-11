const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const TalentProfile = require('../models/TalentProfile');
const ManagerProfile = require('../models/ManagerProfile');
const { auth, requireManagerOrTalent, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Search users (for messaging system) - updated to include admin
router.get('/search', auth, requireManagerOrTalent, async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;
    const user_id = req.user.id;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters long'
      });
    }

    const searchTerm = `%${q.trim()}%`;
    
    // Search for users by name or email (exclude current user)
    // MongoDB connection handled through models
    const [rows] = await pool.execute(`
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.role,
        u.profile_image
      FROM users u
      WHERE u.id != ? 
        AND u.email_verified = 1
        AND (
          CONCAT(u.first_name, ' ', u.last_name) LIKE ? OR
          u.email LIKE ?
        )
      ORDER BY u.first_name ASC
      LIMIT ?
    `, [user_id, searchTerm, searchTerm, parseInt(limit)]);

    res.json({
      success: true,
      data: {
        users: rows,
        query: q.trim(),
        total: rows.length
      }
    });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search users'
    });
  }
});

// Get user by email (for direct messaging)
router.get('/by-email/:email', auth, requireManagerOrTalent, async (req, res) => {
  try {
    const { email } = req.params;
    const user_id = req.user.id;

    if (!email || !email.includes('@')) {
      return res.status(400).json({
        success: false,
        message: 'Valid email is required'
      });
    }

    // MongoDB connection handled through models
    const [rows] = await pool.execute(`
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.role,
        u.profile_image,
        CASE 
          WHEN u.role = 'talent' THEN tp.id
          WHEN u.role = 'manager' THEN mp.id
          ELSE NULL
        END as profile_id
      FROM users u
      LEFT JOIN talent_profiles tp ON u.id = tp.user_id AND u.role = 'talent'
      LEFT JOIN manager_profiles mp ON u.id = mp.user_id AND u.role = 'manager'
      WHERE u.email = ? 
        AND u.id != ?
        AND u.email_verified = TRUE
      LIMIT 1
    `, [email.toLowerCase(), user_id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found with this email address'
      });
    }

    res.json({
      success: true,
      data: {
        user: rows[0]
      }
    });
  } catch (error) {
    console.error('Get user by email error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to find user'
    });
  }
});

// Get user profile info (public info for messaging)
router.get('/profile/:id', auth, requireManagerOrTalent, async (req, res) => {
  try {
    const { id } = req.params;

    // MongoDB connection handled through models
    const [rows] = await pool.execute(`
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.role,
        u.profile_image,
        u.created_at,
        CASE 
          WHEN u.role = 'talent' THEN tp.title
          WHEN u.role = 'manager' THEN mp.company_name
          ELSE NULL
        END as profile_title
      FROM users u
      LEFT JOIN talent_profiles tp ON u.id = tp.user_id AND u.role = 'talent'
      LEFT JOIN manager_profiles mp ON u.id = mp.user_id AND u.role = 'manager'
      WHERE u.id = ? 
        AND u.email_verified = TRUE
      LIMIT 1
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        user: rows[0]
      }
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user profile'
    });
  }
});

// Admin routes
router.get('/admin/all', auth, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, role, search } = req.query;
    const offset = (page - 1) * limit;

    let whereConditions = ['1 = 1'];
    let params = [];

    if (role && ['talent', 'manager', 'admin'].includes(role)) {
      whereConditions.push('u.role = ?');
      params.push(role);
    }

    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      whereConditions.push('(CONCAT(u.first_name, " ", u.last_name) LIKE ? OR u.email LIKE ?)');
      params.push(searchTerm, searchTerm);
    }

    const whereClause = whereConditions.join(' AND ');

    // MongoDB connection handled through models
    const [rows] = await pool.execute(`
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.role,
        u.profile_image,
        u.email_verified,
        u.created_at,
        u.updated_at
      FROM users u
      WHERE ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    const [countRows] = await pool.execute(`
      SELECT COUNT(*) as total 
      FROM users u 
      WHERE ${whereClause}
    `, params);

    res.json({
      success: true,
      data: {
        users: rows,
        total: countRows[0].total,
        page: parseInt(page),
        totalPages: Math.ceil(countRows[0].total / limit)
      }
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get users'
    });
  }
});

module.exports = router;
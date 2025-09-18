const { body, validationResult } = require('express-validator');
const TalentProfile = require('../models/TalentProfile');
const ManagerProfile = require('../models/ManagerProfile');
const Skill = require('../models/Skill');
const TalentSkill = require('../models/TalentSkill');

class ProfileController {
  // Talent Profile Controllers
  static validateTalentProfile = [
    body('title').optional().trim().isLength({ max: 255 }),
    body('bio').optional().trim().isLength({ max: 5000 }),
    body('hourly_rate').optional().isFloat({ min: 0 }),
    body('availability').optional().isIn(['full-time', 'part-time', 'contract']),
    body('location').optional().trim().isLength({ max: 255 }),
    body('portfolio_description').optional().trim().isLength({ max: 5000 })
  ];

  static async getTalentProfile(req, res) {
    try {
      const { id } = req.params; // This is the user_id

      // Find talent profile by user_id and populate user data
      const profile = await TalentProfile.findOne({ user_id: id })
        .populate('user_id', 'first_name last_name email profile_image is_active email_verified');

      if (!profile) {
        return res.status(404).json({ error: 'Talent profile not found' });
      }

      // Get skills for this talent profile
      const skills = await TalentProfile.getSkills(profile._id);

      // Format the response to match frontend expectations
      const formattedProfile = {
        id: profile._id,
        user_id: profile.user_id._id,
        first_name: profile.user_id.first_name,
        last_name: profile.user_id.last_name,
        email: profile.user_id.email,
        profile_image: profile.user_id.profile_image,
        title: profile.title,
        bio: profile.bio,
        hourly_rate: profile.hourly_rate,
        location: profile.location,
        availability: profile.availability,
        portfolio_description: profile.portfolio_description,
        is_featured: profile.is_featured || false,
        rating: profile.rating || 0,
        jobs_completed: profile.jobs_completed || 0,
        success_rate: profile.success_rate || 0,
        view_count: profile.view_count || 0,
        skills: skills,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
        // Add empty arrays for optional fields that might be expected
        languages: [],
        certifications: [],
        education: null,
        portfolio: [],
        profile_visibility: {
          is_public: true,
          show_contact: true,
          show_hourly_rate: true,
          show_portfolio: true,
          show_testimonials: true
        }
      };

      res.json({
        profile: formattedProfile
      });
    } catch (error) {
      console.error('Get talent profile error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getMyTalentProfile(req, res) {
    try {
      const profile = await TalentProfile.findByUserId(req.user.id);
      
      if (!profile) {
        return res.status(404).json({ error: 'Talent profile not found' });
      }

      // Get skills
      const skills = await TalentProfile.getSkills(profile.id);

      res.json({ 
        profile: { ...profile, skills }
      });
    } catch (error) {
      console.error('Get my talent profile error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async updateTalentProfile(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Try to update, if no profile exists, create one
      const updated = await TalentProfile.update(req.user.id, req.body);

      if (!updated) {
        // Profile doesn't exist, create it
        console.log('Creating new talent profile for user:', req.user.id);
        const profileId = await TalentProfile.create({
          user_id: req.user.id,
          ...req.body
        });
        console.log('Created talent profile with ID:', profileId);
      }

      // Return the updated/created profile in the format expected by frontend
      const profile = await TalentProfile.findByUserId(req.user.id);

      if (!profile) {
        return res.status(404).json({ error: 'Profile not found after update/create' });
      }

      // Get skills for this talent profile
      const skills = await TalentProfile.getSkills(profile._id);

      // Format the response to match frontend expectations (like getTalentProfile)
      const formattedProfile = {
        id: profile._id,
        user_id: profile.user_id._id,
        first_name: profile.user_id.first_name,
        last_name: profile.user_id.last_name,
        email: profile.user_id.email,
        profile_image: profile.user_id.profile_image,
        title: profile.title,
        bio: profile.bio,
        hourly_rate: profile.hourly_rate,
        location: profile.location,
        availability: profile.availability,
        portfolio_description: profile.portfolio_description,
        is_featured: profile.is_featured || false,
        rating: profile.rating || 0,
        jobs_completed: profile.jobs_completed || 0,
        success_rate: profile.success_rate || 0,
        view_count: profile.view_count || 0,
        skills: skills,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
        // Add empty arrays for optional fields that might be expected
        languages: [],
        certifications: [],
        education: null,
        portfolio: [],
        profile_visibility: {
          is_public: true,
          show_contact: true,
          show_hourly_rate: true,
          show_portfolio: true,
          show_testimonials: true
        }
      };

      res.json(formattedProfile);
    } catch (error) {
      console.error('Update talent profile error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async addSkillToTalent(req, res) {
    try {
      const { skill_name, proficiency = 'intermediate' } = req.body;

      if (!skill_name) {
        return res.status(400).json({ error: 'Skill name is required' });
      }

      if (!['beginner', 'intermediate', 'expert'].includes(proficiency)) {
        return res.status(400).json({ error: 'Invalid proficiency level' });
      }

      // Get talent profile
      const talentProfile = await TalentProfile.findByUserId(req.user.id);
      if (!talentProfile) {
        return res.status(400).json({ error: 'Talent profile not found' });
      }

      // Find or create skill
      let skill = await Skill.findByName(skill_name);
      if (!skill) {
        const skillId = await Skill.create({ name: skill_name, category: null });
        skill = { id: skillId };
      }

      const result = await TalentProfile.addSkill(talentProfile.id, skill.id, proficiency);
      
      if (result === null) {
        return res.status(400).json({ error: 'Skill already added to profile' });
      }

      res.json({ message: 'Skill added to profile successfully' });
    } catch (error) {
      console.error('Add skill to talent error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async removeSkillFromTalent(req, res) {
    try {
      const { skill_id } = req.params;

      // Get talent profile
      const talentProfile = await TalentProfile.findByUserId(req.user.id);
      if (!talentProfile) {
        return res.status(400).json({ error: 'Talent profile not found' });
      }

      const removed = await TalentProfile.removeSkill(talentProfile.id, skill_id);
      
      if (!removed) {
        return res.status(404).json({ error: 'Skill not found in profile' });
      }

      res.json({ message: 'Skill removed from profile successfully' });
    } catch (error) {
      console.error('Remove skill from talent error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async searchTalents(req, res) {
    try {
      const {
        skills,
        hourly_rate_min,
        hourly_rate_max,
        availability,
        location,
        page = 1,
        limit = 20
      } = req.query;

      const searchParams = {
        skills: skills ? (Array.isArray(skills) ? skills : skills.split(',')) : null,
        hourly_rate_min: hourly_rate_min ? parseFloat(hourly_rate_min) : null,
        hourly_rate_max: hourly_rate_max ? parseFloat(hourly_rate_max) : null,
        availability,
        location,
        page: parseInt(page),
        limit: parseInt(limit)
      };

      const result = await TalentProfile.searchTalents(searchParams);

      // Get skills for each talent from database only
      for (let talent of result.talents) {
        try {
          talent.skills = await TalentProfile.getSkills(talent.id);
        } catch (error) {
          console.error('Error loading skills for talent:', talent.id, error);
          talent.skills = []; // Fallback to empty array if error
        }
      }

      res.json(result);
    } catch (error) {
      console.error('Search talents error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Create missing TalentProfile for existing user
  static async createMissingTalentProfile(req, res) {
    try {
      const { email } = req.params;
      console.log('Creating missing TalentProfile for:', email);

      const User = require('../models/User');
      const user = await User.findByEmail(email);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (user.role !== 'talent') {
        return res.status(400).json({ error: 'User is not a talent' });
      }

      // Check if TalentProfile already exists
      const existingProfile = await TalentProfile.findOne({ user_id: user.id });
      if (existingProfile) {
        return res.json({ message: 'TalentProfile already exists', profile_id: existingProfile._id });
      }

      // Create the missing TalentProfile
      const newProfile = await TalentProfile.create({
        user_id: user.id,
        title: '',
        bio: '',
        hourly_rate: null,
        availability: 'contract',
        location: '',
        portfolio_description: ''
      });

      res.json({
        message: 'TalentProfile created successfully',
        profile_id: newProfile._id,
        user_email: email
      });
    } catch (error) {
      console.error('Create missing TalentProfile error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }

  // DEBUG: Temporary diagnostic method
  static async debugUser(req, res) {
    try {
      const { email } = req.params;
      console.log('Debugging user:', email);

      const User = require('../models/User');

      // Check if user exists
      const user = await User.findByEmail(email);
      if (!user) {
        return res.json({
          error: 'User not found',
          email: email
        });
      }

      // Check for TalentProfile
      const talentProfile = await TalentProfile.findOne({ user_id: user.id });

      // Check search criteria
      const searchCriteria = {
        is_active: user.is_active,
        email_verified: user.email_verified,
        role: user.role,
        has_talent_profile: !!talentProfile
      };

      // Test if user would be included in search
      const activeUserIds = await User.find({
        is_active: true
      }).distinct('_id');

      const wouldBeIncluded = activeUserIds.some(id => id.toString() === user.id.toString());

      res.json({
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role,
          is_active: user.is_active,
          email_verified: user.email_verified,
          created_at: user.created_at
        },
        talentProfile: talentProfile ? {
          id: talentProfile._id,
          title: talentProfile.title,
          bio: talentProfile.bio,
          hourly_rate: talentProfile.hourly_rate,
          location: talentProfile.location,
          availability: talentProfile.availability
        } : null,
        searchCriteria,
        wouldBeIncluded,
        debug: {
          totalActiveUsers: activeUserIds.length,
          userIdMatch: activeUserIds.find(id => id.toString() === user.id.toString())
        }
      });
    } catch (error) {
      console.error('Debug user error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }

  static async getTalentDashboard(req, res) {
    try {
      // Get talent profile
      const talentProfile = await TalentProfile.findByUserId(req.user.id);
      if (!talentProfile) {
        return res.status(400).json({ error: 'Talent profile not found' });
      }

      const dashboardData = await TalentProfile.getDashboardStats(talentProfile._id);

      res.json(dashboardData);
    } catch (error) {
      console.error('Get talent dashboard error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Manager Profile Controllers
  static validateManagerProfile = [
    body('company_name').optional().trim().isLength({ max: 255 }),
    body('company_description').optional().trim().isLength({ max: 5000 }),
    body('company_size').optional().isIn(['1-10', '11-50', '51-200', '201-500', '500+']),
    body('industry').optional().trim().isLength({ max: 255 }),
    body('location').optional().trim().isLength({ max: 255 })
  ];

  static async getManagerProfile(req, res) {
    try {
      const { id } = req.params;
      const profile = await ManagerProfile.findById(id);
      
      if (!profile) {
        return res.status(404).json({ error: 'Manager profile not found' });
      }

      res.json({ profile });
    } catch (error) {
      console.error('Get manager profile error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getMyManagerProfile(req, res) {
    try {
      const profile = await ManagerProfile.findByUserId(req.user.id);
      
      if (!profile) {
        return res.status(404).json({ error: 'Manager profile not found' });
      }

      res.json({ profile });
    } catch (error) {
      console.error('Get my manager profile error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async updateManagerProfile(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const updated = await ManagerProfile.update(req.user.id, req.body);
      
      if (!updated) {
        return res.status(400).json({ error: 'No changes made or profile not found' });
      }

      res.json({ message: 'Manager profile updated successfully' });
    } catch (error) {
      console.error('Update manager profile error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getManagerDashboard(req, res) {
    try {
      // Get manager profile
      const managerProfile = await ManagerProfile.findByUserId(req.user.id);
      if (!managerProfile) {
        return res.status(400).json({ error: 'Manager profile not found' });
      }

      const stats = await ManagerProfile.getDashboardStats(managerProfile.id);

      res.json({ dashboard: stats });
    } catch (error) {
      console.error('Get manager dashboard error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getManagerJobs(req, res) {
    try {
      const { page = 1, limit = 20 } = req.query;

      // Get manager profile
      const managerProfile = await ManagerProfile.findByUserId(req.user.id);
      if (!managerProfile) {
        return res.status(400).json({ error: 'Manager profile not found' });
      }

      const result = await ManagerProfile.getJobsPosted(
        managerProfile.id,
        parseInt(page),
        parseInt(limit)
      );

      res.json(result);
    } catch (error) {
      console.error('Get manager jobs error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async incrementTalentProfileView(req, res) {
    try {
      const { id } = req.params; // This is the user_id

      // Increment the view count for the talent profile
      const updated = await TalentProfile.incrementViewCount(id);

      if (!updated) {
        return res.status(404).json({ error: 'Talent profile not found' });
      }

      res.json({ success: true, message: 'Profile view count incremented' });
    } catch (error) {
      console.error('Increment talent profile view error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async updateUserRole(req, res) {
    try {
      const { role } = req.body;
      const userId = req.user.id;

      // Validate role
      if (!['talent', 'manager', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }

      // Check admin role restrictions
      if (role === 'admin') {
        const User = require('../models/User');
        const targetUser = await User.findById(userId);
        if (!targetUser || !targetUser.email.endsWith('@yellowgenie.io')) {
          return res.status(403).json({
            error: 'Admin role restricted to @yellowgenie.io email addresses'
          });
        }
      }

      // Update user role
      const User = require('../models/User');
      const success = await User.updateProfile(userId, { role });

      if (!success) {
        return res.status(400).json({ error: 'Failed to update user role' });
      }

      res.json({
        success: true,
        message: 'Role updated successfully',
        new_role: role
      });
    } catch (error) {
      console.error('Update user role error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

module.exports = ProfileController;
const { body, validationResult } = require('express-validator');
const TalentProfile = require('../models/TalentProfile');
const ManagerProfile = require('../models/ManagerProfile');
const Skill = require('../models/Skill');

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
      const { id } = req.params;
      const profile = await TalentProfile.findById(id);
      
      if (!profile) {
        return res.status(404).json({ error: 'Talent profile not found' });
      }

      // Get skills
      const skills = await TalentProfile.getSkills(profile.id);

      res.json({ 
        profile: { ...profile, skills }
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

      const updated = await TalentProfile.update(req.user.id, req.body);
      
      if (!updated) {
        return res.status(400).json({ error: 'No changes made or profile not found' });
      }

      res.json({ message: 'Talent profile updated successfully' });
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

      // Get skills for each talent
      for (let talent of result.talents) {
        talent.skills = await TalentProfile.getSkills(talent.id);
      }

      res.json(result);
    } catch (error) {
      console.error('Search talents error:', error);
      res.status(500).json({ error: 'Internal server error' });
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
}

module.exports = ProfileController;
const { body, validationResult, query } = require('express-validator');
const Skill = require('../models/Skill');

class SkillController {
  static validateCreateSkill = [
    body('name').trim().isLength({ min: 1, max: 100 }),
    body('category').optional().trim().isLength({ max: 100 })
  ];

  static validateUpdateSkill = [
    body('name').optional().trim().isLength({ min: 1, max: 100 }),
    body('category').optional().trim().isLength({ max: 100 })
  ];

  static validateSearchSkills = [
    query('search').optional().trim().isLength({ min: 1 }),
    query('category').optional().trim(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 })
  ];

  static async createSkill(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, category } = req.body;

      const skillId = await Skill.create({ name, category });

      if (skillId === null) {
        return res.status(400).json({ error: 'Skill already exists' });
      }

      res.status(201).json({
        message: 'Skill created successfully',
        skill_id: skillId
      });
    } catch (error) {
      console.error('Create skill error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getSkill(req, res) {
    try {
      const { id } = req.params;
      const skill = await Skill.findById(id);
      
      if (!skill) {
        return res.status(404).json({ error: 'Skill not found' });
      }

      res.json({ skill });
    } catch (error) {
      console.error('Get skill error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async updateSkill(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      
      const skill = await Skill.findById(id);
      if (!skill) {
        return res.status(404).json({ error: 'Skill not found' });
      }

      const updated = await Skill.update(id, req.body);
      
      if (!updated) {
        return res.status(400).json({ error: 'No changes made' });
      }

      res.json({ message: 'Skill updated successfully' });
    } catch (error) {
      if (error.message.includes('already exists')) {
        return res.status(400).json({ error: error.message });
      }
      console.error('Update skill error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async deleteSkill(req, res) {
    try {
      const { id } = req.params;
      
      const skill = await Skill.findById(id);
      if (!skill) {
        return res.status(404).json({ error: 'Skill not found' });
      }

      const deleted = await Skill.delete(id);
      
      if (!deleted) {
        return res.status(400).json({ error: 'Failed to delete skill' });
      }

      res.json({ message: 'Skill deleted successfully' });
    } catch (error) {
      console.error('Delete skill error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getAllSkills(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { 
        category, 
        page = 1, 
        limit = 100 
      } = req.query;

      const result = await Skill.getAll(
        category,
        parseInt(page),
        parseInt(limit)
      );

      res.json(result);
    } catch (error) {
      console.error('Get all skills error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async searchSkills(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { search, limit = 20 } = req.query;

      if (!search) {
        return res.status(400).json({ error: 'Search term is required' });
      }

      const skills = await Skill.search(search, parseInt(limit));

      res.json({ skills });
    } catch (error) {
      console.error('Search skills error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getCategories(req, res) {
    try {
      const categories = await Skill.getCategories();
      res.json({ categories });
    } catch (error) {
      console.error('Get categories error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getPopularSkills(req, res) {
    try {
      const { limit = 20 } = req.query;
      const skills = await Skill.getPopularSkills(parseInt(limit));
      res.json({ skills });
    } catch (error) {
      console.error('Get popular skills error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async bulkCreateSkills(req, res) {
    try {
      const { skills } = req.body;

      if (!Array.isArray(skills) || skills.length === 0) {
        return res.status(400).json({ error: 'Skills array is required' });
      }

      // Validate each skill
      for (const skill of skills) {
        if (!skill.name || skill.name.trim().length === 0) {
          return res.status(400).json({ error: 'Each skill must have a name' });
        }
      }

      const createdIds = await Skill.bulkCreate(skills);

      res.status(201).json({
        message: `${createdIds.length} skills created successfully`,
        created_skill_ids: createdIds
      });
    } catch (error) {
      console.error('Bulk create skills error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

module.exports = SkillController;
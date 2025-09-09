const { pool } = require('../config/database');

class TalentProfile {
  static async create({ user_id, title, bio, hourly_rate, availability, location, portfolio_description }) {
    const [result] = await pool.execute(
      'INSERT INTO talent_profiles (user_id, title, bio, hourly_rate, availability, location, portfolio_description) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [user_id, title, bio, hourly_rate, availability, location, portfolio_description]
    );
    
    return result.insertId;
  }

  static async findByUserId(user_id) {
    const [rows] = await pool.execute(`
      SELECT tp.*, u.first_name, u.last_name, u.email
      FROM talent_profiles tp
      JOIN users u ON tp.user_id = u.id
      WHERE tp.user_id = ?
    `, [user_id]);
    
    return rows[0];
  }

  static async findById(id) {
    const [rows] = await pool.execute(`
      SELECT tp.*, u.first_name, u.last_name, u.email
      FROM talent_profiles tp
      JOIN users u ON tp.user_id = u.id
      WHERE tp.id = ?
    `, [id]);
    
    return rows[0];
  }

  static async update(user_id, updates) {
    const fields = [];
    const values = [];
    
    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(updates[key]);
      }
    });
    
    if (fields.length === 0) return false;
    
    values.push(user_id);
    
    const [result] = await pool.execute(
      `UPDATE talent_profiles SET ${fields.join(', ')} WHERE user_id = ?`,
      values
    );
    
    return result.affectedRows > 0;
  }

  static async addSkill(talent_id, skill_id, proficiency = 'intermediate') {
    try {
      const [result] = await pool.execute(
        'INSERT INTO talent_skills (talent_id, skill_id, proficiency) VALUES (?, ?, ?)',
        [talent_id, skill_id, proficiency]
      );
      return result.insertId;
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return null; // Skill already exists
      }
      throw error;
    }
  }

  static async removeSkill(talent_id, skill_id) {
    const [result] = await pool.execute(
      'DELETE FROM talent_skills WHERE talent_id = ? AND skill_id = ?',
      [talent_id, skill_id]
    );
    
    return result.affectedRows > 0;
  }

  static async getSkills(talent_id) {
    const [rows] = await pool.execute(`
      SELECT s.id, s.name, s.category, ts.proficiency
      FROM skills s
      JOIN talent_skills ts ON s.id = ts.skill_id
      WHERE ts.talent_id = ?
      ORDER BY s.name
    `, [talent_id]);
    
    return rows;
  }

  static async searchTalents({ skills, hourly_rate_min, hourly_rate_max, availability, location, page = 1, limit = 20 }) {
    const offset = (page - 1) * limit;
    let query = `
      SELECT tp.*, u.first_name, u.last_name, u.email
      FROM talent_profiles tp
      JOIN users u ON tp.user_id = u.id
      WHERE u.is_active = 1
    `;
    
    const params = [];
    
    if (hourly_rate_min) {
      query += ' AND tp.hourly_rate >= ?';
      params.push(hourly_rate_min);
    }
    
    if (hourly_rate_max) {
      query += ' AND tp.hourly_rate <= ?';
      params.push(hourly_rate_max);
    }
    
    if (availability) {
      query += ' AND tp.availability = ?';
      params.push(availability);
    }
    
    if (location) {
      query += ' AND tp.location LIKE ?';
      params.push(`%${location}%`);
    }
    
    query += `
      ORDER BY tp.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    
    
    const [rows] = await pool.execute(query, params);
    
    // Get total count with same conditions but without limit/offset
    let countQuery = query.replace(
      /ORDER BY.*$/s, // Remove ORDER BY and everything after it
      ''
    ).replace(
      /SELECT tp\.\*, u\.first_name, u\.last_name, u\.email/, // Replace SELECT fields
      'SELECT COUNT(*) as total'
    );
    
    // Use same params since we're no longer including limit/offset in params array
    const [countRows] = await pool.execute(countQuery, params);
    
    return {
      talents: rows,
      total: countRows[0].total,
      page,
      totalPages: Math.ceil(countRows[0].total / limit)
    };
  }
}

module.exports = TalentProfile;
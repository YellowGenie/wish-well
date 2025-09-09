const { pool } = require('../config/database');

class Skill {
  static async create({ name, category }) {
    try {
      const [result] = await pool.execute(
        'INSERT INTO skills (name, category) VALUES (?, ?)',
        [name, category]
      );
      
      return result.insertId;
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        // Return existing skill if duplicate
        const existing = await this.findByName(name);
        return existing ? existing.id : null;
      }
      throw error;
    }
  }

  static async findByName(name) {
    const [rows] = await pool.execute(
      'SELECT * FROM skills WHERE name = ?',
      [name]
    );
    
    return rows[0];
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM skills WHERE id = ?',
      [id]
    );
    
    return rows[0];
  }

  static async getAll(category = null, page = 1, limit = 100) {
    const offset = (page - 1) * limit;
    let query = 'SELECT * FROM skills';
    let params = [];

    if (category) {
      query += ' WHERE category = ?';
      params.push(category);
    }

    query += ' ORDER BY name ASC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [rows] = await pool.execute(query, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM skills';
    let countParams = [];
    
    if (category) {
      countQuery += ' WHERE category = ?';
      countParams.push(category);
    }
    
    const [countRows] = await pool.execute(countQuery, countParams);
    
    return {
      skills: rows,
      total: countRows[0].total,
      page,
      totalPages: Math.ceil(countRows[0].total / limit)
    };
  }

  static async search(searchTerm, limit = 20) {
    const [rows] = await pool.execute(`
      SELECT * FROM skills 
      WHERE name LIKE ? OR category LIKE ?
      ORDER BY 
        CASE WHEN name LIKE ? THEN 1 ELSE 2 END,
        name ASC
      LIMIT ?
    `, [`%${searchTerm}%`, `%${searchTerm}%`, `${searchTerm}%`, limit]);
    
    return rows;
  }

  static async getCategories() {
    const [rows] = await pool.execute(
      'SELECT DISTINCT category FROM skills WHERE category IS NOT NULL ORDER BY category'
    );
    
    return rows.map(row => row.category);
  }

  static async getPopularSkills(limit = 20) {
    const [rows] = await pool.execute(`
      SELECT s.*, COUNT(ts.skill_id) + COUNT(js.skill_id) as usage_count
      FROM skills s
      LEFT JOIN talent_skills ts ON s.id = ts.skill_id
      LEFT JOIN job_skills js ON s.id = js.skill_id
      GROUP BY s.id
      ORDER BY usage_count DESC, s.name ASC
      LIMIT ?
    `, [limit]);
    
    return rows;
  }

  static async update(id, { name, category }) {
    const fields = [];
    const values = [];
    
    if (name !== undefined) {
      fields.push('name = ?');
      values.push(name);
    }
    
    if (category !== undefined) {
      fields.push('category = ?');
      values.push(category);
    }
    
    if (fields.length === 0) return false;
    
    values.push(id);
    
    try {
      const [result] = await pool.execute(
        `UPDATE skills SET ${fields.join(', ')} WHERE id = ?`,
        values
      );
      
      return result.affectedRows > 0;
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error('Skill name already exists');
      }
      throw error;
    }
  }

  static async delete(id) {
    const [result] = await pool.execute(
      'DELETE FROM skills WHERE id = ?',
      [id]
    );
    
    return result.affectedRows > 0;
  }

  // Bulk create skills for initial setup
  static async bulkCreate(skills) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      const createdIds = [];
      
      for (const skill of skills) {
        try {
          const [result] = await connection.execute(
            'INSERT INTO skills (name, category) VALUES (?, ?)',
            [skill.name, skill.category]
          );
          createdIds.push(result.insertId);
        } catch (error) {
          if (error.code === 'ER_DUP_ENTRY') {
            // Skip duplicate entries
            continue;
          }
          throw error;
        }
      }
      
      await connection.commit();
      return createdIds;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = Skill;
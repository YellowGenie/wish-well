const { pool } = require('../config/database');

class Job {
  static async create({ manager_id, title, description, budget_type, budget_min, budget_max, currency, category, deadline, experience_level, skills }) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      const [result] = await connection.execute(
        'INSERT INTO jobs (manager_id, title, description, budget_type, budget_min, budget_max, currency, category, deadline, experience_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [manager_id, title, description, budget_type, budget_min, budget_max, currency, category, deadline || null, experience_level]
      );
      
      const jobId = result.insertId;

      // Add skills if provided
      if (skills && skills.length > 0) {
        for (const skillName of skills) {
          // Skip empty skill names
          if (!skillName || skillName.trim() === '') continue;
          
          // Find or create skill by name
          let [skillRows] = await connection.execute(
            'SELECT id FROM skills WHERE name = ?',
            [skillName.trim()]
          );
          
          let skillId;
          if (skillRows.length > 0) {
            skillId = skillRows[0].id;
          } else {
            // Create new skill
            const [skillResult] = await connection.execute(
              'INSERT INTO skills (name, category) VALUES (?, ?)',
              [skillName.trim(), 'General']
            );
            skillId = skillResult.insertId;
          }
          
          // Add skill to job
          await connection.execute(
            'INSERT INTO job_skills (job_id, skill_id, is_required) VALUES (?, ?, ?)',
            [jobId, skillId, true]
          );
        }
      }

      await connection.commit();
      return jobId;
    } catch (error) {
      await connection.rollback();
      console.error('Job creation error:', error);
      console.error('Job data:', { manager_id, title, description, budget_type, budget_min, budget_max, currency, category, deadline, experience_level });
      throw error;
    } finally {
      connection.release();
    }
  }

  static async findById(id) {
    const [rows] = await pool.execute(`
      SELECT j.*, mp.company_name, u.first_name as manager_first_name, u.last_name as manager_last_name
      FROM jobs j
      JOIN manager_profiles mp ON j.manager_id = mp.id
      JOIN users u ON mp.user_id = u.id
      WHERE j.id = ?
    `, [id]);
    
    const job = rows[0];
    if (!job) return null;

    // Get job skills
    const [skillRows] = await pool.execute(`
      SELECT s.id, s.name, s.category, js.is_required
      FROM skills s
      JOIN job_skills js ON s.id = js.skill_id
      WHERE js.job_id = ?
    `, [id]);

    job.skills = skillRows;
    return job;
  }

  static async update(id, updates) {
    const fields = [];
    const values = [];
    
    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined && key !== 'skills') {
        fields.push(`${key} = ?`);
        values.push(updates[key]);
      }
    });
    
    if (fields.length === 0) return false;
    
    values.push(id);
    
    const [result] = await pool.execute(
      `UPDATE jobs SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
    
    return result.affectedRows > 0;
  }

  static async delete(id) {
    const [result] = await pool.execute(
      'DELETE FROM jobs WHERE id = ?',
      [id]
    );
    
    return result.affectedRows > 0;
  }

  static async search({ 
    category, 
    budget_min, 
    budget_max, 
    budget_type, 
    experience_level, 
    skills, 
    search_query,
    status = 'open',
    page = 1, 
    limit = 20,
    sort_by = 'created_at',
    sort_order = 'DESC'
  }) {
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT DISTINCT j.*, mp.company_name, u.first_name as manager_first_name, u.last_name as manager_last_name,
             COUNT(js.skill_id) as matching_skills
      FROM jobs j
      JOIN manager_profiles mp ON j.manager_id = mp.id
      JOIN users u ON mp.user_id = u.id
      LEFT JOIN job_skills js ON j.id = js.job_id
    `;
    
    const conditions = ['j.status = ?'];
    const params = [status];
    
    if (skills && skills.length > 0) {
      query += ' LEFT JOIN skills s ON js.skill_id = s.id';
      conditions.push(`s.name IN (${skills.map(() => '?').join(', ')})`);
      params.push(...skills);
    }
    
    if (category) {
      conditions.push('j.category = ?');
      params.push(category);
    }
    
    if (budget_min) {
      conditions.push('j.budget_min >= ?');
      params.push(budget_min);
    }
    
    if (budget_max) {
      conditions.push('j.budget_max <= ?');
      params.push(budget_max);
    }
    
    if (budget_type) {
      conditions.push('j.budget_type = ?');
      params.push(budget_type);
    }
    
    if (experience_level) {
      conditions.push('j.experience_level = ?');
      params.push(experience_level);
    }
    
    if (search_query) {
      conditions.push('(j.title LIKE ? OR j.description LIKE ?)');
      params.push(`%${search_query}%`, `%${search_query}%`);
    }
    
    query += ` WHERE ${conditions.join(' AND ')}`;
    query += ` GROUP BY j.id`;
    
    // Add sorting
    const allowedSortFields = ['created_at', 'budget_min', 'budget_max', 'title'];
    const sortField = allowedSortFields.includes(sort_by) ? sort_by : 'created_at';
    const sortDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    if (skills && skills.length > 0) {
      query += ` ORDER BY matching_skills DESC, j.${sortField} ${sortDirection}`;
    } else {
      query += ` ORDER BY j.${sortField} ${sortDirection}`;
    }
    
    query += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    const [rows] = await pool.execute(query, params);
    
    // Get total count
    let countQuery = `
      SELECT COUNT(DISTINCT j.id) as total
      FROM jobs j
      JOIN manager_profiles mp ON j.manager_id = mp.id
      JOIN users u ON mp.user_id = u.id
    `;
    
    if (skills && skills.length > 0) {
      countQuery += ' LEFT JOIN job_skills js ON j.id = js.job_id LEFT JOIN skills s ON js.skill_id = s.id';
    }
    
    const countConditions = conditions.slice(); // Copy conditions
    const countParams = params.slice(0, -2); // Remove limit and offset
    
    countQuery += ` WHERE ${countConditions.join(' AND ')}`;
    
    const [countRows] = await pool.execute(countQuery, countParams);
    
    return {
      jobs: rows,
      total: countRows[0].total,
      page,
      totalPages: Math.ceil(countRows[0].total / limit)
    };
  }

  static async getJobsByManager(manager_id, page = 1, limit = 20) {
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;
    
    // First get the jobs
    const [rows] = await pool.execute(`
      SELECT j.*
      FROM jobs j
      WHERE j.manager_id = ?
      ORDER BY j.created_at DESC
      LIMIT ${limitNum} OFFSET ${offset}
    `, [manager_id]);
    
    // Then add proposal counts for each job
    for (let job of rows) {
      const [proposalRows] = await pool.execute(
        'SELECT COUNT(*) as count FROM proposals WHERE job_id = ?',
        [job.id]
      );
      job.applications_count = proposalRows[0].count;
      
      // Get new (unviewed) proposals count
      const [newProposalRows] = await pool.execute(
        'SELECT COUNT(*) as count FROM proposals WHERE job_id = ? AND viewed_by_manager = 0',
        [job.id]
      );
      job.new_proposals_count = newProposalRows[0].count;
    }
    
    const [countRows] = await pool.execute(
      'SELECT COUNT(*) as total FROM jobs WHERE manager_id = ?',
      [manager_id]
    );
    
    return {
      jobs: rows,
      total: countRows[0].total,
      page: pageNum,
      totalPages: Math.ceil(countRows[0].total / limitNum)
    };
  }

  static async getTotalNewProposalsForManager(manager_id) {
    const [rows] = await pool.execute(`
      SELECT COUNT(*) as total_new_proposals
      FROM proposals p
      JOIN jobs j ON p.job_id = j.id
      WHERE j.manager_id = ? AND p.viewed_by_manager = 0
    `, [manager_id]);
    
    return rows[0].total_new_proposals;
  }

  static async markProposalsAsViewed(job_id, manager_id) {
    // Verify the job belongs to the manager
    const [jobRows] = await pool.execute(
      'SELECT id FROM jobs WHERE id = ? AND manager_id = ?',
      [job_id, manager_id]
    );
    
    if (jobRows.length === 0) {
      throw new Error('Job not found or unauthorized');
    }

    const [result] = await pool.execute(
      'UPDATE proposals SET viewed_by_manager = 1 WHERE job_id = ? AND viewed_by_manager = 0',
      [job_id]
    );
    
    return result.affectedRows;
  }

  static async addSkill(job_id, skill_id, is_required = true) {
    try {
      const [result] = await pool.execute(
        'INSERT INTO job_skills (job_id, skill_id, is_required) VALUES (?, ?, ?)',
        [job_id, skill_id, is_required]
      );
      return result.insertId;
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return null;
      }
      throw error;
    }
  }

  static async removeSkill(job_id, skill_id) {
    const [result] = await pool.execute(
      'DELETE FROM job_skills WHERE job_id = ? AND skill_id = ?',
      [job_id, skill_id]
    );
    
    return result.affectedRows > 0;
  }
}

module.exports = Job;
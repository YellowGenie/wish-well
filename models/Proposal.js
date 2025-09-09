const { pool } = require('../config/database');

class Proposal {
  static async create({ job_id, talent_id, cover_letter, bid_amount, timeline_days, draft_offering, pricing_details, availability }) {
    try {
      const [result] = await pool.execute(
        'INSERT INTO proposals (job_id, talent_id, cover_letter, bid_amount, timeline_days, draft_offering, pricing_details, availability) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [job_id, talent_id, cover_letter, bid_amount, timeline_days, draft_offering || null, pricing_details || null, availability || null]
      );
      
      return result.insertId;
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error('You have already submitted a proposal for this job');
      }
      throw error;
    }
  }

  static async findById(id) {
    const [rows] = await pool.execute(`
      SELECT p.*, 
             j.title as job_title, j.budget_type, j.budget_min, j.budget_max,
             tp.title as talent_title, u.first_name, u.last_name, u.email,
             mp.company_name
      FROM proposals p
      JOIN jobs j ON p.job_id = j.id
      JOIN talent_profiles tp ON p.talent_id = tp.id
      JOIN users u ON tp.user_id = u.id
      JOIN manager_profiles mp ON j.manager_id = mp.id
      WHERE p.id = ?
    `, [id]);
    
    return rows[0];
  }

  static async update(id, updates) {
    const allowedFields = ['cover_letter', 'bid_amount', 'timeline_days', 'status', 'draft_offering', 'pricing_details', 'availability'];
    const fields = [];
    const values = [];
    
    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined && allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(updates[key]);
      }
    });
    
    if (fields.length === 0) return false;
    
    values.push(id);
    
    const [result] = await pool.execute(
      `UPDATE proposals SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
    
    return result.affectedRows > 0;
  }

  static async delete(id) {
    const [result] = await pool.execute(
      'DELETE FROM proposals WHERE id = ?',
      [id]
    );
    
    return result.affectedRows > 0;
  }

  static async getProposalsByJob(job_id, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    
    const [rows] = await pool.execute(`
      SELECT p.*, 
             tp.title as talent_title, tp.hourly_rate, u.first_name, u.last_name, u.email
      FROM proposals p
      JOIN talent_profiles tp ON p.talent_id = tp.id
      JOIN users u ON tp.user_id = u.id
      WHERE p.job_id = ?
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `, [job_id, limit, offset]);
    
    const [countRows] = await pool.execute(
      'SELECT COUNT(*) as total FROM proposals WHERE job_id = ?',
      [job_id]
    );
    
    return {
      proposals: rows,
      total: countRows[0].total,
      page,
      totalPages: Math.ceil(countRows[0].total / limit)
    };
  }

  static async getProposalsByTalent(talent_id, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    
    const [rows] = await pool.execute(`
      SELECT p.*, 
             j.title as job_title, j.budget_type, j.budget_min, j.budget_max, j.status as job_status,
             mp.company_name
      FROM proposals p
      JOIN jobs j ON p.job_id = j.id
      JOIN manager_profiles mp ON j.manager_id = mp.id
      WHERE p.talent_id = ?
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `, [talent_id, limit, offset]);
    
    const [countRows] = await pool.execute(
      'SELECT COUNT(*) as total FROM proposals WHERE talent_id = ?',
      [talent_id]
    );
    
    return {
      proposals: rows,
      total: countRows[0].total,
      page,
      totalPages: Math.ceil(countRows[0].total / limit)
    };
  }

  static async acceptProposal(id, manager_id) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      // Get proposal details to verify it belongs to manager's job
      const [proposalRows] = await connection.execute(`
        SELECT p.*, j.manager_id as job_manager_id
        FROM proposals p
        JOIN jobs j ON p.job_id = j.id
        WHERE p.id = ?
      `, [id]);
      
      const proposal = proposalRows[0];
      if (!proposal) {
        throw new Error('Proposal not found');
      }
      
      if (proposal.job_manager_id !== manager_id) {
        throw new Error('Unauthorized to accept this proposal');
      }

      // Accept the proposal
      await connection.execute(
        'UPDATE proposals SET status = "accepted" WHERE id = ?',
        [id]
      );

      // Reject all other proposals for this job
      await connection.execute(
        'UPDATE proposals SET status = "rejected" WHERE job_id = ? AND id != ?',
        [proposal.job_id, id]
      );

      // Update job status to in_progress
      await connection.execute(
        'UPDATE jobs SET status = "in_progress" WHERE id = ?',
        [proposal.job_id]
      );

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async rejectProposal(id, manager_id) {
    // Verify the proposal belongs to manager's job
    const [rows] = await pool.execute(`
      SELECT p.*, j.manager_id as job_manager_id
      FROM proposals p
      JOIN jobs j ON p.job_id = j.id
      WHERE p.id = ?
    `, [id]);
    
    const proposal = rows[0];
    if (!proposal) {
      throw new Error('Proposal not found');
    }
    
    if (proposal.job_manager_id !== manager_id) {
      throw new Error('Unauthorized to reject this proposal');
    }

    const [result] = await pool.execute(
      'UPDATE proposals SET status = "rejected" WHERE id = ?',
      [id]
    );
    
    return result.affectedRows > 0;
  }

  static async withdrawProposal(id, talent_id) {
    // Verify the proposal belongs to talent and is still pending
    const [rows] = await pool.execute(
      'SELECT * FROM proposals WHERE id = ? AND talent_id = ? AND status = "pending"',
      [id, talent_id]
    );
    
    if (rows.length === 0) {
      throw new Error('Proposal not found or cannot be withdrawn');
    }

    const [result] = await pool.execute(
      'UPDATE proposals SET status = "withdrawn" WHERE id = ?',
      [id]
    );
    
    return result.affectedRows > 0;
  }

  static async updateProposalStatus(id, status, manager_id) {
    const allowedStatuses = ['pending', 'accepted', 'rejected', 'withdrawn', 'interview', 'approved', 'no_longer_accepting', 'inappropriate'];
    
    if (!allowedStatuses.includes(status)) {
      throw new Error('Invalid proposal status');
    }

    // Verify the proposal belongs to manager's job
    const [rows] = await pool.execute(`
      SELECT p.*, j.manager_id as job_manager_id
      FROM proposals p
      JOIN jobs j ON p.job_id = j.id
      WHERE p.id = ?
    `, [id]);
    
    const proposal = rows[0];
    if (!proposal) {
      throw new Error('Proposal not found');
    }
    
    if (proposal.job_manager_id !== manager_id) {
      throw new Error('Unauthorized to update this proposal');
    }

    const [result] = await pool.execute(
      'UPDATE proposals SET status = ? WHERE id = ?',
      [status, id]
    );
    
    return result.affectedRows > 0;
  }

  static async markInterviewForProposal(id, manager_id) {
    return this.updateProposalStatus(id, 'interview', manager_id);
  }

  static async markApprovedProposal(id, manager_id) {
    return this.updateProposalStatus(id, 'approved', manager_id);
  }

  static async markInappropriateProposal(id, manager_id) {
    return this.updateProposalStatus(id, 'inappropriate', manager_id);
  }

  static async markNoLongerAcceptingProposal(id, manager_id) {
    return this.updateProposalStatus(id, 'no_longer_accepting', manager_id);
  }

  static async getProposalsByStatus(job_id, status, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    
    const [rows] = await pool.execute(`
      SELECT p.*, 
             tp.title as talent_title, tp.hourly_rate, u.first_name, u.last_name, u.email
      FROM proposals p
      JOIN talent_profiles tp ON p.talent_id = tp.id
      JOIN users u ON tp.user_id = u.id
      WHERE p.job_id = ? AND p.status = ?
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `, [job_id, status, limit, offset]);
    
    const [countRows] = await pool.execute(
      'SELECT COUNT(*) as total FROM proposals WHERE job_id = ? AND status = ?',
      [job_id, status]
    );
    
    return {
      proposals: rows,
      total: countRows[0].total,
      page,
      totalPages: Math.ceil(countRows[0].total / limit)
    };
  }
}

module.exports = Proposal;
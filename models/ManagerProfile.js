const { pool } = require('../config/database');

class ManagerProfile {
  static async create({ user_id, company_name, company_description, company_size, industry, location }) {
    const [result] = await pool.execute(
      'INSERT INTO manager_profiles (user_id, company_name, company_description, company_size, industry, location) VALUES (?, ?, ?, ?, ?, ?)',
      [user_id, company_name, company_description, company_size, industry, location]
    );
    
    return result.insertId;
  }

  static async findByUserId(user_id) {
    const [rows] = await pool.execute(`
      SELECT mp.*, u.first_name, u.last_name, u.email
      FROM manager_profiles mp
      JOIN users u ON mp.user_id = u.id
      WHERE mp.user_id = ?
    `, [user_id]);
    
    return rows[0];
  }

  static async findById(id) {
    const [rows] = await pool.execute(`
      SELECT mp.*, u.first_name, u.last_name, u.email
      FROM manager_profiles mp
      JOIN users u ON mp.user_id = u.id
      WHERE mp.id = ?
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
      `UPDATE manager_profiles SET ${fields.join(', ')} WHERE user_id = ?`,
      values
    );
    
    return result.affectedRows > 0;
  }

  static async getJobsPosted(manager_id, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    
    const [rows] = await pool.execute(`
      SELECT j.*, COUNT(p.id) as proposal_count
      FROM jobs j
      LEFT JOIN proposals p ON j.id = p.job_id
      WHERE j.manager_id = ?
      GROUP BY j.id
      ORDER BY j.created_at DESC
      LIMIT ? OFFSET ?
    `, [manager_id, limit, offset]);
    
    // Get total count
    const [countRows] = await pool.execute(
      'SELECT COUNT(*) as total FROM jobs WHERE manager_id = ?',
      [manager_id]
    );
    
    return {
      jobs: rows,
      total: countRows[0].total,
      page,
      totalPages: Math.ceil(countRows[0].total / limit)
    };
  }

  static async getDashboardStats(manager_id) {
    // Get comprehensive stats
    const [stats] = await pool.execute(`
      SELECT 
        COUNT(*) as jobs_posted,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_jobs,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_jobs,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_jobs
      FROM jobs 
      WHERE manager_id = ?
    `, [manager_id]);

    // Get proposal/application stats
    const [applicationStats] = await pool.execute(`
      SELECT 
        COUNT(*) as applications_received,
        COUNT(CASE WHEN p.status = 'pending' THEN 1 END) as pending_applications,
        COUNT(CASE WHEN p.status = 'accepted' THEN 1 END) as hires_made
      FROM proposals p
      JOIN jobs j ON p.job_id = j.id
      WHERE j.manager_id = ?
    `, [manager_id]);

    // Get spending data (mock for now, could connect to payment system later)
    const [paymentStats] = await pool.execute(`
      SELECT 
        COALESCE(SUM(amount), 0) as total_spent
      FROM payments 
      WHERE user_id = (SELECT user_id FROM manager_profiles WHERE id = ?)
        AND status = 'completed'
    `, [manager_id]);

    // Get recent jobs with application counts
    const [recentJobs] = await pool.execute(`
      SELECT 
        j.id, 
        j.title, 
        j.status, 
        j.budget_min,
        j.budget_max,
        j.budget_type,
        j.currency,
        j.created_at,
        COUNT(p.id) as applications
      FROM jobs j
      LEFT JOIN proposals p ON j.id = p.job_id
      WHERE j.manager_id = ?
      GROUP BY j.id
      ORDER BY j.created_at DESC
      LIMIT 5
    `, [manager_id]);

    // Get pending applications with talent details
    const [pendingApplications] = await pool.execute(`
      SELECT 
        p.id,
        p.job_id,
        p.cover_letter,
        p.bid_amount,
        p.timeline_days,
        p.created_at as applied_at,
        j.title as job_title,
        tp.title as talent_title,
        u.first_name,
        u.last_name,
        u.email,
        tp.hourly_rate,
        tp.location
      FROM proposals p
      JOIN jobs j ON p.job_id = j.id
      JOIN talent_profiles tp ON p.talent_id = tp.id
      JOIN users u ON tp.user_id = u.id
      WHERE j.manager_id = ? AND p.status = 'pending'
      ORDER BY p.created_at DESC
      LIMIT 10
    `, [manager_id]);

    const dashboardStats = stats[0];
    const applicationData = applicationStats[0];
    const paymentData = paymentStats[0];

    return {
      stats: {
        jobs_posted: dashboardStats.jobs_posted || 0,
        applications_received: applicationData.applications_received || 0,
        hires_made: applicationData.hires_made || 0,
        total_spent: paymentData.total_spent || 0
      },
      recent_jobs: recentJobs.map(job => ({
        id: job.id.toString(),
        title: job.title,
        location: 'Remote', // Could be from job details in future
        posted_at: job.created_at.toISOString().split('T')[0],
        status: job.status,
        applications: job.applications,
        budget: job.budget_type === 'fixed' 
          ? `$${job.budget_min}${job.budget_max ? ` - $${job.budget_max}` : ''}` 
          : `$${job.budget_min}${job.budget_max ? ` - $${job.budget_max}` : ''}/hr`
      })),
      pending_applications: pendingApplications.map(app => ({
        id: app.id.toString(),
        job_id: app.job_id.toString(),
        applicant_name: `${app.first_name} ${app.last_name}`,
        job_title: app.job_title,
        applied_at: app.applied_at.toISOString().split('T')[0],
        rating: 4.5, // Mock rating for now
        experience: '3+ years', // Mock experience for now
        location: app.location || 'Remote'
      }))
    };
  }
}

module.exports = ManagerProfile;
const { pool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class Interview {
  static async create({
    title,
    description,
    manager_id,
    talent_id,
    job_id = null,
    proposal_id = null,
    questions = [],
    estimated_duration = null,
    scheduled_at = null,
    priority = 'medium'
  }) {
    const [result] = await pool.execute(`
      INSERT INTO interviews (
        title, description, manager_id, talent_id, job_id, proposal_id,
        questions, estimated_duration, scheduled_at, priority, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'created')
    `, [
      title, description, manager_id, talent_id, job_id, proposal_id,
      JSON.stringify(questions), estimated_duration, scheduled_at, priority
    ]);

    const interviewId = result.insertId;

    // Create individual questions if provided
    if (questions && questions.length > 0) {
      await this.addQuestionsToInterview(interviewId, questions);
    }

    // Create interview participants
    await this.addParticipants(interviewId, [
      { user_id: await this.getUserIdFromManagerProfile(manager_id), role: 'interviewer' },
      { user_id: await this.getUserIdFromTalentProfile(talent_id), role: 'interviewee' }
    ]);

    // Create conversation for this interview
    const conversationId = await this.createInterviewConversation(interviewId, manager_id, talent_id);
    
    // Link conversation to interview
    await pool.execute(
      'UPDATE interviews SET conversation_id = ? WHERE id = ?',
      [conversationId, interviewId]
    );

    return interviewId;
  }

  static async findById(id) {
    const [rows] = await pool.execute(`
      SELECT * FROM interview_summary WHERE id = ?
    `, [id]);

    if (rows.length === 0) return null;

    const interview = rows[0];
    
    // Get questions
    interview.questions = await this.getInterviewQuestions(id);
    
    // Get participants
    interview.participants = await this.getInterviewParticipants(id);

    return interview;
  }

  static async getInterviewQuestions(interview_id) {
    const [rows] = await pool.execute(`
      SELECT * FROM interview_questions 
      WHERE interview_id = ? 
      ORDER BY question_order ASC
    `, [interview_id]);

    return rows;
  }

  static async getInterviewParticipants(interview_id) {
    const [rows] = await pool.execute(`
      SELECT 
        ip.*,
        u.first_name,
        u.last_name,
        u.email
      FROM interview_participants ip
      JOIN users u ON ip.user_id = u.id
      WHERE ip.interview_id = ?
    `, [interview_id]);

    return rows;
  }

  static async updateStatus(interview_id, new_status, changed_by, change_reason = null) {
    // Get current status
    const [current] = await pool.execute('SELECT status FROM interviews WHERE id = ?', [interview_id]);
    const old_status = current[0]?.status;

    // Update interview status
    const [result] = await pool.execute(`
      UPDATE interviews 
      SET status = ?, updated_at = NOW()
      WHERE id = ?
    `, [new_status, interview_id]);

    if (result.affectedRows > 0) {
      // Log status change
      await pool.execute(`
        INSERT INTO interview_status_history 
        (interview_id, old_status, new_status, changed_by, change_reason)
        VALUES (?, ?, ?, ?, ?)
      `, [interview_id, old_status, new_status, changed_by, change_reason]);

      // Update timestamps based on status
      if (new_status === 'in_progress' && !current[0]?.started_at) {
        await pool.execute('UPDATE interviews SET started_at = NOW() WHERE id = ?', [interview_id]);
      } else if (new_status === 'completed' && !current[0]?.completed_at) {
        await pool.execute('UPDATE interviews SET completed_at = NOW() WHERE id = ?', [interview_id]);
      }
    }

    return result.affectedRows > 0;
  }

  static async addQuestionsToInterview(interview_id, questions) {
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      await pool.execute(`
        INSERT INTO interview_questions 
        (interview_id, question_text, question_type, question_order, is_required, expected_duration)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        interview_id,
        question.text || question.question_text,
        question.type || 'text',
        i + 1,
        question.required !== false,
        question.duration || null
      ]);
    }
  }

  static async answerQuestion(question_id, answer_text, answered_by) {
    const [result] = await pool.execute(`
      UPDATE interview_questions 
      SET answer_text = ?, answered_at = NOW()
      WHERE id = ?
    `, [answer_text, question_id]);

    return result.affectedRows > 0;
  }

  static async addParticipants(interview_id, participants) {
    for (const participant of participants) {
      await pool.execute(`
        INSERT INTO interview_participants (interview_id, user_id, role, status)
        VALUES (?, ?, ?, 'invited')
      `, [interview_id, participant.user_id, participant.role]);
    }
  }

  static async updateParticipantStatus(interview_id, user_id, status) {
    const [result] = await pool.execute(`
      UPDATE interview_participants 
      SET status = ?, 
          joined_at = CASE WHEN ? = 'accepted' THEN NOW() ELSE joined_at END
      WHERE interview_id = ? AND user_id = ?
    `, [status, status, interview_id, user_id]);

    return result.affectedRows > 0;
  }

  static async getInterviewsByManager(manager_id, status = null, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    let whereClause = 'WHERE i.manager_id = ?';
    let params = [manager_id];

    if (status) {
      whereClause += ' AND i.status = ?';
      params.push(status);
    }

    const [rows] = await pool.execute(`
      SELECT * FROM interview_summary i
      ${whereClause}
      ORDER BY i.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    const [countRows] = await pool.execute(`
      SELECT COUNT(*) as total FROM interviews i ${whereClause}
    `, params);

    return {
      interviews: rows,
      total: countRows[0].total,
      page,
      totalPages: Math.ceil(countRows[0].total / limit)
    };
  }

  static async getInterviewsByTalent(talent_id, status = null, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    let whereClause = 'WHERE i.talent_id = ?';
    let params = [talent_id];

    if (status) {
      whereClause += ' AND i.status = ?';
      params.push(status);
    }

    const [rows] = await pool.execute(`
      SELECT * FROM interview_summary i
      ${whereClause}
      ORDER BY i.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    const [countRows] = await pool.execute(`
      SELECT COUNT(*) as total FROM interviews i ${whereClause}
    `, params);

    return {
      interviews: rows,
      total: countRows[0].total,
      page,
      totalPages: Math.ceil(countRows[0].total / limit)
    };
  }

  static async getAllInterviews(page = 1, limit = 20, filters = {}) {
    const offset = (page - 1) * limit;
    let whereConditions = ['i.deleted_at IS NULL'];
    let params = [];

    if (filters.status) {
      whereConditions.push('i.status = ?');
      params.push(filters.status);
    }

    if (filters.manager_id) {
      whereConditions.push('i.manager_id = ?');
      params.push(filters.manager_id);
    }

    if (filters.talent_id) {
      whereConditions.push('i.talent_id = ?');
      params.push(filters.talent_id);
    }

    if (filters.is_flagged) {
      whereConditions.push('i.is_flagged = ?');
      params.push(filters.is_flagged);
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    const [rows] = await pool.execute(`
      SELECT * FROM interview_summary i
      ${whereClause}
      ORDER BY i.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    const [countRows] = await pool.execute(`
      SELECT COUNT(*) as total FROM interviews i ${whereClause}
    `, params);

    return {
      interviews: rows,
      total: countRows[0].total,
      page,
      totalPages: Math.ceil(countRows[0].total / limit)
    };
  }

  static async flagInterview(interview_id, flagged_by, reason) {
    const [result] = await pool.execute(`
      UPDATE interviews 
      SET is_flagged = TRUE, flagged_reason = ?, flagged_by = ?, flagged_at = NOW()
      WHERE id = ?
    `, [reason, flagged_by, interview_id]);

    return result.affectedRows > 0;
  }

  static async deleteInterview(interview_id, deleted_by) {
    const [result] = await pool.execute(`
      UPDATE interviews 
      SET deleted_at = NOW(), status = 'cancelled'
      WHERE id = ?
    `, [interview_id]);

    if (result.affectedRows > 0) {
      // Log the deletion
      await pool.execute(`
        INSERT INTO interview_status_history 
        (interview_id, old_status, new_status, changed_by, change_reason)
        SELECT status, status, 'cancelled', ?, 'Interview deleted'
        FROM interviews WHERE id = ?
      `, [deleted_by, interview_id]);
    }

    return result.affectedRows > 0;
  }

  static async addRating(interview_id, rater_type, rating, feedback, rater_id) {
    let updateQuery;
    if (rater_type === 'manager') {
      updateQuery = 'UPDATE interviews SET manager_rating = ?, manager_feedback = ? WHERE id = ?';
    } else if (rater_type === 'talent') {
      updateQuery = 'UPDATE interviews SET talent_rating = ?, talent_feedback = ? WHERE id = ?';
    } else {
      throw new Error('Invalid rater type');
    }

    const [result] = await pool.execute(updateQuery, [rating, feedback, interview_id]);
    return result.affectedRows > 0;
  }

  static async createInterviewConversation(interview_id, manager_id, talent_id) {
    // Get user IDs from profile IDs
    const manager_user_id = await this.getUserIdFromManagerProfile(manager_id);
    const talent_user_id = await this.getUserIdFromTalentProfile(talent_id);

    const [result] = await pool.execute(`
      INSERT INTO conversations (type, title, participant_1_id, participant_2_id, interview_id, status)
      VALUES ('interview', 'Interview Discussion', ?, ?, ?, 'active')
    `, [manager_user_id, talent_user_id, interview_id]);

    return result.insertId;
  }

  static async getUserIdFromManagerProfile(manager_profile_id) {
    const [rows] = await pool.execute(
      'SELECT user_id FROM manager_profiles WHERE id = ?',
      [manager_profile_id]
    );
    return rows[0]?.user_id;
  }

  static async getUserIdFromTalentProfile(talent_profile_id) {
    const [rows] = await pool.execute(
      'SELECT user_id FROM talent_profiles WHERE id = ?',
      [talent_profile_id]
    );
    return rows[0]?.user_id;
  }

  static async getInterviewConversation(interview_id) {
    const [rows] = await pool.execute(`
      SELECT c.* FROM conversations c
      WHERE c.interview_id = ? AND c.type = 'interview'
    `, [interview_id]);

    return rows[0] || null;
  }

  static async getInterviewProgress(interview_id) {
    const [questions] = await pool.execute(`
      SELECT 
        COUNT(*) as total_questions,
        COUNT(CASE WHEN answered_at IS NOT NULL THEN 1 END) as answered_questions
      FROM interview_questions 
      WHERE interview_id = ?
    `, [interview_id]);

    const [duration] = await pool.execute(`
      SELECT 
        estimated_duration,
        CASE 
          WHEN started_at IS NOT NULL AND completed_at IS NOT NULL 
          THEN TIMESTAMPDIFF(MINUTE, started_at, completed_at)
          WHEN started_at IS NOT NULL 
          THEN TIMESTAMPDIFF(MINUTE, started_at, NOW())
          ELSE NULL
        END as actual_duration
      FROM interviews 
      WHERE id = ?
    `, [interview_id]);

    return {
      questions: questions[0],
      duration: duration[0]
    };
  }

  static async getInterviewStatistics(user_id, user_type) {
    if (user_type === 'manager') {
      const [rows] = await pool.execute(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
          COUNT(CASE WHEN status = 'created' OR status = 'sent' THEN 1 END) as pending,
          AVG(CASE WHEN manager_rating IS NOT NULL THEN manager_rating END) as avg_rating
        FROM interviews i
        JOIN manager_profiles mp ON i.manager_id = mp.id
        WHERE mp.user_id = ? AND i.deleted_at IS NULL
      `, [user_id]);
      
      return rows[0];
    } else if (user_type === 'talent') {
      const [rows] = await pool.execute(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
          COUNT(CASE WHEN status = 'created' OR status = 'sent' THEN 1 END) as pending,
          AVG(CASE WHEN talent_rating IS NOT NULL THEN talent_rating END) as avg_rating
        FROM interviews i
        JOIN talent_profiles tp ON i.talent_id = tp.id
        WHERE tp.user_id = ? AND i.deleted_at IS NULL
      `, [user_id]);
      
      return rows[0];
    }
    
    return null;
  }
}

module.exports = Interview;
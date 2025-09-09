const { pool } = require('../config/database');

class Conversation {
  static async create({
    type,
    title = null,
    participant_1_id,
    participant_2_id,
    job_id = null,
    interview_id = null
  }) {
    // Ensure consistent participant ordering for direct conversations
    if (type === 'direct') {
      [participant_1_id, participant_2_id] = [participant_1_id, participant_2_id].sort((a, b) => a - b);
    }

    const [result] = await pool.execute(`
      INSERT INTO conversations (type, title, participant_1_id, participant_2_id, job_id, interview_id, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `, [type, title, participant_1_id, participant_2_id, job_id, interview_id]);

    return result.insertId;
  }

  static async findById(id) {
    const [rows] = await pool.execute(`
      SELECT * FROM conversation_summary WHERE id = ?
    `, [id]);

    return rows[0] || null;
  }

  static async findOrCreate({
    type,
    participant_1_id,
    participant_2_id,
    job_id = null,
    interview_id = null,
    title = null
  }) {
    // Ensure consistent participant ordering for direct conversations
    if (type === 'direct') {
      [participant_1_id, participant_2_id] = [participant_1_id, participant_2_id].sort((a, b) => a - b);
    }

    // Try to find existing conversation
    let whereClause = 'WHERE type = ? AND participant_1_id = ? AND participant_2_id = ?';
    let params = [type, participant_1_id, participant_2_id];

    if (job_id) {
      whereClause += ' AND job_id = ?';
      params.push(job_id);
    } else {
      whereClause += ' AND job_id IS NULL';
    }

    if (interview_id) {
      whereClause += ' AND interview_id = ?';
      params.push(interview_id);
    } else {
      whereClause += ' AND interview_id IS NULL';
    }

    const [existing] = await pool.execute(`
      SELECT * FROM conversations ${whereClause}
    `, params);

    if (existing.length > 0) {
      return existing[0];
    }

    // Create new conversation
    const conversationId = await this.create({
      type,
      title: title || this.generateTitle(type, job_id, interview_id),
      participant_1_id,
      participant_2_id,
      job_id,
      interview_id
    });

    return await this.findById(conversationId);
  }

  static generateTitle(type, job_id, interview_id) {
    switch (type) {
      case 'direct':
        return 'Direct Message';
      case 'job':
        return 'Job Discussion';
      case 'interview':
        return 'Interview Discussion';
      default:
        return 'Conversation';
    }
  }

  static async getUserConversations(user_id, type = null, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    let whereClause = 'WHERE (c.participant_1_id = ? OR c.participant_2_id = ?) AND c.status = "active"';
    let params = [user_id, user_id];

    if (type) {
      whereClause += ' AND c.type = ?';
      params.push(type);
    }

    const [rows] = await pool.execute(`
      SELECT 
        c.*,
        CASE 
          WHEN c.participant_1_id = ? THEN c.participant_2_id
          ELSE c.participant_1_id
        END as other_user_id,
        CASE 
          WHEN c.participant_1_id = ? THEN CONCAT(u2.first_name, ' ', u2.last_name)
          ELSE CONCAT(u1.first_name, ' ', u1.last_name)
        END as other_user_name,
        CASE 
          WHEN c.participant_1_id = ? THEN u2.email
          ELSE u1.email
        END as other_user_email,
        j.title as job_title,
        i.title as interview_title,
        i.status as interview_status,
        m.message as last_message,
        m.created_at as last_message_time,
        m.message_type as last_message_type,
        m.sender_id as last_message_sender_id,
        COUNT(CASE WHEN m2.is_read = 0 AND m2.receiver_id = ? THEN 1 END) as unread_count
      FROM conversations c
      LEFT JOIN users u1 ON c.participant_1_id = u1.id
      LEFT JOIN users u2 ON c.participant_2_id = u2.id
      LEFT JOIN jobs j ON c.job_id = j.id
      LEFT JOIN interviews i ON c.interview_id = i.id
      LEFT JOIN messages m ON c.last_message_id = m.id
      LEFT JOIN messages m2 ON c.id = m2.conversation_id AND m2.receiver_id = ?
      ${whereClause}
      GROUP BY c.id
      ORDER BY c.last_message_at DESC
      LIMIT ? OFFSET ?
    `, [user_id, user_id, user_id, user_id, user_id, ...params, limit, offset]);

    const [countRows] = await pool.execute(`
      SELECT COUNT(*) as total FROM conversations c ${whereClause}
    `, params);

    return {
      conversations: rows,
      total: countRows[0].total,
      page,
      totalPages: Math.ceil(countRows[0].total / limit)
    };
  }

  static async updateLastMessage(conversation_id, message_id) {
    const [result] = await pool.execute(`
      UPDATE conversations 
      SET last_message_id = ?, last_message_at = NOW(), updated_at = NOW()
      WHERE id = ?
    `, [message_id, conversation_id]);

    return result.affectedRows > 0;
  }

  static async archiveConversation(conversation_id, user_id) {
    // For now, we'll just update status to archived
    // In a more complex system, we might create user-specific archive states
    const [result] = await pool.execute(`
      UPDATE conversations 
      SET status = 'archived', updated_at = NOW()
      WHERE id = ? AND (participant_1_id = ? OR participant_2_id = ?)
    `, [conversation_id, user_id, user_id]);

    return result.affectedRows > 0;
  }

  static async blockConversation(conversation_id, blocked_by) {
    const [result] = await pool.execute(`
      UPDATE conversations 
      SET status = 'blocked', updated_at = NOW()
      WHERE id = ?
    `, [conversation_id]);

    return result.affectedRows > 0;
  }

  static async deleteConversation(conversation_id, user_id) {
    // Verify user is a participant
    const [conversation] = await pool.execute(`
      SELECT * FROM conversations 
      WHERE id = ? AND (participant_1_id = ? OR participant_2_id = ?)
    `, [conversation_id, user_id, user_id]);

    if (conversation.length === 0) {
      return false;
    }

    // Delete all messages in the conversation
    await pool.execute('DELETE FROM messages WHERE conversation_id = ?', [conversation_id]);

    // Delete the conversation
    const [result] = await pool.execute('DELETE FROM conversations WHERE id = ?', [conversation_id]);

    return result.affectedRows > 0;
  }

  static async getConversationMessages(conversation_id, user_id, page = 1, limit = 50) {
    // Verify user has access to this conversation
    const conversation = await this.findById(conversation_id);
    if (!conversation || (conversation.participant_1_id !== user_id && conversation.participant_2_id !== user_id)) {
      throw new Error('Access denied to this conversation');
    }

    const offset = (page - 1) * limit;

    const [rows] = await pool.execute(`
      SELECT 
        m.*,
        sender.first_name as sender_first_name, 
        sender.last_name as sender_last_name,
        sender.email as sender_email,
        receiver.first_name as receiver_first_name, 
        receiver.last_name as receiver_last_name,
        receiver.email as receiver_email,
        ma.file_name as attachment_file_name,
        ma.file_path as attachment_file_path,
        ma.file_size as attachment_file_size,
        ma.file_type as attachment_file_type
      FROM messages m
      JOIN users sender ON m.sender_id = sender.id
      JOIN users receiver ON m.receiver_id = receiver.id
      LEFT JOIN message_attachments ma ON m.id = ma.message_id
      WHERE m.conversation_id = ? AND m.is_flagged = FALSE
      ORDER BY m.created_at ASC
      LIMIT ? OFFSET ?
    `, [conversation_id, limit, offset]);

    const [countRows] = await pool.execute(
      'SELECT COUNT(*) as total FROM messages WHERE conversation_id = ? AND is_flagged = FALSE',
      [conversation_id]
    );

    // Mark messages as read for this user
    await pool.execute(`
      UPDATE messages 
      SET is_read = TRUE 
      WHERE conversation_id = ? AND receiver_id = ? AND is_read = FALSE
    `, [conversation_id, user_id]);

    return {
      messages: rows,
      total: countRows[0].total,
      page,
      totalPages: Math.ceil(countRows[0].total / limit)
    };
  }

  static async searchConversations(user_id, query, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const searchTerm = `%${query}%`;

    const [rows] = await pool.execute(`
      SELECT DISTINCT
        c.*,
        CASE 
          WHEN c.participant_1_id = ? THEN CONCAT(u2.first_name, ' ', u2.last_name)
          ELSE CONCAT(u1.first_name, ' ', u1.last_name)
        END as other_user_name,
        j.title as job_title,
        i.title as interview_title
      FROM conversations c
      LEFT JOIN users u1 ON c.participant_1_id = u1.id
      LEFT JOIN users u2 ON c.participant_2_id = u2.id
      LEFT JOIN jobs j ON c.job_id = j.id
      LEFT JOIN interviews i ON c.interview_id = i.id
      LEFT JOIN messages m ON c.id = m.conversation_id
      WHERE (c.participant_1_id = ? OR c.participant_2_id = ?)
        AND c.status = 'active'
        AND (
          c.title LIKE ? OR
          u1.first_name LIKE ? OR u1.last_name LIKE ? OR
          u2.first_name LIKE ? OR u2.last_name LIKE ? OR
          j.title LIKE ? OR
          i.title LIKE ? OR
          m.message LIKE ?
        )
      ORDER BY c.last_message_at DESC
      LIMIT ? OFFSET ?
    `, [
      user_id, user_id, user_id,
      searchTerm, searchTerm, searchTerm, searchTerm, searchTerm,
      searchTerm, searchTerm, searchTerm,
      limit, offset
    ]);

    return {
      conversations: rows,
      page,
      total: rows.length
    };
  }

  static async getConversationStatistics(user_id) {
    const [stats] = await pool.execute(`
      SELECT 
        COUNT(*) as total_conversations,
        COUNT(CASE WHEN c.type = 'direct' THEN 1 END) as direct_conversations,
        COUNT(CASE WHEN c.type = 'job' THEN 1 END) as job_conversations,
        COUNT(CASE WHEN c.type = 'interview' THEN 1 END) as interview_conversations,
        COUNT(CASE WHEN m.is_read = FALSE AND m.receiver_id = ? THEN 1 END) as total_unread
      FROM conversations c
      LEFT JOIN messages m ON c.id = m.conversation_id
      WHERE (c.participant_1_id = ? OR c.participant_2_id = ?)
        AND c.status = 'active'
    `, [user_id, user_id, user_id]);

    return stats[0];
  }

  static async canUserAccessConversation(conversation_id, user_id) {
    const [rows] = await pool.execute(`
      SELECT 1 FROM conversations 
      WHERE id = ? AND (participant_1_id = ? OR participant_2_id = ?)
    `, [conversation_id, user_id, user_id]);

    return rows.length > 0;
  }
}

module.exports = Conversation;
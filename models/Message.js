const { pool } = require('../config/database');
const validator = require('validator');
const { v4: uuidv4 } = require('uuid');

class Message {
  static async create({ 
    job_id, 
    sender_id, 
    receiver_id, 
    message, 
    message_type = 'text',
    file_url = null,
    file_name = null,
    file_size = null,
    file_type = null,
    conversation_id = null,
    conversation_type = 'job',
    parent_message_id = null,
    metadata = null
  }) {
    // Content filtering before insertion
    const contentViolations = await this.checkContentViolations(message);
    const is_flagged = contentViolations.length > 0;
    
    const [result] = await pool.execute(
      `INSERT INTO messages (
        job_id, sender_id, receiver_id, message, message_type,
        file_url, file_name, file_size, file_type, conversation_id,
        conversation_type, parent_message_id, metadata, is_flagged
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        job_id, sender_id, receiver_id, message, message_type,
        file_url, file_name, file_size, file_type, conversation_id,
        conversation_type, parent_message_id, 
        metadata ? JSON.stringify(metadata) : null,
        is_flagged
      ]
    );
    
    const messageId = result.insertId;
    
    // Log content violations if any
    if (contentViolations.length > 0) {
      await this.logContentViolations(messageId, contentViolations);
    }
    
    return messageId;
  }

  static async findById(id) {
    const [rows] = await pool.execute(`
      SELECT m.*,
             sender.first_name as sender_first_name, sender.last_name as sender_last_name,
             receiver.first_name as receiver_first_name, receiver.last_name as receiver_last_name,
             j.title as job_title
      FROM messages m
      JOIN users sender ON m.sender_id = sender.id
      JOIN users receiver ON m.receiver_id = receiver.id
      JOIN jobs j ON m.job_id = j.id
      WHERE m.id = ?
    `, [id]);
    
    return rows[0];
  }

  static async getConversation(job_id, user1_id, user2_id, page = 1, limit = 50) {
    const offset = (page - 1) * limit;
    
    const [rows] = await pool.execute(`
      SELECT m.*,
             sender.first_name as sender_first_name, sender.last_name as sender_last_name,
             receiver.first_name as receiver_first_name, receiver.last_name as receiver_last_name
      FROM messages m
      JOIN users sender ON m.sender_id = sender.id
      JOIN users receiver ON m.receiver_id = receiver.id
      WHERE m.job_id = ? 
        AND ((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
    `, [job_id, user1_id, user2_id, user2_id, user1_id, limit, offset]);
    
    const [countRows] = await pool.execute(`
      SELECT COUNT(*) as total
      FROM messages
      WHERE job_id = ? 
        AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
    `, [job_id, user1_id, user2_id, user2_id, user1_id]);
    
    return {
      messages: rows.reverse(), // Show oldest first
      total: countRows[0].total,
      page,
      totalPages: Math.ceil(countRows[0].total / limit)
    };
  }

  static async getUserConversations(user_id, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    
    // Get latest message for each job where user is involved
    const [rows] = await pool.execute(`
      SELECT DISTINCT
        j.id as job_id,
        j.title as job_title,
        j.status as job_status,
        CASE 
          WHEN m.sender_id = ? THEN m.receiver_id 
          ELSE m.sender_id 
        END as other_user_id,
        CASE 
          WHEN m.sender_id = ? THEN CONCAT(receiver.first_name, ' ', receiver.last_name)
          ELSE CONCAT(sender.first_name, ' ', sender.last_name)
        END as other_user_name,
        m.message as last_message,
        m.created_at as last_message_time,
        m.is_read,
        m.sender_id = ? as is_sender,
        COUNT(CASE WHEN m2.is_read = 0 AND m2.receiver_id = ? THEN 1 END) as unread_count
      FROM messages m
      JOIN jobs j ON m.job_id = j.id
      JOIN users sender ON m.sender_id = sender.id
      JOIN users receiver ON m.receiver_id = receiver.id
      LEFT JOIN messages m2 ON j.id = m2.job_id AND 
        ((m2.sender_id = ? AND m2.receiver_id != ?) OR (m2.receiver_id = ? AND m2.sender_id != ?))
      WHERE (m.sender_id = ? OR m.receiver_id = ?)
        AND m.created_at = (
          SELECT MAX(created_at) 
          FROM messages 
          WHERE job_id = j.id 
            AND ((sender_id = ? AND receiver_id != ?) OR (receiver_id = ? AND sender_id != ?))
        )
      GROUP BY j.id, other_user_id
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
    `, [
      user_id, user_id, user_id, user_id,
      user_id, user_id, user_id, user_id,
      user_id, user_id,
      user_id, user_id, user_id, user_id,
      limit, offset
    ]);
    
    return {
      conversations: rows,
      page,
      total: rows.length
    };
  }

  static async markAsRead(job_id, receiver_id) {
    const [result] = await pool.execute(
      'UPDATE messages SET is_read = true WHERE job_id = ? AND receiver_id = ? AND is_read = false',
      [job_id, receiver_id]
    );
    
    return result.affectedRows;
  }

  static async getUnreadCount(user_id) {
    const [rows] = await pool.execute(
      'SELECT COUNT(*) as unread_count FROM messages WHERE receiver_id = ? AND is_read = false',
      [user_id]
    );
    
    return rows[0].unread_count;
  }

  static async canUserAccessConversation(job_id, user_id) {
    // Check if user is either the job poster or has a proposal for the job
    const [rows] = await pool.execute(`
      SELECT 1 FROM (
        SELECT j.manager_id as profile_id, 'manager' as role
        FROM jobs j
        JOIN manager_profiles mp ON j.manager_id = mp.id
        WHERE j.id = ? AND mp.user_id = ?
        
        UNION
        
        SELECT p.talent_id as profile_id, 'talent' as role
        FROM proposals p
        JOIN talent_profiles tp ON p.talent_id = tp.id
        WHERE p.job_id = ? AND tp.user_id = ?
      ) as access_check
    `, [job_id, user_id, job_id, user_id]);
    
    return rows.length > 0;
  }

  static async deleteConversation(job_id, user1_id, user2_id) {
    const [result] = await pool.execute(`
      DELETE FROM messages 
      WHERE job_id = ? 
        AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
    `, [job_id, user1_id, user2_id, user2_id, user1_id]);
    
    return result.affectedRows;
  }

  // Enhanced messaging methods
  static async createDirectMessage({ sender_id, receiver_id, message, message_type = 'text', file_data = null }) {
    // First, find or create conversation
    const conversation = await this.findOrCreateDirectConversation(sender_id, receiver_id);
    
    return await this.create({
      job_id: null,
      sender_id,
      receiver_id,
      message,
      message_type,
      conversation_id: conversation.id,
      conversation_type: 'direct',
      ...file_data
    });
  }

  static async findOrCreateDirectConversation(user1_id, user2_id) {
    // Ensure consistent ordering for participant IDs
    const [participant1, participant2] = [user1_id, user2_id].sort((a, b) => a - b);
    
    // Check if conversation exists
    const [existing] = await pool.execute(`
      SELECT * FROM conversations 
      WHERE type = 'direct' 
        AND participant_1_id = ? 
        AND participant_2_id = ?
    `, [participant1, participant2]);
    
    if (existing.length > 0) {
      return existing[0];
    }
    
    // Create new conversation
    const [result] = await pool.execute(`
      INSERT INTO conversations (type, participant_1_id, participant_2_id, title)
      VALUES ('direct', ?, ?, 'Direct Message')
    `, [participant1, participant2]);
    
    return { id: result.insertId, type: 'direct', participant_1_id: participant1, participant_2_id: participant2 };
  }

  static async getDirectConversations(user_id, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    
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
        m.message as last_message,
        m.created_at as last_message_time,
        m.message_type as last_message_type,
        COUNT(CASE WHEN m2.is_read = 0 AND m2.receiver_id = ? THEN 1 END) as unread_count
      FROM conversations c
      LEFT JOIN users u1 ON c.participant_1_id = u1.id
      LEFT JOIN users u2 ON c.participant_2_id = u2.id
      LEFT JOIN messages m ON c.last_message_id = m.id
      LEFT JOIN messages m2 ON c.id = m2.conversation_id AND m2.receiver_id = ?
      WHERE c.type = 'direct' 
        AND (c.participant_1_id = ? OR c.participant_2_id = ?)
        AND c.status = 'active'
      GROUP BY c.id
      ORDER BY c.last_message_at DESC
      LIMIT ? OFFSET ?
    `, [user_id, user_id, user_id, user_id, user_id, user_id, user_id, limit, offset]);
    
    return {
      conversations: rows,
      page,
      total: rows.length
    };
  }

  static async getConversationMessages(conversation_id, page = 1, limit = 50) {
    const offset = (page - 1) * limit;
    
    const [rows] = await pool.execute(`
      SELECT 
        m.*,
        sender.first_name as sender_first_name, 
        sender.last_name as sender_last_name,
        sender.email as sender_email,
        receiver.first_name as receiver_first_name, 
        receiver.last_name as receiver_last_name,
        receiver.email as receiver_email
      FROM messages m
      JOIN users sender ON m.sender_id = sender.id
      JOIN users receiver ON m.receiver_id = receiver.id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at ASC
      LIMIT ? OFFSET ?
    `, [conversation_id, limit, offset]);
    
    const [countRows] = await pool.execute(
      'SELECT COUNT(*) as total FROM messages WHERE conversation_id = ?',
      [conversation_id]
    );
    
    return {
      messages: rows,
      total: countRows[0].total,
      page,
      totalPages: Math.ceil(countRows[0].total / limit)
    };
  }

  static async flagMessage(message_id, flagged_by, reason) {
    const [result] = await pool.execute(`
      UPDATE messages 
      SET is_flagged = TRUE, flagged_reason = ?, flagged_by = ?, flagged_at = NOW()
      WHERE id = ?
    `, [reason, flagged_by, message_id]);
    
    return result.affectedRows > 0;
  }

  static async checkContentViolations(message) {
    const violations = [];
    
    // Email detection
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = message.match(emailRegex);
    if (emails) {
      violations.push({ type: 'email', content: emails.join(', '), confidence: 1.0 });
    }
    
    // Phone number detection (various formats)
    const phoneRegex = /(\+?\d{1,4}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;
    const phones = message.match(phoneRegex);
    if (phones) {
      violations.push({ type: 'phone', content: phones.join(', '), confidence: 0.8 });
    }
    
    // External links detection
    const linkRegex = /(https?:\/\/[^\s]+)/g;
    const links = message.match(linkRegex);
    if (links) {
      violations.push({ type: 'external_link', content: links.join(', '), confidence: 0.9 });
    }
    
    return violations;
  }

  static async logContentViolations(message_id, violations) {
    for (const violation of violations) {
      await pool.execute(`
        INSERT INTO content_filter_violations 
        (message_id, violation_type, detected_content, confidence_score, action_taken)
        VALUES (?, ?, ?, ?, 'flagged')
      `, [message_id, violation.type, violation.content, violation.confidence]);
    }
  }

  static async markAsRead(message_id, user_id) {
    // Insert read receipt
    await pool.execute(`
      INSERT IGNORE INTO message_read_receipts (message_id, user_id, read_at)
      VALUES (?, ?, NOW())
    `, [message_id, user_id]);
    
    // Update message read status
    const [result] = await pool.execute(
      'UPDATE messages SET is_read = TRUE WHERE id = ? AND receiver_id = ?',
      [message_id, user_id]
    );
    
    return result.affectedRows > 0;
  }

  static async deleteMessage(message_id, user_id) {
    // Soft delete - only if user is sender
    const [result] = await pool.execute(
      'UPDATE messages SET message = "[Message deleted]", edited_at = NOW() WHERE id = ? AND sender_id = ?',
      [message_id, user_id]
    );
    
    return result.affectedRows > 0;
  }

  static async editMessage(message_id, user_id, new_message) {
    // Check content violations for edited message
    const violations = await this.checkContentViolations(new_message);
    const is_flagged = violations.length > 0;
    
    const [result] = await pool.execute(`
      UPDATE messages 
      SET message = ?, edited_at = NOW(), is_flagged = ?
      WHERE id = ? AND sender_id = ?
    `, [new_message, is_flagged, message_id, user_id]);
    
    if (violations.length > 0) {
      await this.logContentViolations(message_id, violations);
    }
    
    return result.affectedRows > 0;
  }

  static async getFlaggedMessages(page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    
    const [rows] = await pool.execute(`
      SELECT 
        m.*,
        sender.first_name as sender_first_name,
        sender.last_name as sender_last_name,
        receiver.first_name as receiver_first_name,
        receiver.last_name as receiver_last_name,
        cfv.violation_type,
        cfv.detected_content,
        cfv.confidence_score
      FROM messages m
      JOIN users sender ON m.sender_id = sender.id
      JOIN users receiver ON m.receiver_id = receiver.id
      LEFT JOIN content_filter_violations cfv ON m.id = cfv.message_id
      WHERE m.is_flagged = TRUE
      ORDER BY m.flagged_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);
    
    const [countRows] = await pool.execute(
      'SELECT COUNT(*) as total FROM messages WHERE is_flagged = TRUE'
    );
    
    return {
      messages: rows,
      total: countRows[0].total,
      page,
      totalPages: Math.ceil(countRows[0].total / limit)
    };
  }
}

module.exports = Message;
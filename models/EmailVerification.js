const { pool } = require('../config/database');

class EmailVerification {
  static async create({ userId, email, verificationCode, expiresAt }) {
    const [result] = await pool.execute(
      'INSERT INTO email_verification_codes (user_id, email, verification_code, expires_at) VALUES (?, ?, ?, ?)',
      [userId, email, verificationCode, expiresAt]
    );
    
    return result.insertId;
  }

  static async findByUserAndCode(userId, code) {
    const [rows] = await pool.execute(
      `SELECT * FROM email_verification_codes 
       WHERE user_id = ? AND verification_code = ? AND used_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [userId, code]
    );
    
    return rows[0];
  }

  static async findLatestByUser(userId) {
    const [rows] = await pool.execute(
      `SELECT * FROM email_verification_codes 
       WHERE user_id = ? AND used_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    
    return rows[0];
  }

  static async markAsUsed(id) {
    const [result] = await pool.execute(
      'UPDATE email_verification_codes SET used_at = NOW() WHERE id = ?',
      [id]
    );
    
    return result.affectedRows > 0;
  }

  static async deleteExpired() {
    const [result] = await pool.execute(
      'DELETE FROM email_verification_codes WHERE expires_at < NOW()'
    );
    
    return result.affectedRows;
  }

  static async deleteUserCodes(userId) {
    const [result] = await pool.execute(
      'DELETE FROM email_verification_codes WHERE user_id = ?',
      [userId]
    );
    
    return result.affectedRows;
  }

  static generateCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  static getExpiryTime(minutes = 15) {
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + minutes);
    return expiry;
  }
}

module.exports = EmailVerification;
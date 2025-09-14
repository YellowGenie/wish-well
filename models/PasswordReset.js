const pool = require('../config/database');
const crypto = require('crypto');

class PasswordReset {
  static async create({ user_id, email, token, expires_at }) {
    const query = `
      INSERT INTO password_resets (user_id, email, token, expires_at, created_at)
      VALUES (?, ?, ?, ?, NOW())
    `;

    const [result] = await pool.execute(query, [user_id, email, token, expires_at]);
    return result.insertId;
  }

  static async findByToken(token) {
    const query = `
      SELECT pr.*, u.email, u.first_name, u.last_name
      FROM password_resets pr
      JOIN users u ON pr.user_id = u.id
      WHERE pr.token = ?
      AND pr.expires_at > NOW()
      AND pr.used_at IS NULL
      ORDER BY pr.created_at DESC
      LIMIT 1
    `;

    const [rows] = await pool.execute(query, [token]);
    return rows[0];
  }

  static async findByEmail(email) {
    const query = `
      SELECT pr.*
      FROM password_resets pr
      JOIN users u ON pr.user_id = u.id
      WHERE u.email = ?
      AND pr.expires_at > NOW()
      AND pr.used_at IS NULL
      ORDER BY pr.created_at DESC
      LIMIT 1
    `;

    const [rows] = await pool.execute(query, [email]);
    return rows[0];
  }

  static async markAsUsed(token) {
    const query = `
      UPDATE password_resets
      SET used_at = NOW()
      WHERE token = ?
    `;

    await pool.execute(query, [token]);
  }

  static async deleteExpiredTokens() {
    const query = `
      DELETE FROM password_resets
      WHERE expires_at < NOW() OR used_at IS NOT NULL
    `;

    await pool.execute(query);
  }

  static async deleteByUserId(user_id) {
    const query = `
      DELETE FROM password_resets
      WHERE user_id = ?
    `;

    await pool.execute(query, [user_id]);
  }

  static generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  static getExpiryTime(hours = 1) {
    const expiryTime = new Date();
    expiryTime.setHours(expiryTime.getHours() + hours);
    return expiryTime;
  }
}

module.exports = PasswordReset;
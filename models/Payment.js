const { pool } = require('../config/database');

class Payment {
  static async create({ 
    user_id, 
    stripe_customer_id, 
    stripe_payment_intent_id, 
    amount, 
    currency, 
    status, 
    job_id, 
    description 
  }) {
    const [result] = await pool.execute(
      `INSERT INTO payments (user_id, stripe_customer_id, stripe_payment_intent_id, amount, currency, status, job_id, description, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [user_id, stripe_customer_id, stripe_payment_intent_id, amount, currency, status, job_id, description]
    );
    
    return result.insertId;
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM payments WHERE id = ?',
      [id]
    );
    
    return rows[0];
  }

  static async findByPaymentIntentId(stripe_payment_intent_id) {
    const [rows] = await pool.execute(
      'SELECT * FROM payments WHERE stripe_payment_intent_id = ?',
      [stripe_payment_intent_id]
    );
    
    return rows[0];
  }

  static async findByUserId(user_id, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    
    const [rows] = await pool.execute(`
      SELECT p.*, j.title as job_title
      FROM payments p
      LEFT JOIN jobs j ON p.job_id = j.id
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `, [user_id, limit, offset]);
    
    const [countRows] = await pool.execute(
      'SELECT COUNT(*) as total FROM payments WHERE user_id = ?',
      [user_id]
    );
    
    return {
      payments: rows,
      total: countRows[0].total,
      page,
      totalPages: Math.ceil(countRows[0].total / limit)
    };
  }

  static async updateStatus(id, status) {
    const [result] = await pool.execute(
      'UPDATE payments SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, id]
    );
    
    return result.affectedRows > 0;
  }

  static async updateByPaymentIntentId(stripe_payment_intent_id, updates) {
    const fields = [];
    const values = [];
    
    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(updates[key]);
      }
    });
    
    if (fields.length === 0) return false;
    
    fields.push('updated_at = NOW()');
    values.push(stripe_payment_intent_id);
    
    const [result] = await pool.execute(
      `UPDATE payments SET ${fields.join(', ')} WHERE stripe_payment_intent_id = ?`,
      values
    );
    
    return result.affectedRows > 0;
  }
}

module.exports = Payment;
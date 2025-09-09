const { pool } = require('../config/database');

class CustomerCard {
  static async create({ 
    user_id, 
    stripe_customer_id, 
    stripe_payment_method_id, 
    last_four, 
    brand, 
    exp_month, 
    exp_year, 
    is_default 
  }) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // If this is being set as default, unset all other default cards for this user
      if (is_default) {
        await connection.execute(
          'UPDATE customer_cards SET is_default = FALSE WHERE user_id = ?',
          [user_id]
        );
      }
      
      const [result] = await connection.execute(
        `INSERT INTO customer_cards (user_id, stripe_customer_id, stripe_payment_method_id, last_four, brand, exp_month, exp_year, is_default, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [user_id, stripe_customer_id, stripe_payment_method_id, last_four, brand, exp_month, exp_year, is_default]
      );
      
      await connection.commit();
      return result.insertId;
      
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async findByUserId(user_id) {
    const [rows] = await pool.execute(
      'SELECT * FROM customer_cards WHERE user_id = ? ORDER BY is_default DESC, created_at DESC',
      [user_id]
    );
    
    return rows;
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM customer_cards WHERE id = ?',
      [id]
    );
    
    return rows[0];
  }

  static async findByPaymentMethodId(stripe_payment_method_id) {
    const [rows] = await pool.execute(
      'SELECT * FROM customer_cards WHERE stripe_payment_method_id = ?',
      [stripe_payment_method_id]
    );
    
    return rows[0];
  }

  static async setDefault(user_id, card_id) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Unset all default cards for this user
      await connection.execute(
        'UPDATE customer_cards SET is_default = FALSE WHERE user_id = ?',
        [user_id]
      );
      
      // Set the specified card as default
      const [result] = await connection.execute(
        'UPDATE customer_cards SET is_default = TRUE WHERE id = ? AND user_id = ?',
        [card_id, user_id]
      );
      
      await connection.commit();
      return result.affectedRows > 0;
      
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async delete(id, user_id) {
    const [result] = await pool.execute(
      'DELETE FROM customer_cards WHERE id = ? AND user_id = ?',
      [id, user_id]
    );
    
    return result.affectedRows > 0;
  }

  static async getDefaultCard(user_id) {
    const [rows] = await pool.execute(
      'SELECT * FROM customer_cards WHERE user_id = ? AND is_default = TRUE LIMIT 1',
      [user_id]
    );
    
    return rows[0];
  }
}

module.exports = CustomerCard;
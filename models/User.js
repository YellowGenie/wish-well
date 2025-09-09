const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
  static async create({ email, password, role, first_name, last_name }) {
    const hashedPassword = await bcrypt.hash(password, 12);
    
    const [result] = await pool.execute(
      'INSERT INTO users (email, password, role, first_name, last_name) VALUES (?, ?, ?, ?, ?)',
      [email, hashedPassword, role, first_name, last_name]
    );
    
    return result.insertId;
  }

  static async findByEmail(email) {
    const [rows] = await pool.execute(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    
    return rows[0];
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT id, email, role, first_name, last_name, profile_image, is_active, email_verified, created_at FROM users WHERE id = ?',
      [id]
    );
    
    return rows[0];
  }

  static async updateProfile(id, updates) {
    const fields = [];
    const values = [];
    
    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(updates[key]);
      }
    });
    
    if (fields.length === 0) return false;
    
    values.push(id);
    
    const [result] = await pool.execute(
      `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
    
    return result.affectedRows > 0;
  }

  static async validatePassword(inputPassword, hashedPassword) {
    return await bcrypt.compare(inputPassword, hashedPassword);
  }

  static async getAllUsers(role = null, page = 1, limit = 20) {
    try {
      // Ensure parameters are integers and safe
      const parsedLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 1000);
      const parsedPage = Math.max(parseInt(page) || 1, 1);
      const offset = (parsedPage - 1) * parsedLimit;
      
      // Use a simple query without parameterized LIMIT/OFFSET
      let baseQuery = `
        SELECT id, email, role, first_name, last_name, profile_image,
               is_active, email_verified as is_verified,
               created_at, updated_at
        FROM users
      `;
      
      let params = [];
      
      // Add WHERE clause for role filter
      if (role && role !== 'all' && role !== null && role !== '') {
        baseQuery += ' WHERE role = ?';
        params.push(role);
      }
      
      // Complete the query with LIMIT and OFFSET as literals
      const query = baseQuery + ` ORDER BY created_at DESC LIMIT ${parsedLimit} OFFSET ${offset}`;

      console.log('Executing getAllUsers query:', query);
      console.log('With params:', params);

      const [rows] = await pool.execute(query, params);
      console.log(`Found ${rows.length} users`);
      
      // Get total count for pagination  
      let countQuery = 'SELECT COUNT(*) as total FROM users';
      let countParams = [];
      
      if (role && role !== 'all' && role !== null && role !== '') {
        countQuery += ' WHERE role = ?';
        countParams.push(role);
      }
      
      const [countRows] = await pool.execute(countQuery, countParams);
      const total = countRows[0].total;
      
      return {
        users: rows,
        total: total,
        page: parsedPage,
        totalPages: Math.ceil(total / parsedLimit)
      };
    } catch (error) {
      console.error('getAllUsers error:', error);
      throw error;
    }
  }

  static async deactivateUser(id) {
    const [result] = await pool.execute(
      'UPDATE users SET is_active = false WHERE id = ?',
      [id]
    );
    
    return result.affectedRows > 0;
  }

  static async softDeleteUser(id, deletedBy, reason = null) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      // Get user data before deletion
      const [userRows] = await connection.execute(
        'SELECT * FROM users WHERE id = ?',
        [id]
      );
      
      if (userRows.length === 0) {
        await connection.rollback();
        connection.release();
        return { success: false, error: 'User not found' };
      }

      const user = userRows[0];

      // Get profile data based on user role
      let profileData = null;
      if (user.role === 'talent') {
        const [profileRows] = await connection.execute(
          'SELECT * FROM talent_profiles WHERE user_id = ?',
          [id]
        );
        profileData = profileRows[0] || null;
      } else if (user.role === 'manager') {
        const [profileRows] = await connection.execute(
          'SELECT * FROM manager_profiles WHERE user_id = ?',
          [id]
        );
        profileData = profileRows[0] || null;
      }

      // Insert into deleted_users table
      await connection.execute(`
        INSERT INTO deleted_users (
          original_user_id, email, first_name, last_name, role, 
          profile_image, user_data, profile_data, deletion_reason, 
          deleted_by, original_created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        user.id,
        user.email,
        user.first_name,
        user.last_name,
        user.role,
        user.profile_image,
        JSON.stringify(user),
        JSON.stringify(profileData),
        reason,
        deletedBy,
        user.created_at
      ]);

      // Delete the user (CASCADE will handle related records)
      const [deleteResult] = await connection.execute(
        'DELETE FROM users WHERE id = ?',
        [id]
      );

      await connection.commit();
      connection.release();
      
      return { 
        success: true, 
        affectedRows: deleteResult.affectedRows,
        deletedUser: {
          id: user.id,
          email: user.email,
          name: `${user.first_name} ${user.last_name}`
        }
      };
    } catch (error) {
      await connection.rollback();
      connection.release();
      console.error('Soft delete user error:', error);
      return { success: false, error: error.message };
    }
  }

  static async hardDeleteUser(id) {
    try {
      // Get user info for return data
      const [userRows] = await pool.execute(
        'SELECT id, email, first_name, last_name FROM users WHERE id = ?',
        [id]
      );
      
      if (userRows.length === 0) {
        return { success: false, error: 'User not found' };
      }

      const user = userRows[0];

      // Hard delete (CASCADE will handle all related records)
      const [result] = await pool.execute(
        'DELETE FROM users WHERE id = ?',
        [id]
      );
      
      return { 
        success: true, 
        affectedRows: result.affectedRows,
        deletedUser: {
          id: user.id,
          email: user.email,
          name: `${user.first_name} ${user.last_name}`
        }
      };
    } catch (error) {
      console.error('Hard delete user error:', error);
      return { success: false, error: error.message };
    }
  }

  static async getDeletedUsers(page = 1, limit = 20) {
    try {
      const parsedLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
      const parsedPage = Math.max(parseInt(page) || 1, 1);
      const offset = (parsedPage - 1) * parsedLimit;
      
      const query = `
        SELECT du.*, u.first_name as deleted_by_name, u.last_name as deleted_by_last_name
        FROM deleted_users du
        LEFT JOIN users u ON du.deleted_by = u.id
        ORDER BY du.deleted_at DESC 
        LIMIT ${parsedLimit} OFFSET ${offset}
      `;

      const [rows] = await pool.execute(query);
      
      // Get total count
      const [countRows] = await pool.execute('SELECT COUNT(*) as total FROM deleted_users');
      const total = countRows[0].total;
      
      return {
        deletedUsers: rows,
        total: total,
        page: parsedPage,
        totalPages: Math.ceil(total / parsedLimit)
      };
    } catch (error) {
      console.error('Get deleted users error:', error);
      throw error;
    }
  }

  static async restoreUser(deletedUserId, restoredBy) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      // Get deleted user data
      const [deletedRows] = await connection.execute(
        'SELECT * FROM deleted_users WHERE id = ?',
        [deletedUserId]
      );
      
      if (deletedRows.length === 0) {
        await connection.rollback();
        connection.release();
        return { success: false, error: 'Deleted user not found' };
      }

      const deletedUser = deletedRows[0];
      const userData = JSON.parse(deletedUser.user_data);
      const profileData = deletedUser.profile_data ? JSON.parse(deletedUser.profile_data) : null;

      // Check if email already exists
      const [existingUser] = await connection.execute(
        'SELECT id FROM users WHERE email = ?',
        [deletedUser.email]
      );
      
      if (existingUser.length > 0) {
        await connection.rollback();
        connection.release();
        return { success: false, error: 'Email already exists in active users' };
      }

      // Restore user to users table
      await connection.execute(`
        INSERT INTO users (
          email, password, role, first_name, last_name, 
          profile_image, is_active, email_verified, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        userData.email,
        userData.password,
        userData.role,
        userData.first_name,
        userData.last_name,
        userData.profile_image,
        userData.is_active,
        userData.email_verified,
        userData.created_at
      ]);

      const [result] = await connection.execute('SELECT LAST_INSERT_ID() as id');
      const newUserId = result[0].id;

      // Restore profile data if exists
      if (profileData) {
        if (userData.role === 'talent') {
          await connection.execute(`
            INSERT INTO talent_profiles (
              user_id, title, bio, hourly_rate, availability, 
              location, portfolio_description, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            newUserId,
            profileData.title || '',
            profileData.bio || '',
            profileData.hourly_rate,
            profileData.availability || 'contract',
            profileData.location || '',
            profileData.portfolio_description || '',
            profileData.created_at,
            profileData.updated_at
          ]);
        } else if (userData.role === 'manager') {
          await connection.execute(`
            INSERT INTO manager_profiles (
              user_id, company_name, company_description, company_size, 
              industry, location, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            newUserId,
            profileData.company_name || '',
            profileData.company_description || '',
            profileData.company_size,
            profileData.industry || '',
            profileData.location || '',
            profileData.created_at,
            profileData.updated_at
          ]);
        }
      }

      // Remove from deleted_users table
      await connection.execute(
        'DELETE FROM deleted_users WHERE id = ?',
        [deletedUserId]
      );

      await connection.commit();
      connection.release();
      
      return { 
        success: true, 
        restoredUser: {
          id: newUserId,
          email: userData.email,
          name: `${userData.first_name} ${userData.last_name}`,
          role: userData.role
        }
      };
    } catch (error) {
      await connection.rollback();
      connection.release();
      console.error('Restore user error:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = User;
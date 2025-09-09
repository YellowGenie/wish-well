const { pool } = require('../config/database');

class AdminNotificationTemplate {
  static async create(templateData) {
    const {
      created_by,
      template_name,
      template_description = null,
      title,
      message,
      notification_type = 'modal',
      display_settings = null,
      modal_size = 'medium',
      default_target_audience = 'both',
      default_priority = 'normal'
    } = templateData;

    try {
      const [result] = await pool.execute(`
        INSERT INTO admin_notification_templates (
          created_by, template_name, template_description, title, message,
          notification_type, display_settings, modal_size,
          default_target_audience, default_priority
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        created_by, template_name, template_description, title, message,
        notification_type, JSON.stringify(display_settings), modal_size,
        default_target_audience, default_priority
      ]);

      return result.insertId;
    } catch (error) {
      console.error('Error creating notification template:', error);
      throw error;
    }
  }

  static async findById(id) {
    try {
      const [rows] = await pool.execute(`
        SELECT ant.*, u.first_name, u.last_name, u.email as creator_email
        FROM admin_notification_templates ant
        JOIN users u ON ant.created_by = u.id
        WHERE ant.id = ?
      `, [id]);

      if (rows.length === 0) return null;

      const template = rows[0];
      template.display_settings = template.display_settings ? JSON.parse(template.display_settings) : null;

      return template;
    } catch (error) {
      console.error('Error finding notification template:', error);
      throw error;
    }
  }

  static async findAll(options = {}) {
    const {
      limit = 50,
      offset = 0,
      created_by = null,
      is_active = null,
      search = null,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = options;

    try {
      let query = `
        SELECT ant.*, u.first_name, u.last_name, u.email as creator_email
        FROM admin_notification_templates ant
        JOIN users u ON ant.created_by = u.id
        WHERE 1=1
      `;
      const params = [];

      if (created_by) {
        query += ' AND ant.created_by = ?';
        params.push(created_by);
      }

      if (is_active !== null) {
        query += ' AND ant.is_active = ?';
        params.push(is_active);
      }

      if (search) {
        query += ' AND (ant.template_name LIKE ? OR ant.title LIKE ? OR ant.message LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      query += ` ORDER BY ant.${sort_by} ${sort_order} LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const [rows] = await pool.execute(query, params);

      return rows.map(template => ({
        ...template,
        display_settings: template.display_settings ? JSON.parse(template.display_settings) : null
      }));
    } catch (error) {
      console.error('Error finding notification templates:', error);
      throw error;
    }
  }

  static async update(id, updateData) {
    const allowedFields = [
      'template_name', 'template_description', 'title', 'message',
      'notification_type', 'display_settings', 'modal_size',
      'default_target_audience', 'default_priority', 'is_active'
    ];

    const fields = [];
    const values = [];

    Object.keys(updateData).forEach(key => {
      if (allowedFields.includes(key) && updateData[key] !== undefined) {
        fields.push(`${key} = ?`);
        
        // JSON fields need to be stringified
        if (key === 'display_settings') {
          values.push(JSON.stringify(updateData[key]));
        } else {
          values.push(updateData[key]);
        }
      }
    });

    if (fields.length === 0) return false;

    values.push(id);

    try {
      const [result] = await pool.execute(
        `UPDATE admin_notification_templates SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        values
      );

      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error updating notification template:', error);
      throw error;
    }
  }

  static async delete(id) {
    try {
      const [result] = await pool.execute(
        'DELETE FROM admin_notification_templates WHERE id = ?',
        [id]
      );

      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error deleting notification template:', error);
      throw error;
    }
  }

  static async incrementUsage(id) {
    try {
      await pool.execute(`
        UPDATE admin_notification_templates 
        SET usage_count = usage_count + 1, last_used_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `, [id]);
    } catch (error) {
      console.error('Error incrementing template usage:', error);
      throw error;
    }
  }

  static async getPopularTemplates(limit = 10) {
    try {
      const [rows] = await pool.execute(`
        SELECT ant.*, u.first_name, u.last_name
        FROM admin_notification_templates ant
        JOIN users u ON ant.created_by = u.id
        WHERE ant.is_active = TRUE
        ORDER BY ant.usage_count DESC, ant.last_used_at DESC
        LIMIT ?
      `, [limit]);

      return rows.map(template => ({
        ...template,
        display_settings: template.display_settings ? JSON.parse(template.display_settings) : null
      }));
    } catch (error) {
      console.error('Error getting popular templates:', error);
      throw error;
    }
  }

  static async searchTemplates(searchQuery, limit = 20) {
    try {
      const [rows] = await pool.execute(`
        SELECT ant.*, u.first_name, u.last_name,
               MATCH(ant.template_name, ant.title, ant.message) AGAINST(? IN NATURAL LANGUAGE MODE) as relevance_score
        FROM admin_notification_templates ant
        JOIN users u ON ant.created_by = u.id
        WHERE ant.is_active = TRUE
        AND (
          MATCH(ant.template_name, ant.title, ant.message) AGAINST(? IN NATURAL LANGUAGE MODE)
          OR ant.template_name LIKE ?
          OR ant.title LIKE ?
          OR ant.message LIKE ?
        )
        ORDER BY relevance_score DESC, ant.usage_count DESC
        LIMIT ?
      `, [
        searchQuery, 
        searchQuery, 
        `%${searchQuery}%`, 
        `%${searchQuery}%`, 
        `%${searchQuery}%`, 
        limit
      ]);

      return rows.map(template => ({
        ...template,
        display_settings: template.display_settings ? JSON.parse(template.display_settings) : null
      }));
    } catch (error) {
      console.error('Error searching templates:', error);
      throw error;
    }
  }

  static async duplicateTemplate(templateId, newName, userId) {
    try {
      const original = await this.findById(templateId);
      if (!original) throw new Error('Template not found');

      const duplicateData = {
        created_by: userId,
        template_name: newName,
        template_description: `Copy of: ${original.template_description || original.template_name}`,
        title: original.title,
        message: original.message,
        notification_type: original.notification_type,
        display_settings: original.display_settings,
        modal_size: original.modal_size,
        default_target_audience: original.default_target_audience,
        default_priority: original.default_priority
      };

      return await this.create(duplicateData);
    } catch (error) {
      console.error('Error duplicating template:', error);
      throw error;
    }
  }

  // Extract variables from template content
  static extractVariables(content) {
    const variableRegex = /\{([^}]+)\}/g;
    const variables = [];
    let match;

    while ((match = variableRegex.exec(content)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1]);
      }
    }

    return variables;
  }

  // Replace variables in template content
  static replaceVariables(content, variables) {
    let processedContent = content;
    
    Object.keys(variables).forEach(key => {
      const placeholder = `{${key}}`;
      processedContent = processedContent.replace(new RegExp(placeholder, 'g'), variables[key]);
    });

    return processedContent;
  }

  static async getTemplateVariables(templateId) {
    try {
      const template = await this.findById(templateId);
      if (!template) return [];

      const titleVariables = this.extractVariables(template.title);
      const messageVariables = this.extractVariables(template.message);
      
      // Combine and deduplicate variables
      const allVariables = [...new Set([...titleVariables, ...messageVariables])];
      
      return allVariables.map(variable => ({
        name: variable,
        required: true,
        type: 'string',
        description: `Value for ${variable}`
      }));
    } catch (error) {
      console.error('Error getting template variables:', error);
      throw error;
    }
  }
}

module.exports = AdminNotificationTemplate;
require('dotenv').config();
const mysql = require('mysql2/promise');

async function fixEmailTemplatesJSON() {
  try {
    console.log('🔧 Fixing email templates JSON data...');
    
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });

    // Check if email_templates table exists
    try {
      const [tables] = await connection.execute(`
        SELECT COUNT(*) as count FROM information_schema.tables 
        WHERE table_schema = ? AND table_name = 'email_templates'
      `, [process.env.DB_NAME]);

      if (tables[0].count === 0) {
        console.log('📝 email_templates table does not exist, skipping...');
        await connection.end();
        return;
      }
    } catch (error) {
      console.log('⚠️ Could not check email_templates table, skipping...');
      await connection.end();
      return;
    }

    // Get all templates with potentially invalid JSON
    const [templates] = await connection.execute('SELECT id, name, variables FROM email_templates');
    
    console.log(`📋 Found ${templates.length} email templates to check`);
    
    let fixedCount = 0;
    
    for (const template of templates) {
      try {
        // Try to parse the existing JSON
        JSON.parse(template.variables || '[]');
        console.log(`✅ Template "${template.name}" has valid JSON`);
      } catch (jsonError) {
        console.log(`🔧 Fixing template "${template.name}" (ID: ${template.id})`);
        console.log(`   Invalid JSON: ${template.variables}`);
        
        let fixedVariables = '[]';
        
        // Try to fix common issues
        if (typeof template.variables === 'string' && template.variables.length > 0) {
          // If it looks like a comma-separated list, convert to JSON array
          if (template.variables.includes(',') && !template.variables.includes('[')) {
            const variableArray = template.variables
              .split(',')
              .map(v => v.trim())
              .filter(v => v.length > 0);
            fixedVariables = JSON.stringify(variableArray);
          } else if (template.variables.trim() && !template.variables.startsWith('[')) {
            // Single variable, wrap in array
            fixedVariables = JSON.stringify([template.variables.trim()]);
          }
        }
        
        // Update the template with fixed JSON
        await connection.execute(
          'UPDATE email_templates SET variables = ? WHERE id = ?',
          [fixedVariables, template.id]
        );
        
        console.log(`   Fixed to: ${fixedVariables}`);
        fixedCount++;
      }
    }
    
    await connection.end();
    
    console.log(`🎉 Fixed ${fixedCount} email templates with invalid JSON data`);
    
  } catch (error) {
    console.error('❌ Error fixing email templates:', error.message);
    throw error;
  }
}

if (require.main === module) {
  fixEmailTemplatesJSON()
    .then(() => {
      console.log('✅ Email template JSON fix completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { fixEmailTemplatesJSON };
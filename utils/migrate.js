const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

class DatabaseMigrator {
    constructor() {
        this.connection = null;
        this.migrationsPath = path.join(__dirname, '..', 'migrations');
        this.migrationTableName = 'migration_history';
    }

    async connect() {
        try {
            this.connection = await mysql.createConnection({
                host: process.env.DB_HOST,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME,
                multipleStatements: true
            });
            console.log('✅ Connected to database');
        } catch (error) {
            console.error('❌ Database connection failed:', error.message);
            throw error;
        }
    }

    async disconnect() {
        if (this.connection) {
            await this.connection.end();
            console.log('🔌 Database connection closed');
        }
    }

    async createMigrationTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS ${this.migrationTableName} (
                id INT AUTO_INCREMENT PRIMARY KEY,
                migration_name VARCHAR(255) NOT NULL UNIQUE,
                executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_migration_name (migration_name)
            )
        `;
        
        await this.connection.execute(query);
        console.log('✅ Migration table ensured');
    }

    async getExecutedMigrations() {
        const [rows] = await this.connection.execute(
            `SELECT migration_name FROM ${this.migrationTableName} ORDER BY executed_at`
        );
        return rows.map(row => row.migration_name);
    }

    async getMigrationFiles() {
        try {
            const files = await fs.readdir(this.migrationsPath);
            return files
                .filter(file => file.endsWith('.sql'))
                .sort();
        } catch (error) {
            console.log('📁 No migrations directory found, creating...');
            await fs.mkdir(this.migrationsPath, { recursive: true });
            return [];
        }
    }

    async executeMigration(filename) {
        const filePath = path.join(this.migrationsPath, filename);
        const migrationSQL = await fs.readFile(filePath, 'utf8');
        
        // Split by semicolon and execute each statement
        const statements = migrationSQL
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0);

        for (const statement of statements) {
            if (statement.trim()) {
                await this.connection.execute(statement);
            }
        }

        // Record the migration as executed
        await this.connection.execute(
            `INSERT INTO ${this.migrationTableName} (migration_name) VALUES (?)`,
            [filename]
        );

        console.log(`✅ Executed migration: ${filename}`);
    }

    async runMigrations() {
        await this.connect();
        await this.createMigrationTable();

        const executedMigrations = await this.getExecutedMigrations();
        const migrationFiles = await this.getMigrationFiles();

        const pendingMigrations = migrationFiles.filter(
            file => !executedMigrations.includes(file)
        );

        if (pendingMigrations.length === 0) {
            console.log('📋 No pending migrations found');
            return;
        }

        console.log(`🔄 Running ${pendingMigrations.length} pending migrations...`);

        for (const migration of pendingMigrations) {
            try {
                await this.executeMigration(migration);
            } catch (error) {
                console.error(`❌ Migration ${migration} failed:`, error.message);
                throw error;
            }
        }

        console.log('🎉 All migrations completed successfully');
    }

    async rollbackLastMigration() {
        await this.connect();
        
        const [rows] = await this.connection.execute(
            `SELECT migration_name FROM ${this.migrationTableName} ORDER BY executed_at DESC LIMIT 1`
        );

        if (rows.length === 0) {
            console.log('📋 No migrations to rollback');
            return;
        }

        const lastMigration = rows[0].migration_name;
        const rollbackFile = lastMigration.replace('.sql', '_rollback.sql');
        const rollbackPath = path.join(this.migrationsPath, rollbackFile);

        try {
            const rollbackSQL = await fs.readFile(rollbackPath, 'utf8');
            
            // Execute rollback statements
            const statements = rollbackSQL
                .split(';')
                .map(stmt => stmt.trim())
                .filter(stmt => stmt.length > 0);

            for (const statement of statements) {
                if (statement.trim()) {
                    await this.connection.execute(statement);
                }
            }

            // Remove from migration history
            await this.connection.execute(
                `DELETE FROM ${this.migrationTableName} WHERE migration_name = ?`,
                [lastMigration]
            );

            console.log(`✅ Rolled back migration: ${lastMigration}`);
        } catch (error) {
            console.error(`❌ Rollback file not found or failed: ${rollbackFile}`, error.message);
            throw error;
        }
    }

    async createMigration(name) {
        const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
        const filename = `${timestamp}_${name}.sql`;
        const rollbackFilename = `${timestamp}_${name}_rollback.sql`;
        
        const migrationPath = path.join(this.migrationsPath, filename);
        const rollbackPath = path.join(this.migrationsPath, rollbackFilename);

        // Ensure migrations directory exists
        await fs.mkdir(this.migrationsPath, { recursive: true });

        const migrationTemplate = `-- Migration: ${name}
-- Created: ${new Date().toISOString()}

-- Add your migration SQL here
-- Example:
-- CREATE TABLE example (
--     id INT AUTO_INCREMENT PRIMARY KEY,
--     name VARCHAR(255) NOT NULL,
--     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

-- ALTER TABLE users ADD COLUMN new_field VARCHAR(100);
`;

        const rollbackTemplate = `-- Rollback for: ${name}
-- Created: ${new Date().toISOString()}

-- Add your rollback SQL here (reverse of migration)
-- Example:
-- DROP TABLE IF EXISTS example;

-- ALTER TABLE users DROP COLUMN new_field;
`;

        await fs.writeFile(migrationPath, migrationTemplate);
        await fs.writeFile(rollbackPath, rollbackTemplate);

        console.log(`✅ Created migration files:`);
        console.log(`   Migration: ${migrationPath}`);
        console.log(`   Rollback:  ${rollbackPath}`);
    }

    async getMigrationStatus() {
        await this.connect();
        await this.createMigrationTable();

        const executedMigrations = await this.getExecutedMigrations();
        const migrationFiles = await this.getMigrationFiles();
        
        const pendingMigrations = migrationFiles.filter(
            file => !executedMigrations.includes(file)
        );

        console.log('\n📊 Migration Status:');
        console.log(`   Total migrations: ${migrationFiles.length}`);
        console.log(`   Executed: ${executedMigrations.length}`);
        console.log(`   Pending: ${pendingMigrations.length}`);

        if (executedMigrations.length > 0) {
            console.log('\n✅ Executed migrations:');
            executedMigrations.forEach(migration => console.log(`   - ${migration}`));
        }

        if (pendingMigrations.length > 0) {
            console.log('\n⏳ Pending migrations:');
            pendingMigrations.forEach(migration => console.log(`   - ${migration}`));
        }
    }
}

// CLI interface
async function main() {
    const migrator = new DatabaseMigrator();
    const command = process.argv[2];
    const argument = process.argv[3];

    try {
        switch (command) {
            case 'up':
            case 'migrate':
                await migrator.runMigrations();
                break;
                
            case 'down':
            case 'rollback':
                await migrator.rollbackLastMigration();
                break;
                
            case 'create':
                if (!argument) {
                    console.error('❌ Please provide a migration name');
                    console.log('Usage: node migrate.js create <migration_name>');
                    process.exit(1);
                }
                await migrator.createMigration(argument);
                break;
                
            case 'status':
                await migrator.getMigrationStatus();
                break;
                
            default:
                console.log('📚 Database Migration Tool');
                console.log('Usage:');
                console.log('  node migrate.js migrate    - Run pending migrations');
                console.log('  node migrate.js up         - Run pending migrations (alias)');
                console.log('  node migrate.js rollback   - Rollback last migration');
                console.log('  node migrate.js down       - Rollback last migration (alias)');
                console.log('  node migrate.js create <name> - Create new migration');
                console.log('  node migrate.js status     - Show migration status');
        }
    } catch (error) {
        console.error('❌ Migration error:', error.message);
        process.exit(1);
    } finally {
        await migrator.disconnect();
    }
}

if (require.main === module) {
    main();
}

module.exports = DatabaseMigrator;
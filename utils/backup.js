const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
require('dotenv').config();

const execAsync = promisify(exec);

class DatabaseBackup {
    constructor() {
        this.backupDir = path.join(__dirname, '..', 'backups');
        this.maxBackups = 10; // Keep last 10 backups
        this.connection = null;
    }

    async ensureBackupDirectory() {
        try {
            await fs.mkdir(this.backupDir, { recursive: true });
        } catch (error) {
            console.error('❌ Failed to create backup directory:', error.message);
            throw error;
        }
    }

    async connect() {
        try {
            this.connection = await mysql.createConnection({
                host: process.env.DB_HOST,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME
            });
            console.log('✅ Connected to database for backup');
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

    async createBackup(backupType = 'manual') {
        await this.ensureBackupDirectory();
        
        const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
        const backupFileName = `${process.env.DB_NAME}_${backupType}_${timestamp}.sql`;
        const backupPath = path.join(this.backupDir, backupFileName);
        
        console.log(`🗄️ Creating ${backupType} database backup...`);
        
        try {
            // Use mysqldump for complete backup
            const mysqldumpCommand = `mysqldump -h ${process.env.DB_HOST} -u ${process.env.DB_USER} -p${process.env.DB_PASSWORD} ${process.env.DB_NAME} --routines --triggers --single-transaction --lock-tables=false`;
            
            const { stdout, stderr } = await execAsync(mysqldumpCommand);
            
            if (stderr && !stderr.includes('Warning')) {
                throw new Error(`Mysqldump error: ${stderr}`);
            }
            
            await fs.writeFile(backupPath, stdout);
            
            // Create metadata file
            const metadataFile = backupPath.replace('.sql', '_metadata.json');
            const metadata = {
                database: process.env.DB_NAME,
                backupType,
                timestamp: new Date().toISOString(),
                fileName: backupFileName,
                size: (await fs.stat(backupPath)).size,
                host: process.env.DB_HOST,
                createdBy: 'backup-system'
            };
            
            await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2));
            
            console.log(`✅ Backup created: ${backupFileName}`);
            console.log(`📊 Backup size: ${(metadata.size / 1024 / 1024).toFixed(2)} MB`);
            
            await this.cleanupOldBackups();
            
            return {
                fileName: backupFileName,
                path: backupPath,
                size: metadata.size,
                metadata
            };
            
        } catch (error) {
            console.error('❌ Backup creation failed:', error.message);
            
            // Fallback: manual backup using SQL queries
            console.log('🔄 Attempting manual backup...');
            return await this.createManualBackup(backupType);
        }
    }

    async createManualBackup(backupType = 'manual') {
        await this.connect();
        
        const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
        const backupFileName = `${process.env.DB_NAME}_${backupType}_manual_${timestamp}.sql`;
        const backupPath = path.join(this.backupDir, backupFileName);
        
        let backupContent = `-- Database Backup: ${process.env.DB_NAME}\n`;
        backupContent += `-- Created: ${new Date().toISOString()}\n`;
        backupContent += `-- Backup Type: ${backupType}\n`;
        backupContent += `-- Method: Manual SQL Export\n\n`;
        
        backupContent += `SET FOREIGN_KEY_CHECKS=0;\n`;
        backupContent += `SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";\n`;
        backupContent += `SET AUTOCOMMIT = 0;\n`;
        backupContent += `START TRANSACTION;\n\n`;
        
        try {
            // Get all tables
            const [tables] = await this.connection.execute(
                `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?`,
                [process.env.DB_NAME]
            );
            
            for (const table of tables) {
                const tableName = table.TABLE_NAME;
                
                // Get table structure
                const [createTableResult] = await this.connection.execute(`SHOW CREATE TABLE \`${tableName}\``);
                const createTableSQL = createTableResult[0]['Create Table'];
                
                backupContent += `-- Table structure for \`${tableName}\`\n`;
                backupContent += `DROP TABLE IF EXISTS \`${tableName}\`;\n`;
                backupContent += `${createTableSQL};\n\n`;
                
                // Get table data
                const [rows] = await this.connection.execute(`SELECT * FROM \`${tableName}\``);
                
                if (rows.length > 0) {
                    backupContent += `-- Data for table \`${tableName}\`\n`;
                    backupContent += `LOCK TABLES \`${tableName}\` WRITE;\n`;
                    
                    const columns = Object.keys(rows[0]);
                    const columnsString = columns.map(col => `\`${col}\``).join(', ');
                    
                    // Insert data in batches
                    const batchSize = 1000;
                    for (let i = 0; i < rows.length; i += batchSize) {
                        const batch = rows.slice(i, i + batchSize);
                        const values = batch.map(row => {
                            const rowValues = columns.map(col => {
                                const value = row[col];
                                if (value === null) return 'NULL';
                                if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
                                if (value instanceof Date) return `'${value.toISOString().slice(0, 19).replace('T', ' ')}'`;
                                return value;
                            }).join(', ');
                            return `(${rowValues})`;
                        }).join(',\n');
                        
                        backupContent += `INSERT INTO \`${tableName}\` (${columnsString}) VALUES\n${values};\n`;
                    }
                    
                    backupContent += `UNLOCK TABLES;\n\n`;
                }
            }
            
            backupContent += `SET FOREIGN_KEY_CHECKS=1;\n`;
            backupContent += `COMMIT;\n`;
            
            await fs.writeFile(backupPath, backupContent);
            
            // Create metadata file
            const metadataFile = backupPath.replace('.sql', '_metadata.json');
            const metadata = {
                database: process.env.DB_NAME,
                backupType,
                timestamp: new Date().toISOString(),
                fileName: backupFileName,
                size: (await fs.stat(backupPath)).size,
                host: process.env.DB_HOST,
                method: 'manual',
                tableCount: tables.length,
                createdBy: 'backup-system'
            };
            
            await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2));
            
            console.log(`✅ Manual backup created: ${backupFileName}`);
            console.log(`📊 Tables backed up: ${tables.length}`);
            console.log(`📊 Backup size: ${(metadata.size / 1024 / 1024).toFixed(2)} MB`);
            
            return {
                fileName: backupFileName,
                path: backupPath,
                size: metadata.size,
                metadata
            };
            
        } catch (error) {
            console.error('❌ Manual backup failed:', error.message);
            throw error;
        } finally {
            await this.disconnect();
        }
    }

    async listBackups() {
        try {
            const files = await fs.readdir(this.backupDir);
            const backupFiles = files.filter(file => file.endsWith('.sql'));
            
            console.log('📋 Available backups:');
            
            const backups = [];
            for (const file of backupFiles) {
                const metadataFile = file.replace('.sql', '_metadata.json');
                const metadataPath = path.join(this.backupDir, metadataFile);
                
                try {
                    const metadataContent = await fs.readFile(metadataPath, 'utf8');
                    const metadata = JSON.parse(metadataContent);
                    backups.push({ file, metadata });
                } catch {
                    // If no metadata file, create basic info
                    const stat = await fs.stat(path.join(this.backupDir, file));
                    backups.push({
                        file,
                        metadata: {
                            fileName: file,
                            timestamp: stat.mtime.toISOString(),
                            size: stat.size,
                            backupType: 'unknown'
                        }
                    });
                }
            }
            
            // Sort by timestamp (newest first)
            backups.sort((a, b) => new Date(b.metadata.timestamp) - new Date(a.metadata.timestamp));
            
            if (backups.length === 0) {
                console.log('   No backups found');
                return [];
            }
            
            backups.forEach((backup, index) => {
                const { file, metadata } = backup;
                const date = new Date(metadata.timestamp).toLocaleString();
                const sizeMB = (metadata.size / 1024 / 1024).toFixed(2);
                console.log(`   ${index + 1}. ${file} (${date}, ${sizeMB} MB, ${metadata.backupType})`);
            });
            
            return backups;
        } catch (error) {
            console.error('❌ Failed to list backups:', error.message);
            return [];
        }
    }

    async cleanupOldBackups() {
        try {
            const backups = await this.listBackups();
            
            if (backups.length <= this.maxBackups) {
                return;
            }
            
            const backupsToDelete = backups.slice(this.maxBackups);
            
            console.log(`🧹 Cleaning up ${backupsToDelete.length} old backups...`);
            
            for (const backup of backupsToDelete) {
                const backupPath = path.join(this.backupDir, backup.file);
                const metadataPath = backupPath.replace('.sql', '_metadata.json');
                
                await fs.unlink(backupPath);
                try {
                    await fs.unlink(metadataPath);
                } catch {
                    // Metadata file might not exist
                }
                
                console.log(`   Deleted: ${backup.file}`);
            }
            
        } catch (error) {
            console.error('❌ Cleanup failed:', error.message);
        }
    }

    async restoreBackup(backupFileName) {
        const backupPath = path.join(this.backupDir, backupFileName);
        
        try {
            const backupContent = await fs.readFile(backupPath, 'utf8');
            
            console.log(`🔄 Restoring backup: ${backupFileName}`);
            console.log('⚠️  This will overwrite the current database!');
            
            await this.connect();
            
            // Split the backup into individual statements
            const statements = backupContent
                .split(';')
                .map(stmt => stmt.trim())
                .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
            
            console.log(`📝 Executing ${statements.length} SQL statements...`);
            
            for (const statement of statements) {
                if (statement.trim()) {
                    await this.connection.execute(statement);
                }
            }
            
            console.log('✅ Database restore completed successfully');
            
        } catch (error) {
            console.error('❌ Restore failed:', error.message);
            throw error;
        } finally {
            await this.disconnect();
        }
    }

    async scheduleBackup() {
        const now = new Date();
        const hour = now.getHours();
        
        // Determine backup type based on time
        let backupType = 'scheduled';
        if (now.getDay() === 0) { // Sunday
            backupType = 'weekly';
        } else if (hour === 2) { // 2 AM daily
            backupType = 'daily';
        } else {
            backupType = 'hourly';
        }
        
        return await this.createBackup(backupType);
    }
}

// CLI interface
async function main() {
    const backup = new DatabaseBackup();
    const command = process.argv[2];
    const argument = process.argv[3];

    try {
        switch (command) {
            case 'create':
            case 'backup':
                const type = argument || 'manual';
                await backup.createBackup(type);
                break;
                
            case 'list':
                await backup.listBackups();
                break;
                
            case 'restore':
                if (!argument) {
                    console.error('❌ Please provide a backup filename');
                    console.log('Usage: node backup.js restore <backup_filename.sql>');
                    process.exit(1);
                }
                await backup.restoreBackup(argument);
                break;
                
            case 'cleanup':
                await backup.cleanupOldBackups();
                break;
                
            case 'schedule':
                await backup.scheduleBackup();
                break;
                
            default:
                console.log('💾 Database Backup Tool');
                console.log('Usage:');
                console.log('  node backup.js create [type]  - Create backup (manual, daily, weekly)');
                console.log('  node backup.js backup [type]  - Create backup (alias)');
                console.log('  node backup.js list          - List all backups');
                console.log('  node backup.js restore <file> - Restore from backup');
                console.log('  node backup.js cleanup       - Remove old backups');
                console.log('  node backup.js schedule      - Create scheduled backup');
        }
    } catch (error) {
        console.error('❌ Backup operation failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = DatabaseBackup;
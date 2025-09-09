const fs = require('fs').promises;
const path = require('path');

class Logger {
    constructor(options = {}) {
        this.logDir = options.logDir || path.join(__dirname, '..', 'logs');
        this.logLevel = options.logLevel || process.env.LOG_LEVEL || 'info';
        this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
        this.maxFiles = options.maxFiles || 10;
        
        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3
        };
        
        this.colors = {
            error: '\x1b[31m', // Red
            warn: '\x1b[33m',  // Yellow
            info: '\x1b[36m',  // Cyan
            debug: '\x1b[32m', // Green
            reset: '\x1b[0m'
        };
        
        this.init();
    }

    async init() {
        try {
            await fs.mkdir(this.logDir, { recursive: true });
        } catch (error) {
            console.error('Failed to create log directory:', error.message);
        }
    }

    shouldLog(level) {
        return this.levels[level] <= this.levels[this.logLevel];
    }

    formatMessage(level, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const metaString = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
        
        return {
            timestamp,
            level: level.toUpperCase(),
            message,
            meta,
            formatted: `[${timestamp}] ${level.toUpperCase()}: ${message}${metaString}`,
            colorFormatted: `${this.colors[level]}[${timestamp}] ${level.toUpperCase()}: ${message}${metaString}${this.colors.reset}`
        };
    }

    async writeToFile(filename, content) {
        const filePath = path.join(this.logDir, filename);
        
        try {
            // Check file size and rotate if necessary
            try {
                const stat = await fs.stat(filePath);
                if (stat.size > this.maxFileSize) {
                    await this.rotateLog(filename);
                }
            } catch (error) {
                // File doesn't exist, which is fine
            }
            
            await fs.appendFile(filePath, content + '\n');
        } catch (error) {
            console.error(`Failed to write to log file ${filename}:`, error.message);
        }
    }

    async rotateLog(filename) {
        const baseName = filename.replace('.log', '');
        const filePath = path.join(this.logDir, filename);
        
        try {
            // Rotate existing files
            for (let i = this.maxFiles - 1; i > 0; i--) {
                const oldFile = path.join(this.logDir, `${baseName}.${i}.log`);
                const newFile = path.join(this.logDir, `${baseName}.${i + 1}.log`);
                
                try {
                    await fs.rename(oldFile, newFile);
                } catch (error) {
                    // File might not exist, continue
                }
            }
            
            // Rename current file to .1
            const rotatedFile = path.join(this.logDir, `${baseName}.1.log`);
            await fs.rename(filePath, rotatedFile);
            
        } catch (error) {
            console.error(`Failed to rotate log file ${filename}:`, error.message);
        }
    }

    async log(level, message, meta = {}) {
        if (!this.shouldLog(level)) {
            return;
        }

        const logEntry = this.formatMessage(level, message, meta);
        
        // Console output with colors
        console.log(logEntry.colorFormatted);
        
        // File output
        const logFiles = {
            error: 'error.log',
            warn: 'app.log',
            info: 'app.log',
            debug: 'debug.log'
        };
        
        const filename = logFiles[level] || 'app.log';
        await this.writeToFile(filename, logEntry.formatted);
        
        // Also write to combined log
        await this.writeToFile('combined.log', logEntry.formatted);
        
        // For errors, also log to error file
        if (level === 'error') {
            await this.writeToFile('error.log', logEntry.formatted);
        }
    }

    error(message, meta = {}) {
        return this.log('error', message, meta);
    }

    warn(message, meta = {}) {
        return this.log('warn', message, meta);
    }

    info(message, meta = {}) {
        return this.log('info', message, meta);
    }

    debug(message, meta = {}) {
        return this.log('debug', message, meta);
    }

    // Express middleware
    middleware() {
        return (req, res, next) => {
            const start = Date.now();
            
            // Log request
            this.info(`${req.method} ${req.url}`, {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                timestamp: new Date().toISOString()
            });
            
            // Override res.end to log response
            const originalEnd = res.end;
            res.end = function(chunk, encoding) {
                const duration = Date.now() - start;
                
                // Log response
                logger.info(`${req.method} ${req.url} ${res.statusCode}`, {
                    duration: `${duration}ms`,
                    status: res.statusCode,
                    contentLength: res.get('Content-Length') || 0
                });
                
                originalEnd.call(res, chunk, encoding);
            };
            
            next();
        };
    }

    // System monitoring
    async logSystemStats() {
        const stats = {
            timestamp: new Date().toISOString(),
            memory: process.memoryUsage(),
            uptime: process.uptime(),
            cpu: process.cpuUsage(),
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch
        };

        await this.info('System Stats', stats);
        return stats;
    }

    // Database monitoring
    async logDatabaseStats(connection) {
        try {
            const [processlist] = await connection.execute('SHOW PROCESSLIST');
            const [status] = await connection.execute('SHOW STATUS LIKE "Threads_connected"');
            const [variables] = await connection.execute('SHOW VARIABLES LIKE "max_connections"');
            
            const stats = {
                timestamp: new Date().toISOString(),
                activeConnections: processlist.length,
                threadsConnected: status[0] ? status[0].Value : 0,
                maxConnections: variables[0] ? variables[0].Value : 0
            };

            await this.info('Database Stats', stats);
            return stats;
        } catch (error) {
            await this.error('Failed to collect database stats', { error: error.message });
        }
    }

    // Performance monitoring
    startTimer(label) {
        return {
            label,
            start: Date.now(),
            end: () => {
                const duration = Date.now() - this.start;
                logger.info(`Performance: ${label}`, { duration: `${duration}ms` });
                return duration;
            }
        };
    }

    // Error tracking
    async trackError(error, context = {}) {
        const errorInfo = {
            message: error.message,
            stack: error.stack,
            name: error.name,
            context,
            timestamp: new Date().toISOString(),
            processId: process.pid
        };

        await this.error('Application Error', errorInfo);
        
        // You could integrate with error tracking services here
        // e.g., Sentry, Bugsnag, etc.
        
        return errorInfo;
    }

    // Log cleanup
    async cleanup(daysToKeep = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        
        try {
            const files = await fs.readdir(this.logDir);
            const logFiles = files.filter(file => file.endsWith('.log'));
            
            for (const file of logFiles) {
                const filePath = path.join(this.logDir, file);
                const stat = await fs.stat(filePath);
                
                if (stat.mtime < cutoffDate) {
                    await fs.unlink(filePath);
                    console.log(`Cleaned up old log file: ${file}`);
                }
            }
        } catch (error) {
            console.error('Failed to cleanup logs:', error.message);
        }
    }

    // Get recent logs
    async getRecentLogs(filename = 'app.log', lines = 100) {
        const filePath = path.join(this.logDir, filename);
        
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const allLines = content.split('\n');
            const recentLines = allLines.slice(-lines);
            
            return recentLines.filter(line => line.trim()).map(line => {
                try {
                    // Try to parse structured log
                    const match = line.match(/^\[([^\]]+)\] (\w+): (.+)$/);
                    if (match) {
                        return {
                            timestamp: match[1],
                            level: match[2],
                            message: match[3],
                            raw: line
                        };
                    }
                    return { raw: line };
                } catch {
                    return { raw: line };
                }
            });
        } catch (error) {
            this.error('Failed to read log file', { filename, error: error.message });
            return [];
        }
    }
}

// Create global logger instance
const logger = new Logger();

// Export both class and instance
module.exports = {
    Logger,
    logger
};

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
    await logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack
    });
    process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
    await logger.error('Unhandled Rejection', {
        reason: reason?.message || reason,
        stack: reason?.stack
    });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    await logger.info('Received SIGTERM, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', async () => {
    await logger.info('Received SIGINT, shutting down gracefully');
    process.exit(0);
});
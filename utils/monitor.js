const { logger } = require('./logger');
const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class SystemMonitor {
    constructor() {
        this.isMonitoring = false;
        this.monitoringInterval = null;
        this.alerts = [];
        this.metrics = {
            cpu: [],
            memory: [],
            disk: [],
            database: [],
            requests: []
        };

        this.thresholds = {
            cpu: 80, // 80%
            memory: 85, // 85%
            disk: 90, // 90%
            responseTime: 5000, // 5 seconds
            dbConnections: 80 // 80% of max connections
        };
    }

    async init() {
        await logger.info('Initializing system monitor');

        // MongoDB connection is already handled by the app
        if (mongoose.connection.readyState === 1) {
            await logger.info('MongoDB connection available for monitoring');
        } else {
            await logger.warn('MongoDB connection not available for monitoring');
        }

        // Setup process monitoring
        this.setupProcessMonitoring();
    }

    setupProcessMonitoring() {
        // Track request metrics if Express is available
        if (global.app) {
            global.app.use((req, res, next) => {
                const start = Date.now();

                res.on('finish', () => {
                    const duration = Date.now() - start;
                    this.recordRequestMetric({
                        method: req.method,
                        url: req.url,
                        status: res.statusCode,
                        duration,
                        timestamp: new Date()
                    });
                });

                next();
            });
        }
    }

    async collectSystemMetrics() {
        const metrics = {
            timestamp: new Date(),
            system: {
                uptime: os.uptime(),
                loadavg: os.loadavg(),
                totalmem: os.totalmem(),
                freemem: os.freemem(),
                cpus: os.cpus().length
            },
            process: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                cpu: process.cpuUsage(),
                version: process.version,
                pid: process.pid
            }
        };

        // Calculate CPU usage percentage
        const cpuUsage = this.calculateCpuUsage(metrics.process.cpu);
        metrics.cpu = cpuUsage;

        // Calculate memory usage percentage
        const memoryUsage = (metrics.process.memory.rss / metrics.system.totalmem) * 100;
        metrics.memory = memoryUsage;

        // Check disk usage
        const diskUsage = await this.getDiskUsage();
        metrics.disk = diskUsage;

        // Database metrics
        if (mongoose.connection.readyState === 1) {
            const dbMetrics = await this.collectDatabaseMetrics();
            metrics.database = dbMetrics;
        }

        // Store metrics
        this.storeMetrics(metrics);

        // Check thresholds and alert if necessary
        await this.checkThresholds(metrics);

        return metrics;
    }

    calculateCpuUsage(cpuUsage) {
        // This is a simplified CPU usage calculation
        // In a real scenario, you'd want to calculate the percentage over time
        const { user, system } = cpuUsage;
        const total = user + system;
        return Math.min(100, (total / 1000000) * 100); // Convert microseconds to percentage
    }

    async getDiskUsage() {
        try {
            const appDir = process.cwd();
            const stats = await fs.stat(appDir);

            // This is a simplified version - in production you'd want to check actual disk space
            return {
                used: 0, // Would calculate actual disk usage
                total: 100,
                percentage: 0
            };
        } catch (error) {
            await logger.error('Failed to get disk usage', { error: error.message });
            return { used: 0, total: 100, percentage: 0 };
        }
    }

    async collectDatabaseMetrics() {
        try {
            const adminDb = mongoose.connection.db.admin();
            const dbStats = await mongoose.connection.db.stats();
            const serverStatus = await adminDb.serverStatus();

            const connections = serverStatus.connections || {};
            const maxConnections = connections.totalCreated || 1000; // MongoDB default
            const currentConnections = connections.current || 0;
            const connectionUsage = (currentConnections / maxConnections) * 100;

            return {
                connections: {
                    current: currentConnections,
                    available: connections.available || 0,
                    usage: connectionUsage
                },
                dataSize: dbStats.dataSize || 0,
                storageSize: dbStats.storageSize || 0,
                indexSize: dbStats.indexSize || 0,
                collections: dbStats.collections || 0,
                documents: dbStats.objects || 0
            };
        } catch (error) {
            await logger.error('Failed to collect database metrics', { error: error.message });
            return null;
        }
    }

    storeMetrics(metrics) {
        // Store in memory (in production, you'd want to use a time-series database)
        const maxPoints = 1000; // Keep last 1000 data points

        this.metrics.cpu.push({ timestamp: metrics.timestamp, value: metrics.cpu });
        this.metrics.memory.push({ timestamp: metrics.timestamp, value: metrics.memory });

        if (metrics.disk) {
            this.metrics.disk.push({ timestamp: metrics.timestamp, value: metrics.disk.percentage });
        }

        if (metrics.database) {
            this.metrics.database.push({
                timestamp: metrics.timestamp,
                value: metrics.database.connections?.usage || 0
            });
        }

        // Trim old data
        Object.keys(this.metrics).forEach(key => {
            if (this.metrics[key].length > maxPoints) {
                this.metrics[key] = this.metrics[key].slice(-maxPoints);
            }
        });
    }

    recordRequestMetric(requestData) {
        this.metrics.requests.push({
            timestamp: requestData.timestamp,
            duration: requestData.duration,
            status: requestData.status,
            method: requestData.method
        });

        // Keep only last 1000 requests
        if (this.metrics.requests.length > 1000) {
            this.metrics.requests = this.metrics.requests.slice(-1000);
        }
    }

    async checkThresholds(metrics) {
        const alerts = [];

        // CPU threshold
        if (metrics.cpu > this.thresholds.cpu) {
            alerts.push({
                type: 'cpu',
                severity: 'warning',
                message: `High CPU usage: ${metrics.cpu.toFixed(2)}%`,
                value: metrics.cpu,
                threshold: this.thresholds.cpu
            });
        }

        // Memory threshold
        if (metrics.memory > this.thresholds.memory) {
            alerts.push({
                type: 'memory',
                severity: 'warning',
                message: `High memory usage: ${metrics.memory.toFixed(2)}%`,
                value: metrics.memory,
                threshold: this.thresholds.memory
            });
        }

        // Database connections threshold
        if (metrics.database?.connections?.usage > this.thresholds.dbConnections) {
            alerts.push({
                type: 'database',
                severity: 'critical',
                message: `High database connection usage: ${metrics.database.connections.usage.toFixed(2)}%`,
                value: metrics.database.connections.usage,
                threshold: this.thresholds.dbConnections
            });
        }

        // Process alerts
        for (const alert of alerts) {
            await this.processAlert(alert);
        }
    }

    async processAlert(alert) {
        // Add timestamp
        alert.timestamp = new Date();

        // Store alert
        this.alerts.push(alert);

        // Keep only last 100 alerts
        if (this.alerts.length > 100) {
            this.alerts = this.alerts.slice(-100);
        }

        // Log alert
        await logger.warn(`System Alert: ${alert.message}`, alert);

        // In production, you could send notifications here
        // e.g., email, Slack, PagerDuty, etc.
    }

    async startMonitoring(intervalSeconds = 60) {
        if (this.isMonitoring) {
            await logger.warn('Monitoring is already running');
            return;
        }

        await logger.info(`Starting system monitoring with ${intervalSeconds}s interval`);
        this.isMonitoring = true;

        this.monitoringInterval = setInterval(async () => {
            try {
                await this.collectSystemMetrics();
            } catch (error) {
                await logger.error('Error during monitoring cycle', { error: error.message });
            }
        }, intervalSeconds * 1000);

        // Initial collection
        await this.collectSystemMetrics();
    }

    async stopMonitoring() {
        if (!this.isMonitoring) {
            return;
        }

        await logger.info('Stopping system monitoring');

        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        this.isMonitoring = false;
    }

    getMetrics(type = 'all', limit = 100) {
        if (type === 'all') {
            const result = {};
            Object.keys(this.metrics).forEach(key => {
                result[key] = this.metrics[key].slice(-limit);
            });
            return result;
        }

        return this.metrics[type]?.slice(-limit) || [];
    }

    getAlerts(limit = 50) {
        return this.alerts.slice(-limit).reverse(); // Most recent first
    }

    getHealthStatus() {
        const recent = this.getMetrics('all', 1);
        const latestCpu = recent.cpu?.[0]?.value || 0;
        const latestMemory = recent.memory?.[0]?.value || 0;
        const latestDb = recent.database?.[0]?.value || 0;

        const status = {
            overall: 'healthy',
            components: {
                cpu: {
                    status: latestCpu > this.thresholds.cpu ? 'warning' : 'healthy',
                    value: latestCpu,
                    threshold: this.thresholds.cpu
                },
                memory: {
                    status: latestMemory > this.thresholds.memory ? 'warning' : 'healthy',
                    value: latestMemory,
                    threshold: this.thresholds.memory
                },
                database: {
                    status: latestDb > this.thresholds.dbConnections ? 'critical' : 'healthy',
                    value: latestDb,
                    threshold: this.thresholds.dbConnections
                }
            },
            uptime: process.uptime(),
            timestamp: new Date()
        };

        // Determine overall status
        const componentStatuses = Object.values(status.components).map(c => c.status);
        if (componentStatuses.includes('critical')) {
            status.overall = 'critical';
        } else if (componentStatuses.includes('warning')) {
            status.overall = 'warning';
        }

        return status;
    }

    async generateReport() {
        const metrics = this.getMetrics('all', 1440); // Last 24 hours (assuming 1-minute intervals)
        const alerts = this.getAlerts();
        const health = this.getHealthStatus();

        const report = {
            timestamp: new Date(),
            period: '24 hours',
            health,
            metrics: {
                cpu: {
                    current: metrics.cpu?.[metrics.cpu.length - 1]?.value || 0,
                    average: metrics.cpu.reduce((sum, m) => sum + m.value, 0) / metrics.cpu.length || 0,
                    max: Math.max(...metrics.cpu.map(m => m.value), 0)
                },
                memory: {
                    current: metrics.memory?.[metrics.memory.length - 1]?.value || 0,
                    average: metrics.memory.reduce((sum, m) => sum + m.value, 0) / metrics.memory.length || 0,
                    max: Math.max(...metrics.memory.map(m => m.value), 0)
                },
                requests: {
                    total: this.metrics.requests.length,
                    averageResponseTime: this.metrics.requests.reduce((sum, r) => sum + r.duration, 0) / this.metrics.requests.length || 0,
                    errorRate: (this.metrics.requests.filter(r => r.status >= 400).length / this.metrics.requests.length * 100) || 0
                }
            },
            alerts: {
                total: alerts.length,
                critical: alerts.filter(a => a.severity === 'critical').length,
                warning: alerts.filter(a => a.severity === 'warning').length
            }
        };

        await logger.info('System monitoring report generated', report);
        return report;
    }

    async cleanup() {
        await this.stopMonitoring();
        await logger.info('System monitor cleanup completed');
    }
}

// Create global monitor instance
const monitor = new SystemMonitor();

module.exports = {
    SystemMonitor,
    monitor
};

// Graceful shutdown
process.on('SIGTERM', async () => {
    await monitor.cleanup();
});

process.on('SIGINT', async () => {
    await monitor.cleanup();
});
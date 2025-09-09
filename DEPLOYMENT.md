# Deployment Guide for Dozyr Platform

This guide covers the complete deployment process for both the Dozyr backend (wish-well) and frontend (dozyr) applications.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- MySQL 8.0+
- SSH access to your hosting server
- GitHub account with repository access

### Environment Setup

1. **Backend Environment Variables** (`.env.production`):
```env
NODE_ENV=production
PORT=3002
DB_HOST=your_production_db_host
DB_USER=your_production_db_user
DB_PASSWORD=your_production_db_password
DB_NAME=dozyr_production
JWT_SECRET=your_super_secure_jwt_secret_key
STRIPE_SECRET_KEY=sk_live_your_stripe_key
CLIENT_URL=https://yourdomain.com
```

2. **Frontend Environment Variables** (`.env.production.local`):
```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api/v1
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_your_stripe_key
SSH_USER=your_ssh_username
SSH_HOST=your_server_host
FRONTEND_DEPLOY_PATH=/path/to/frontend/deployment
```

3. **GitHub Secrets** (Required for CI/CD):
```
SSH_PRIVATE_KEY - Your server's SSH private key
SSH_USER - SSH username
HOST - Backend server host
DEPLOY_PATH - Backend deployment path
FRONTEND_HOST - Frontend server host (can be same as HOST)
FRONTEND_DEPLOY_PATH - Frontend deployment path
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY - Stripe public key
NEXT_PUBLIC_ANALYTICS_ID - Analytics ID (optional)
NEXT_PUBLIC_SENTRY_DSN - Sentry DSN (optional)
```

## 📦 Deployment Methods

### 1. Automatic Deployment (GitHub Actions)

The CI/CD pipeline automatically deploys when you push to the `main` branch:

1. **Push to main branch**:
```bash
git push origin main
```

2. **GitHub Actions will**:
   - Run tests
   - Build applications
   - Deploy to production server
   - Start/restart services

### 2. Manual Deployment

#### Backend Deployment
```bash
cd wish-well
chmod +x deploy.sh
./deploy.sh production
```

#### Frontend Deployment
```bash
cd dozyr
chmod +x deploy.sh
./deploy.sh production
```

## 🗄️ Database Management

### Initial Setup
```bash
# Create database
mysql -u root -p -e "CREATE DATABASE dozyr_production;"

# Run initial setup
cd wish-well
node utils/seedDatabase.js
```

### Migrations
```bash
# Check migration status
node utils/migrate.js status

# Run migrations
node utils/migrate.js migrate

# Create new migration
node utils/migrate.js create "add_new_feature"

# Rollback last migration
node utils/migrate.js rollback
```

### Backups
```bash
# Create backup
node utils/backup.js create production

# List backups
node utils/backup.js list

# Restore from backup
node utils/backup.js restore backup_filename.sql

# Automated cleanup
node utils/backup.js cleanup
```

### Backup Schedule (Recommended)
Set up cron jobs for automated backups:
```bash
# Daily backup at 2 AM
0 2 * * * cd /path/to/wish-well && node utils/backup.js create daily

# Weekly backup on Sunday at 3 AM
0 3 * * 0 cd /path/to/wish-well && node utils/backup.js create weekly

# Monthly cleanup
0 4 1 * * cd /path/to/wish-well && node utils/backup.js cleanup
```

## 🖥️ Server Configuration

### PM2 Process Management
```bash
# Start application
pm2 start ecosystem.config.js --env production

# Monitor processes
pm2 status
pm2 logs dozyr-backend
pm2 monit

# Restart application
pm2 restart dozyr-backend

# Stop application
pm2 stop dozyr-backend
```

### Web Server Configuration

#### Apache (.htaccess for frontend)
The deployment script automatically creates `.htaccess` with:
- Client-side routing support
- Static asset caching
- Security headers
- Gzip compression

#### Nginx Configuration
```nginx
# Frontend
server {
    listen 80;
    server_name yourdomain.com;
    root /path/to/frontend/current;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    location /_next/static/ {
        add_header Cache-Control "public, immutable, max-age=31536000";
    }
}

# Backend API
server {
    listen 80;
    server_name api.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 📊 Monitoring & Logging

### System Monitoring
The backend includes built-in monitoring:
```bash
# View system health
curl http://localhost:3002/api/v1/admin/system/health

# Get monitoring report
node utils/monitor.js
```

### Log Management
Logs are automatically rotated and stored in `/logs/`:
- `app.log` - General application logs
- `error.log` - Error logs only  
- `debug.log` - Debug information
- `combined.log` - All logs combined

### Log Cleanup
```bash
# Cleanup logs older than 30 days (default)
node -e "const {logger} = require('./utils/logger'); logger.cleanup(30);"
```

## 🔧 Troubleshooting

### Common Issues

1. **Database Connection Issues**:
```bash
# Test database connection
node -e "const mysql=require('mysql2/promise'); mysql.createConnection({host:'localhost',user:'user',password:'pass',database:'db'}).then(()=>console.log('OK')).catch(console.error)"
```

2. **PM2 Process Not Starting**:
```bash
# Check logs
pm2 logs dozyr-backend --lines 100

# Restart PM2
pm2 kill
pm2 resurrect
```

3. **Frontend Not Loading**:
   - Check `.htaccess` configuration
   - Verify file permissions (644 for files, 755 for directories)
   - Check build output in `.next` directory

4. **High Resource Usage**:
```bash
# Check system metrics
node -e "const {monitor} = require('./utils/monitor'); monitor.init().then(() => monitor.collectSystemMetrics()).then(console.log)"
```

### Health Checks

#### Backend Health Check
```bash
curl http://localhost:3002/health
# Should return: {"status":"ok","timestamp":"..."}
```

#### Frontend Health Check
```bash
curl http://yourdomain.com
# Should return the main HTML page
```

## 🔐 Security Checklist

- [ ] Use HTTPS in production
- [ ] Set strong JWT_SECRET
- [ ] Configure CORS properly
- [ ] Use environment variables for secrets
- [ ] Enable rate limiting
- [ ] Regular security updates
- [ ] Monitor for vulnerabilities
- [ ] Backup encryption (if needed)
- [ ] Server firewall configuration
- [ ] SSL certificate renewal automation

## 📈 Performance Optimization

### Backend
- Enable PM2 cluster mode for scaling
- Use Redis for session storage
- Database query optimization
- Enable gzip compression
- CDN for static assets

### Frontend
- Next.js static optimization
- Image optimization
- Code splitting
- Service worker caching
- Bundle size analysis

## 🆘 Support & Maintenance

### Regular Tasks
1. **Weekly**: Check logs for errors
2. **Monthly**: Review system metrics
3. **Quarterly**: Security audit
4. **Yearly**: Dependencies update

### Emergency Procedures
1. **Service Down**: Check PM2, restart if needed
2. **Database Issues**: Check backups, restore if necessary  
3. **High Load**: Enable cluster mode, check resources
4. **Security Breach**: Rotate secrets, check logs, restore from backup

### Contact Information
- Server Admin: [admin@yourdomain.com]
- Emergency Contact: [emergency@yourdomain.com]
- Hosting Provider: [provider support details]

## 📚 Additional Resources
- [PM2 Documentation](https://pm2.keymetrics.io/)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [MySQL Documentation](https://dev.mysql.com/doc/)
- [Express.js Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
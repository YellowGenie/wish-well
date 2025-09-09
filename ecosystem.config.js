module.exports = {
  apps: [
    {
      name: 'dozyr-backend',
      script: 'server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3002
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 3001
      },
      // Logging configuration
      log_file: './logs/app.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Process management
      min_uptime: '10s',
      max_restarts: 10,
      
      // Health monitoring
      exec_mode: 'fork',
      kill_timeout: 5000,
      listen_timeout: 8000,
      
      // Environment-specific settings
      node_args: '--max_old_space_size=1024'
    }
  ],

  // Deployment configuration (optional, for PM2 deploy)
  deploy: {
    production: {
      user: 'SSH_USER',
      host: 'SSH_HOST',
      ref: 'origin/main',
      repo: 'git@github.com:YellowGenie/wish-well.git',
      path: '/var/www/dozyr-backend',
      'pre-deploy-local': '',
      'post-deploy': 'npm install --production && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    },
    staging: {
      user: 'SSH_USER',
      host: 'SSH_HOST',
      ref: 'origin/develop',
      repo: 'git@github.com:YellowGenie/wish-well.git',
      path: '/var/www/dozyr-backend-staging',
      'pre-deploy-local': '',
      'post-deploy': 'npm install --production && pm2 reload ecosystem.config.js --env staging',
      'pre-setup': ''
    }
  }
};
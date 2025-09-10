const express = require('express');
const http = require('http');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const API_VERSION = process.env.API_VERSION || 'v1';

// AGGRESSIVE CORS fix - override Railway proxy headers
app.use('*', (req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://dozyr.co',
    'https://www.dozyr.co', 
    'https://dozyr.netlify.app',
    'https://dozyr.vercel.app',
    'http://localhost:3001',
    'http://localhost:3000'
  ];
  
  console.log(`🔍 Request from origin: ${origin}`);
  
  // Force override Railway's CORS headers with wildcard
  // Remove any existing CORS headers set by Railway
  res.removeHeader('Access-Control-Allow-Origin');
  res.removeHeader('access-control-allow-origin');
  
  // Set wildcard CORS headers to bypass Railway proxy
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  console.log(`🌐 CORS: Allowing ALL origins with wildcard (*) for origin: ${origin}`);
  
  if (req.method === 'OPTIONS') {
    console.log(`🚀 CORS: Handling OPTIONS for ${origin}`);
    return res.status(200).end();
  }
  
  next();
});

// CORS configuration - hardcoded for reliability
const allowedOrigins = [
  'https://dozyr.co',
  'https://www.dozyr.co', 
  'https://dozyr.netlify.app',
  'https://dozyr.vercel.app',
  'http://localhost:3001',
  'http://localhost:3000'
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      console.log(`✅ CORS allowed origin: ${origin}`);
      callback(null, true);
    } else {
      console.log(`❌ CORS blocked origin: ${origin}. Allowed origins:`, allowedOrigins);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// Debug logging for CORS
console.log('🔧 CORS Configuration:', corsOptions);
console.log('🔧 Allowed Origins:', allowedOrigins);

// Manual CORS middleware to override any existing CORS
app.use((req, res, next) => {
  const origin = req.headers.origin;
  console.log(`🔍 Request from origin: ${origin}`);
  
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    console.log(`✅ CORS: Allowing origin ${origin}`);
  } else {
    console.log(`❌ CORS: Blocking origin ${origin}`);
  }
  
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  
  if (req.method === 'OPTIONS') {
    console.log(`🔄 Handling OPTIONS preflight for ${origin}`);
    return res.status(200).end();
  }
  
  next();
});

// Remove cors middleware - handle manually only
// app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Load middleware and routes immediately
const helmet = require('helmet');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter, authLimiter, messageLimiter } = require('./middleware/rateLimiter');

// Import routes
const authRoutes = require('./routes/auth');
const jobRoutes = require('./routes/jobs');
const proposalRoutes = require('./routes/proposals');
const messageRoutes = require('./routes/messages');
const profileRoutes = require('./routes/profiles');
const skillRoutes = require('./routes/skills');
const adminRoutes = require('./routes/admin');
const paymentRoutes = require('./routes/payments');
const notificationRoutes = require('./routes/notifications');
const packageRoutes = require('./routes/packages');
const adminNotificationRoutes = require('./routes/adminNotifications');
const adminNotificationTemplateRoutes = require('./routes/adminNotificationTemplates');
const userNotificationRoutes = require('./routes/userNotifications');
const interviewRoutes = require('./routes/interviews');
const conversationRoutes = require('./routes/conversations');
const userRoutes = require('./routes/users');

// Add security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "http://localhost:3013", "http://localhost:3002"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
    },
  },
}));

// Add rate limiting
app.use(apiLimiter);

// Serve static files for uploads
app.use('/uploads', express.static('uploads'));

// API Routes with rate limiting (temporarily disabled for auth)
console.log(`🔧 Mounting auth routes at /api/${API_VERSION}/auth`);
app.use(`/api/${API_VERSION}/auth`, authRoutes);
app.use(`/api/${API_VERSION}/jobs`, jobRoutes);
app.use(`/api/${API_VERSION}/proposals`, proposalRoutes);
app.use(`/api/${API_VERSION}/messages`, messageLimiter, messageRoutes);
app.use(`/api/${API_VERSION}/profiles`, profileRoutes);
app.use(`/api/${API_VERSION}/skills`, skillRoutes);
app.use(`/api/${API_VERSION}/admin`, adminRoutes);
app.use(`/api/${API_VERSION}/payments`, paymentRoutes);
app.use(`/api/${API_VERSION}/notifications`, notificationRoutes);
app.use(`/api/${API_VERSION}/packages`, packageRoutes);
app.use(`/api/${API_VERSION}/admin/notifications`, adminNotificationRoutes);
app.use(`/api/${API_VERSION}/admin/notification-templates`, adminNotificationTemplateRoutes);
app.use(`/api/${API_VERSION}/user/notifications`, userNotificationRoutes);
app.use(`/api/${API_VERSION}/interviews`, messageLimiter, interviewRoutes);
app.use(`/api/${API_VERSION}/conversations`, messageLimiter, conversationRoutes);
app.use(`/api/${API_VERSION}/users`, apiLimiter, userRoutes);

// Error handling middleware
app.use(errorHandler);

// Force deployment test - simple auth endpoint
app.post('/api/v1/auth/login', (req, res) => {
  console.log('🚨 DIRECT AUTH ENDPOINT HIT');
  res.json({
    message: 'Direct auth endpoint working',
    timestamp: new Date().toISOString(),
    body: req.body
  });
});

// CORS test endpoint
app.get('/cors-test', (req, res) => {
  // Manually set CORS headers for testing
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  res.json({
    message: 'CORS test endpoint',
    origin: req.headers.origin,
    timestamp: new Date().toISOString(),
    headers: req.headers
  });
});

app.options('/cors-test', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.status(200).end();
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Wishing Well API - Dozyr Remote Job Marketplace',
    version: API_VERSION,
    status: 'running',
    timestamp: new Date().toISOString(),
    routesLoaded: 'v4 - direct auth endpoint',
    authRoutes: authRoutes ? 'loaded' : 'missing'
  });
});

app.get('/test-deploy', (req, res) => {
  res.json({
    message: 'RAILWAY DEPLOYMENT TEST - v5',
    timestamp: new Date().toISOString(),
    working: true
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    port: PORT
  });
});

// Health check endpoint under API version path
app.get(`/api/${API_VERSION}/health`, (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    port: PORT,
    version: API_VERSION
  });
});

// API Documentation endpoint
app.get(`/api/${API_VERSION}/docs`, (req, res) => {
  res.json({
    title: 'Dozyr API Documentation',
    version: API_VERSION,
    description: 'Remote job marketplace API for connecting talent with managers',
    baseUrl: `${req.protocol}://${req.get('host')}/api/${API_VERSION}`,
    endpoints: {
      authentication: {
        'POST /auth/register': 'Register a new user (talent or manager)',
        'POST /auth/login': 'Login user',
        'GET /auth/profile': 'Get current user profile',
        'PUT /auth/profile': 'Update current user profile'
      },
      jobs: {
        'GET /jobs/search': 'Search jobs with filters',
        'GET /jobs/:id': 'Get job details',
        'POST /jobs': 'Create new job (managers only)',
        'PUT /jobs/:id': 'Update job (job owner only)',
        'DELETE /jobs/:id': 'Delete job (job owner only)',
        'GET /jobs/manager/my-jobs': 'Get manager\'s jobs'
      },
      proposals: {
        'POST /proposals/jobs/:job_id/proposals': 'Submit proposal (talent only)',
        'GET /proposals/:id': 'Get proposal details',
        'PUT /proposals/:id': 'Update proposal (talent only)',
        'DELETE /proposals/:id': 'Delete proposal (talent only)',
        'GET /proposals/talent/my-proposals': 'Get talent\'s proposals',
        'GET /proposals/jobs/:job_id/proposals': 'Get job proposals (manager only)',
        'POST /proposals/:id/accept': 'Accept proposal (manager only)',
        'POST /proposals/:id/reject': 'Reject proposal (manager only)'
      },
      profiles: {
        'GET /profiles/talents/search': 'Search talent profiles',
        'GET /profiles/talents/:id': 'Get talent profile',
        'GET /profiles/managers/:id': 'Get manager profile',
        'GET /profiles/talent/me': 'Get my talent profile',
        'PUT /profiles/talent/me': 'Update my talent profile',
        'GET /profiles/manager/me': 'Get my manager profile',
        'PUT /profiles/manager/me': 'Update my manager profile'
      },
      messages: {
        'POST /messages/jobs/:job_id/messages': 'Send message',
        'GET /messages/jobs/:job_id/conversations/:other_user_id': 'Get conversation',
        'GET /messages/conversations': 'Get my conversations',
        'GET /messages/unread-count': 'Get unread message count'
      },
      skills: {
        'GET /skills': 'Get all skills',
        'GET /skills/search': 'Search skills',
        'GET /skills/categories': 'Get skill categories',
        'GET /skills/popular': 'Get popular skills'
      },
      admin: {
        'GET /admin/dashboard': 'Get admin dashboard (admin only)',
        'GET /admin/users': 'Get all users (admin only)',
        'GET /admin/jobs': 'Get all jobs (admin only)',
        'GET /admin/analytics': 'Get analytics report (admin only)'
      }
    },
    authentication: {
      type: 'Bearer Token',
      header: 'Authorization: Bearer <jwt_token>'
    },
    userRoles: ['talent', 'manager', 'admin']
  });
});

// Final CORS override middleware - runs after all routes
app.use('*', (req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://dozyr.co',
    'https://www.dozyr.co', 
    'https://dozyr.netlify.app',
    'https://dozyr.vercel.app',
    'http://localhost:3001',
    'http://localhost:3000'
  ];
  
  // Force override any headers that might have been set by Railway or other middleware
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  console.log(`🔄 FINAL CORS: Set wildcard origin (*) for request from ${origin}`);
  
  next();
});

// Basic 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
    availableEndpoints: `Visit /api/${API_VERSION}/docs for API documentation`
  });
});

// Initialize and start server
const startServer = async () => {
  // Start server immediately
  server.listen(PORT, () => {
    console.log(`🚀 Wishing Well API server running on port ${PORT}`);
    console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  // Load all services after server is running
  setTimeout(() => {
    console.log('🔧 Loading additional services...');
    try {
      // Import Socket.IO with hardcoded CORS origins
      const { Server } = require('socket.io');
      const io = new Server(server, {
        cors: {
          origin: [
            'https://dozyr.co',
            'https://www.dozyr.co', 
            'https://dozyr.netlify.app',
            'https://dozyr.vercel.app',
            'http://localhost:3001',
            'http://localhost:3000'
          ],
          methods: ["GET", "POST"],
          credentials: true
        }
      });

      // Import and setup services asynchronously
      const { createTables } = require('./config/database');
      const emailService = require('./services/emailService');
      const pushService = require('./services/pushService');
      const notificationWorker = require('./services/notificationWorker');
      const { authenticateSocket } = require('./middleware/auth');

      // Socket.IO middleware and connection handling
      io.use(authenticateSocket);

      io.on('connection', (socket) => {
        console.log(`🔌 User ${socket.user.id} connected (${socket.user.first_name} ${socket.user.last_name})`);
        
        // Join user to their own room for private messaging
        socket.join(`user_${socket.user.id}`);
        
        // Handle joining job conversation rooms
        socket.on('join_conversation', (data) => {
          const { job_id, other_user_id } = data;
          const roomId = `job_${job_id}_conversation_${Math.min(socket.user.id, other_user_id)}_${Math.max(socket.user.id, other_user_id)}`;
          socket.join(roomId);
          console.log(`👥 User ${socket.user.id} joined conversation room: ${roomId}`);
        });

        // Handle leaving conversation rooms
        socket.on('leave_conversation', (data) => {
          const { job_id, other_user_id } = data;
          const roomId = `job_${job_id}_conversation_${Math.min(socket.user.id, other_user_id)}_${Math.max(socket.user.id, other_user_id)}`;
          socket.leave(roomId);
          console.log(`👋 User ${socket.user.id} left conversation room: ${roomId}`);
        });

        // Handle sending messages
        socket.on('send_message', async (data) => {
          try {
            const { job_id, receiver_id, message } = data;
            const Message = require('./models/Message');
            
            // Check if user can access this conversation
            const canAccess = await Message.canUserAccessConversation(job_id, socket.user.id);
            if (!canAccess) {
              socket.emit('error', { message: 'Unauthorized to access this conversation' });
              return;
            }

            // Save message to database
            const messageId = await Message.create({
              job_id: parseInt(job_id),
              sender_id: socket.user.id,
              receiver_id: parseInt(receiver_id),
              message: message.trim()
            });

            // Get the full message details
            const fullMessage = await Message.findById(messageId);
            
            // Create room ID for this conversation
            const roomId = `job_${job_id}_conversation_${Math.min(socket.user.id, receiver_id)}_${Math.max(socket.user.id, receiver_id)}`;
            
            // Emit to conversation room
            io.to(roomId).emit('new_message', {
              id: messageId,
              job_id: parseInt(job_id),
              sender_id: socket.user.id,
              receiver_id: parseInt(receiver_id),
              message: message.trim(),
              sender_first_name: socket.user.first_name,
              sender_last_name: socket.user.last_name,
              created_at: new Date().toISOString(),
              is_read: false
            });
            
            // Also send to receiver's personal room for notifications
            io.to(`user_${receiver_id}`).emit('message_notification', {
              id: messageId,
              job_id: parseInt(job_id),
              sender_id: socket.user.id,
              sender_name: `${socket.user.first_name} ${socket.user.last_name}`,
              message: message.trim(),
              created_at: new Date().toISOString()
            });

            console.log(`💬 Message sent from ${socket.user.id} to ${receiver_id} in job ${job_id}`);
          } catch (error) {
            console.error('Error sending message:', error);
            socket.emit('error', { message: 'Failed to send message' });
          }
        });

        // Handle typing indicators
        socket.on('typing', (data) => {
          const { job_id, other_user_id } = data;
          const roomId = `job_${job_id}_conversation_${Math.min(socket.user.id, other_user_id)}_${Math.max(socket.user.id, other_user_id)}`;
          socket.to(roomId).emit('user_typing', {
            user_id: socket.user.id,
            user_name: `${socket.user.first_name} ${socket.user.last_name}`
          });
        });

        socket.on('stop_typing', (data) => {
          const { job_id, other_user_id } = data;
          const roomId = `job_${job_id}_conversation_${Math.min(socket.user.id, other_user_id)}_${Math.max(socket.user.id, other_user_id)}`;
          socket.to(roomId).emit('user_stop_typing', {
            user_id: socket.user.id
          });
        });

        // Handle marking messages as read
        socket.on('mark_as_read', async (data) => {
          try {
            const { job_id } = data;
            const Message = require('./models/Message');
            await Message.markAsRead(job_id, socket.user.id);
            
            // Notify other users in the conversation that messages were read
            const roomId = `job_${job_id}_conversation`;
            socket.to(roomId).emit('messages_read', {
              job_id: parseInt(job_id),
              user_id: socket.user.id
            });
          } catch (error) {
            console.error('Error marking messages as read:', error);
          }
        });

        // Admin notification handlers
        socket.on('join_admin_notifications', () => {
          if (socket.user.role === 'admin') {
            socket.join('admin_notifications');
            console.log(`👑 Admin ${socket.user.id} joined admin notifications room`);
          }
        });

        socket.on('send_admin_notification', async (data) => {
          if (socket.user.role !== 'admin') {
            socket.emit('error', { message: 'Unauthorized: Admin access required' });
            return;
          }

          try {
            const AdminNotification = require('./models/AdminNotification');
            const notificationId = await AdminNotification.create({
              ...data,
              created_by: socket.user.id
            });

            // If immediate, process and send to users
            if (data.schedule_type === 'immediate') {
              await processAndSendNotification(notificationId, io);
            }

            socket.emit('admin_notification_created', { 
              success: true, 
              notification_id: notificationId 
            });
          } catch (error) {
            console.error('Error creating admin notification:', error);
            socket.emit('error', { message: 'Failed to create notification' });
          }
        });

        socket.on('test_admin_notification', async (data) => {
          if (socket.user.role !== 'admin') {
            socket.emit('error', { message: 'Unauthorized: Admin access required' });
            return;
          }

          try {
            const { notification_id, test_user_id } = data;
            const AdminNotification = require('./models/AdminNotification');
            const User = require('./models/User');

            const notification = await AdminNotification.findById(notification_id);
            const testUser = await User.findById(test_user_id);

            if (!notification || !testUser) {
              socket.emit('error', { message: 'Notification or user not found' });
              return;
            }

            // Send test notification
            io.to(`user_${test_user_id}`).emit('admin_notification', {
              type: 'admin_notification',
              notification: { ...notification, isTest: true },
              isTest: true
            });

            socket.emit('test_notification_sent', { success: true });
          } catch (error) {
            console.error('Error sending test notification:', error);
            socket.emit('error', { message: 'Failed to send test notification' });
          }
        });

        socket.on('disconnect', () => {
          console.log(`🔌 User ${socket.user.id} disconnected`);
        });
      });

      // Helper function to process and send notifications
      async function processAndSendNotification(notificationId, io) {
        try {
          const AdminNotification = require('./models/AdminNotification');
          const User = require('./models/User');
          
          const notification = await AdminNotification.findById(notificationId);
          if (!notification) return;

          // Get target users
          let targetUsers = [];
          
          if (notification.target_audience === 'specific_users') {
            // Get specific users
            for (const userId of notification.target_user_ids) {
              const user = await User.findById(userId);
              if (user && user.is_active) targetUsers.push(user);
            }
          } else {
            // Get users by role
            const roleFilter = notification.target_audience === 'both' ? null : notification.target_audience;
            const result = await User.getAllUsers(roleFilter, 1, 1000);
            targetUsers = result.users.filter(user => user.is_active);
          }

          console.log(`📢 Sending admin notification "${notification.title}" to ${targetUsers.length} users`);

          // Send notifications to each user
          let deliveredCount = 0;
          for (const user of targetUsers) {
            try {
              // Send real-time notification via Socket.io
              io.to(`user_${user.id}`).emit('admin_notification', {
                type: 'admin_notification',
                notification: notification
              });

              // Mark as delivered
              await AdminNotification.markAsDelivered(notificationId, user.id, {
                delivery_method: notification.notification_type,
                device_type: 'web',
                user_agent: 'server-sent',
                ip_address: 'system'
              });

              deliveredCount++;
            } catch (error) {
              console.error(`Failed to send notification to user ${user.id}:`, error);
            }
          }

          // Update notification stats
          await AdminNotification.update(notificationId, {
            status: 'active',
            total_sent: targetUsers.length,
            total_delivered: deliveredCount
          });

          console.log(`✅ Admin notification processed: ${deliveredCount}/${targetUsers.length} delivered`);
        } catch (error) {
          console.error('Error processing notification:', error);
          // Update notification status to failed
          try {
            await AdminNotification.update(notificationId, { status: 'failed' });
          } catch (updateError) {
            console.error('Failed to update notification status:', updateError);
          }
        }
      }

      // Periodic job to process scheduled notifications
      setInterval(async () => {
        try {
          const AdminNotification = require('./models/AdminNotification');
          const scheduledNotifications = await AdminNotification.getScheduledNotifications(10);
          
          if (scheduledNotifications.length > 0) {
            console.log(`Processing ${scheduledNotifications.length} scheduled notifications`);
            
            for (const notification of scheduledNotifications) {
              try {
                await processAndSendNotification(notification.id, io);
              } catch (notificationError) {
                console.error(`Failed to process notification ${notification.id}:`, notificationError.message);
              }
            }
          }
        } catch (error) {
          // Only log if it's not a "table doesn't exist" error
          if (!error.message.includes('admin_notifications')) {
            console.error('Error processing scheduled notifications:', error.message);
          }
        }
      }, 60000); // Check every minute

      // Initialize database
      createTables().then(() => {
        console.log('✅ Database initialized');
      }).catch(error => {
        console.log('⚠️ Database initialization failed:', error.message);
      });

      console.log('✅ Services loaded');
    } catch (error) {
      console.log('⚠️ Some services failed to load:', error.message);
    }
  }, 1000);
};

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  process.exit(0);
});

startServer();

module.exports = app;
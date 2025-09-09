const express = require('express');
const multer = require('multer');
const path = require('path');
const MessageController = require('../controllers/messageController');
const ConversationController = require('../controllers/conversationController');
const { auth, requireManagerOrTalent, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/messages/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Allowed file types
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'audio/mpeg', 'audio/wav', 'audio/ogg',
    'text/plain', 'application/pdf',
    'application/json', 'text/javascript', 'text/css', 'text/html'
  ];
  
  // Block executable files
  const blockedExtensions = ['.exe', '.bat', '.sh', '.cmd', '.scr', '.com', '.pif'];
  const fileExtension = path.extname(file.originalname).toLowerCase();
  
  if (blockedExtensions.includes(fileExtension)) {
    cb(new Error('Executable files are not allowed'), false);
    return;
  }
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed'), false);
  }
};

const upload = multer({ 
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Enhanced messaging routes

// Conversation management
router.get('/conversations', auth, requireManagerOrTalent, ConversationController.getUserConversations);
router.get('/conversations/:id', auth, requireManagerOrTalent, ConversationController.getConversation);
router.get('/conversations/:id/messages', auth, requireManagerOrTalent, ConversationController.getConversationMessages);
router.post('/conversations/:id/mark-read', auth, requireManagerOrTalent, ConversationController.markConversationAsRead);
router.delete('/conversations/:id', auth, requireManagerOrTalent, ConversationController.deleteConversation);
router.put('/conversations/:id/archive', auth, requireManagerOrTalent, ConversationController.archiveConversation);
router.put('/conversations/:id/block', auth, requireManagerOrTalent, ConversationController.blockConversation);

// Direct messaging
router.post('/direct', auth, requireManagerOrTalent, MessageController.validateDirectMessage, MessageController.sendDirectMessage);
router.get('/direct/:user_id', auth, requireManagerOrTalent, MessageController.getOrCreateDirectConversation);

// Enhanced message sending with file support
router.post('/send', auth, requireManagerOrTalent, upload.single('file'), MessageController.validateSendMessage, MessageController.sendMessage);
router.post('/conversations/:id/send', auth, requireManagerOrTalent, upload.single('file'), MessageController.validateSendMessage, MessageController.sendMessageToConversation);

// Message management
router.get('/:id', auth, requireManagerOrTalent, MessageController.getMessage);
router.put('/:id', auth, requireManagerOrTalent, MessageController.validateEditMessage, MessageController.editMessage);
router.delete('/:id', auth, requireManagerOrTalent, MessageController.deleteMessage);
router.post('/:id/flag', auth, requireManagerOrTalent, MessageController.validateFlagMessage, MessageController.flagMessage);
router.put('/:id/read', auth, requireManagerOrTalent, MessageController.markMessageAsRead);

// Search and filtering
router.get('/search/conversations', auth, requireManagerOrTalent, MessageController.searchConversations);
router.get('/search/messages', auth, requireManagerOrTalent, MessageController.searchMessages);

// Statistics
router.get('/stats/overview', auth, requireManagerOrTalent, MessageController.getMessageStatistics);
router.get('/unread-count', auth, requireManagerOrTalent, MessageController.getUnreadCount);

// Legacy routes (maintained for backward compatibility)
router.post('/jobs/:job_id/messages', auth, requireManagerOrTalent, MessageController.validateSendMessage, MessageController.sendJobMessage);
router.get('/jobs/:job_id/conversations/:other_user_id', auth, requireManagerOrTalent, MessageController.getJobConversation);
router.post('/jobs/:job_id/mark-read', auth, requireManagerOrTalent, MessageController.markJobMessagesAsRead);
router.get('/conversations-legacy', auth, requireManagerOrTalent, MessageController.getMyConversations);
router.delete('/conversation/:job_id/:other_user_id', auth, requireManagerOrTalent, MessageController.deleteJobConversation);

// Admin routes
router.get('/admin/flagged', auth, requireAdmin, MessageController.getFlaggedMessages);
router.put('/admin/flagged/:id/review', auth, requireAdmin, MessageController.reviewFlaggedMessage);
router.get('/admin/violations', auth, requireAdmin, MessageController.getContentViolations);
router.get('/admin/stats', auth, requireAdmin, MessageController.getAdminStatistics);

module.exports = router;
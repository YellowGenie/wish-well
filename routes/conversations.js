const express = require('express');
const ConversationController = require('../controllers/conversationController');
const { auth, requireManagerOrTalent } = require('../middleware/auth');

const router = express.Router();

// Conversation management routes
router.get('/', auth, requireManagerOrTalent, ConversationController.getUserConversations);
router.get('/:id', auth, requireManagerOrTalent, ConversationController.getConversation);
router.get('/:id/messages', auth, requireManagerOrTalent, ConversationController.getConversationMessages);
router.post('/:id/mark-read', auth, requireManagerOrTalent, ConversationController.markConversationAsRead);
router.delete('/:id', auth, requireManagerOrTalent, ConversationController.deleteConversation);
router.put('/:id/archive', auth, requireManagerOrTalent, ConversationController.archiveConversation);
router.put('/:id/block', auth, requireManagerOrTalent, ConversationController.blockConversation);
router.get('/search', auth, requireManagerOrTalent, ConversationController.searchConversations);
router.get('/stats/overview', auth, requireManagerOrTalent, ConversationController.getConversationStatistics);

module.exports = router;
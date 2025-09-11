const { mongoose } = require('../config/mongodb');

const conversationSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  job_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job'
  },
  last_message: String,
  last_message_at: Date
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

const Conversation = mongoose.model('Conversation', conversationSchema);
module.exports = Conversation;
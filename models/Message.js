const { mongoose } = require('../config/mongodb');

const messageSchema = new mongoose.Schema({
  job_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true
  },
  sender_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiver_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  message: {
    type: String,
    required: true
  },
  is_read: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

messageSchema.index({ job_id: 1 });
messageSchema.index({ sender_id: 1 });
messageSchema.index({ receiver_id: 1 });

const Message = mongoose.model('Message', messageSchema);
module.exports = Message;
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true
  },
  sender: {
    type: String,
    enum: ['user', 'ai'],
    required: true
  },
  content: {
    type: String,
    required: true,
    maxLength: 5000
  },
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  },
  // AI-specific fields
  ai_model: {
    type: String,
    default: 'gpt-3.5-turbo'
  },
  ai_temperature: {
    type: Number,
    default: 0.7
  },
  ai_tokens_used: {
    type: Number,
    default: 0
  },
  ai_response_time_ms: {
    type: Number,
    default: 0
  },
  // Content analysis
  contains_sensitive: {
    type: Boolean,
    default: false
  },
  flagged_content: {
    type: Boolean,
    default: false
  },
  flag_reason: {
    type: String
  }
}, { _id: false });

const aiChatLogSchema = new mongoose.Schema({
  // Session Information
  session_id: {
    type: String,
    required: true,
    index: true
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // User Details (denormalized for faster queries)
  user_email: {
    type: String,
    required: true
  },
  user_name: {
    type: String,
    required: true
  },
  user_role: {
    type: String,
    enum: ['talent', 'manager', 'admin'],
    required: true,
    index: true
  },

  // Conversation Details
  conversation_start: {
    type: Date,
    default: Date.now,
    required: true,
    index: true
  },
  conversation_end: {
    type: Date
  },
  messages: [messageSchema],

  // Session Metadata
  total_messages: {
    type: Number,
    default: 0
  },
  user_messages_count: {
    type: Number,
    default: 0
  },
  ai_messages_count: {
    type: Number,
    default: 0
  },
  total_characters: {
    type: Number,
    default: 0
  },

  // AI Usage Tracking
  total_ai_tokens_used: {
    type: Number,
    default: 0
  },
  average_response_time: {
    type: Number,
    default: 0
  },
  ai_errors_count: {
    type: Number,
    default: 0
  },
  ai_model_used: {
    type: String,
    default: 'gpt-3.5-turbo'
  },

  // Quality & Satisfaction
  user_satisfaction_rating: {
    type: Number,
    min: 1,
    max: 5
  },
  user_feedback: {
    type: String,
    maxLength: 1000
  },
  conversation_resolved: {
    type: Boolean,
    default: false
  },
  escalated_to_human: {
    type: Boolean,
    default: false
  },
  escalation_reason: {
    type: String
  },

  // Technical Details
  user_ip: {
    type: String
  },
  user_agent: {
    type: String
  },
  device_type: {
    type: String,
    enum: ['desktop', 'mobile', 'tablet', 'unknown'],
    default: 'unknown'
  },

  // Flagging & Moderation
  flagged_conversation: {
    type: Boolean,
    default: false,
    index: true
  },
  flag_reasons: [{
    type: String
  }],
  reviewed_by_admin: {
    type: Boolean,
    default: false
  },
  admin_notes: {
    type: String,
    maxLength: 1000
  },

  // Status
  is_active: {
    type: Boolean,
    default: true,
    index: true
  },
  archived: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
aiChatLogSchema.index({ user_id: 1, conversation_start: -1 });
aiChatLogSchema.index({ conversation_start: -1 });
aiChatLogSchema.index({ user_role: 1, conversation_start: -1 });
aiChatLogSchema.index({ flagged_conversation: 1, reviewed_by_admin: 1 });
aiChatLogSchema.index({ user_email: 1, conversation_start: -1 });
aiChatLogSchema.index({ session_id: 1 });

// Pre-save middleware to calculate statistics
aiChatLogSchema.pre('save', function(next) {
  if (this.messages && this.messages.length > 0) {
    this.total_messages = this.messages.length;
    this.user_messages_count = this.messages.filter(m => m.sender === 'user').length;
    this.ai_messages_count = this.messages.filter(m => m.sender === 'ai').length;
    this.total_characters = this.messages.reduce((sum, m) => sum + m.content.length, 0);

    const aiMessages = this.messages.filter(m => m.sender === 'ai' && m.ai_tokens_used > 0);
    this.total_ai_tokens_used = aiMessages.reduce((sum, m) => sum + (m.ai_tokens_used || 0), 0);

    const responseTimes = aiMessages.filter(m => m.ai_response_time_ms > 0).map(m => m.ai_response_time_ms);
    if (responseTimes.length > 0) {
      this.average_response_time = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
    }
  }
  next();
});

// Static methods for analytics and management
aiChatLogSchema.statics.getConversationsByUser = async function(userId, options = {}) {
  const {
    page = 1,
    limit = 20,
    startDate,
    endDate,
    includeArchived = false
  } = options;

  const query = {
    user_id: userId,
    ...(includeArchived ? {} : { archived: false })
  };

  if (startDate || endDate) {
    query.conversation_start = {};
    if (startDate) query.conversation_start.$gte = new Date(startDate);
    if (endDate) query.conversation_start.$lte = new Date(endDate);
  }

  const conversations = await this.find(query)
    .sort({ conversation_start: -1 })
    .limit(limit)
    .skip((page - 1) * limit)
    .lean();

  const total = await this.countDocuments(query);

  return {
    conversations,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

aiChatLogSchema.statics.getAnalytics = async function(options = {}) {
  const {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    endDate = new Date(),
    groupBy = 'day'
  } = options;

  const matchStage = {
    conversation_start: {
      $gte: startDate,
      $lte: endDate
    },
    archived: false
  };

  // Group by time period
  let dateGroupFormat;
  switch (groupBy) {
    case 'hour':
      dateGroupFormat = {
        year: { $year: '$conversation_start' },
        month: { $month: '$conversation_start' },
        day: { $dayOfMonth: '$conversation_start' },
        hour: { $hour: '$conversation_start' }
      };
      break;
    case 'month':
      dateGroupFormat = {
        year: { $year: '$conversation_start' },
        month: { $month: '$conversation_start' }
      };
      break;
    default: // day
      dateGroupFormat = {
        year: { $year: '$conversation_start' },
        month: { $month: '$conversation_start' },
        day: { $dayOfMonth: '$conversation_start' }
      };
  }

  const analytics = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: dateGroupFormat,
        total_conversations: { $sum: 1 },
        total_messages: { $sum: '$total_messages' },
        total_ai_tokens: { $sum: '$total_ai_tokens_used' },
        avg_response_time: { $avg: '$average_response_time' },
        flagged_conversations: {
          $sum: { $cond: ['$flagged_conversation', 1, 0] }
        },
        unique_users: { $addToSet: '$user_id' },
        by_role: {
          $push: {
            role: '$user_role',
            satisfaction: '$user_satisfaction_rating'
          }
        }
      }
    },
    {
      $addFields: {
        unique_user_count: { $size: '$unique_users' },
        date: {
          $dateFromParts: {
            year: '$_id.year',
            month: '$_id.month',
            day: { $ifNull: ['$_id.day', 1] },
            hour: { $ifNull: ['$_id.hour', 0] }
          }
        }
      }
    },
    { $sort: { date: 1 } }
  ]);

  return analytics;
};

// Method to start a new conversation
aiChatLogSchema.statics.startConversation = async function(sessionId, user, metadata = {}) {
  const conversation = new this({
    session_id: sessionId,
    user_id: user.id,
    user_email: user.email,
    user_name: `${user.first_name} ${user.last_name}`,
    user_role: user.role,
    user_ip: metadata.ip,
    user_agent: metadata.userAgent,
    device_type: metadata.deviceType || 'unknown'
  });

  return await conversation.save();
};

// Method to add a message to conversation
aiChatLogSchema.methods.addMessage = async function(messageData) {
  this.messages.push({
    id: messageData.id || new mongoose.Types.ObjectId().toString(),
    sender: messageData.sender,
    content: messageData.content,
    timestamp: messageData.timestamp || new Date(),
    ai_model: messageData.ai_model,
    ai_temperature: messageData.ai_temperature,
    ai_tokens_used: messageData.ai_tokens_used || 0,
    ai_response_time_ms: messageData.ai_response_time_ms || 0,
    contains_sensitive: messageData.contains_sensitive || false,
    flagged_content: messageData.flagged_content || false,
    flag_reason: messageData.flag_reason
  });

  // Update conversation_end timestamp
  this.conversation_end = new Date();

  return await this.save();
};

module.exports = mongoose.model('AIChatLog', aiChatLogSchema);
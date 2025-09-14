const mongoose = require('mongoose');

const aiRateLimitSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  user_email: {
    type: String,
    required: true
  },

  // Current usage counters
  messages_this_hour: {
    type: Number,
    default: 0
  },
  messages_this_day: {
    type: Number,
    default: 0
  },
  characters_this_hour: {
    type: Number,
    default: 0
  },

  // Time tracking
  current_hour: {
    type: Date,
    required: true,
    index: true
  },
  current_day: {
    type: Date,
    required: true,
    index: true
  },
  last_message_time: {
    type: Date,
    default: Date.now
  },

  // Violation tracking
  violations_this_hour: {
    type: Number,
    default: 0
  },
  violations_this_day: {
    type: Number,
    default: 0
  },
  total_violations: {
    type: Number,
    default: 0
  },

  // Temporary blocks
  is_blocked: {
    type: Boolean,
    default: false
  },
  block_expires_at: {
    type: Date
  },
  block_reason: {
    type: String
  },

  // Metadata
  last_reset: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for efficient lookups
aiRateLimitSchema.index({ user_id: 1 });
aiRateLimitSchema.index({ current_hour: 1 });
aiRateLimitSchema.index({ current_day: 1 });
aiRateLimitSchema.index({ is_blocked: 1, block_expires_at: 1 });

// Static method to check and update rate limits
aiRateLimitSchema.statics.checkRateLimit = async function(userId, userEmail, messageLength = 0) {
  const now = new Date();
  const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
  const currentDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Get or create rate limit record
  let rateLimitRecord = await this.findOne({ user_id: userId });

  if (!rateLimitRecord) {
    rateLimitRecord = new this({
      user_id: userId,
      user_email: userEmail,
      current_hour: currentHour,
      current_day: currentDay
    });
  }

  // Check if blocked and if block has expired
  if (rateLimitRecord.is_blocked && rateLimitRecord.block_expires_at && now > rateLimitRecord.block_expires_at) {
    rateLimitRecord.is_blocked = false;
    rateLimitRecord.block_expires_at = undefined;
    rateLimitRecord.block_reason = undefined;
  }

  // If still blocked, return blocked status
  if (rateLimitRecord.is_blocked) {
    return {
      allowed: false,
      reason: 'user_blocked',
      block_reason: rateLimitRecord.block_reason,
      reset_time: rateLimitRecord.block_expires_at
    };
  }

  // Reset counters if hour has changed
  if (rateLimitRecord.current_hour.getTime() !== currentHour.getTime()) {
    rateLimitRecord.messages_this_hour = 0;
    rateLimitRecord.characters_this_hour = 0;
    rateLimitRecord.violations_this_hour = 0;
    rateLimitRecord.current_hour = currentHour;
  }

  // Reset daily counters if day has changed
  if (rateLimitRecord.current_day.getTime() !== currentDay.getTime()) {
    rateLimitRecord.messages_this_day = 0;
    rateLimitRecord.violations_this_day = 0;
    rateLimitRecord.current_day = currentDay;
  }

  // Get current AI settings for rate limits
  const AISettings = require('./AISettings');
  const settings = await AISettings.getCurrentSettings();
  const limits = settings.rate_limits;

  // Check cooldown period
  const timeSinceLastMessage = now - rateLimitRecord.last_message_time;
  if (timeSinceLastMessage < limits.cooldown_seconds * 1000) {
    rateLimitRecord.violations_this_hour++;
    rateLimitRecord.violations_this_day++;
    rateLimitRecord.total_violations++;
    await rateLimitRecord.save();

    return {
      allowed: false,
      reason: 'cooldown',
      wait_time: limits.cooldown_seconds * 1000 - timeSinceLastMessage,
      reset_time: new Date(rateLimitRecord.last_message_time.getTime() + limits.cooldown_seconds * 1000)
    };
  }

  // Check hourly message limit
  if (rateLimitRecord.messages_this_hour >= limits.messages_per_hour) {
    rateLimitRecord.violations_this_hour++;
    rateLimitRecord.violations_this_day++;
    rateLimitRecord.total_violations++;
    await rateLimitRecord.save();

    const nextHour = new Date(currentHour.getTime() + 60 * 60 * 1000);
    return {
      allowed: false,
      reason: 'hourly_limit',
      current_count: rateLimitRecord.messages_this_hour,
      limit: limits.messages_per_hour,
      reset_time: nextHour
    };
  }

  // Check daily message limit
  if (rateLimitRecord.messages_this_day >= limits.messages_per_day) {
    rateLimitRecord.violations_this_hour++;
    rateLimitRecord.violations_this_day++;
    rateLimitRecord.total_violations++;
    await rateLimitRecord.save();

    const nextDay = new Date(currentDay.getTime() + 24 * 60 * 60 * 1000);
    return {
      allowed: false,
      reason: 'daily_limit',
      current_count: rateLimitRecord.messages_this_day,
      limit: limits.messages_per_day,
      reset_time: nextDay
    };
  }

  // Check message character limit
  if (messageLength > limits.characters_per_message) {
    rateLimitRecord.violations_this_hour++;
    rateLimitRecord.violations_this_day++;
    rateLimitRecord.total_violations++;
    await rateLimitRecord.save();

    return {
      allowed: false,
      reason: 'message_too_long',
      current_length: messageLength,
      limit: limits.characters_per_message
    };
  }

  // All checks passed - increment counters
  rateLimitRecord.messages_this_hour++;
  rateLimitRecord.messages_this_day++;
  rateLimitRecord.characters_this_hour += messageLength;
  rateLimitRecord.last_message_time = now;

  await rateLimitRecord.save();

  return {
    allowed: true,
    remaining_hourly: limits.messages_per_hour - rateLimitRecord.messages_this_hour,
    remaining_daily: limits.messages_per_day - rateLimitRecord.messages_this_day,
    reset_hour: new Date(currentHour.getTime() + 60 * 60 * 1000),
    reset_day: new Date(currentDay.getTime() + 24 * 60 * 60 * 1000)
  };
};

// Method to block a user temporarily
aiRateLimitSchema.statics.blockUser = async function(userId, reason, durationMinutes = 60) {
  const blockExpiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);

  await this.findOneAndUpdate(
    { user_id: userId },
    {
      is_blocked: true,
      block_expires_at: blockExpiresAt,
      block_reason: reason,
      $inc: { total_violations: 1 }
    },
    { upsert: true }
  );

  return blockExpiresAt;
};

// Method to unblock a user
aiRateLimitSchema.statics.unblockUser = async function(userId) {
  await this.findOneAndUpdate(
    { user_id: userId },
    {
      is_blocked: false,
      $unset: {
        block_expires_at: 1,
        block_reason: 1
      }
    }
  );
};

// Get usage stats for a user
aiRateLimitSchema.statics.getUserUsageStats = async function(userId) {
  const record = await this.findOne({ user_id: userId });

  if (!record) {
    return {
      messages_this_hour: 0,
      messages_this_day: 0,
      violations_total: 0,
      is_blocked: false
    };
  }

  const AISettings = require('./AISettings');
  const settings = await AISettings.getCurrentSettings();
  const limits = settings.rate_limits;

  return {
    messages_this_hour: record.messages_this_hour,
    messages_this_day: record.messages_this_day,
    remaining_hourly: limits.messages_per_hour - record.messages_this_hour,
    remaining_daily: limits.messages_per_day - record.messages_this_day,
    violations_this_hour: record.violations_this_hour,
    violations_this_day: record.violations_this_day,
    violations_total: record.total_violations,
    is_blocked: record.is_blocked,
    block_expires_at: record.block_expires_at,
    block_reason: record.block_reason,
    last_message_time: record.last_message_time
  };
};

// Clean up old records (called via cron job)
aiRateLimitSchema.statics.cleanupOldRecords = async function(daysToKeep = 30) {
  const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

  const result = await this.deleteMany({
    updatedAt: { $lt: cutoffDate },
    is_blocked: false,
    total_violations: { $lt: 5 } // Keep records with multiple violations for analysis
  });

  return result.deletedCount;
};

module.exports = mongoose.model('AIRateLimit', aiRateLimitSchema);
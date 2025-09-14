const mongoose = require('mongoose');

const aiSettingsSchema = new mongoose.Schema({
  // General AI Settings
  is_enabled: {
    type: Boolean,
    default: true,
    required: true
  },
  model_name: {
    type: String,
    default: 'gpt-3.5-turbo',
    required: true
  },
  temperature: {
    type: Number,
    default: 0.7,
    min: 0,
    max: 2
  },
  max_tokens: {
    type: Number,
    default: 500,
    min: 50,
    max: 2000
  },

  // Personality & Tone Settings
  personality: {
    type: String,
    enum: ['professional', 'friendly', 'casual', 'formal', 'helpful', 'technical', 'custom'],
    default: 'helpful'
  },
  tone: {
    type: String,
    enum: ['warm', 'neutral', 'energetic', 'calm', 'enthusiastic', 'serious', 'custom'],
    default: 'warm'
  },
  custom_personality_prompt: {
    type: String,
    default: ''
  },

  // System Prompts by Role
  system_prompts: {
    base: {
      type: String,
      default: `You are Dozyr's AI Customer Service Assistant, a helpful and professional virtual assistant for the Dozyr remote job marketplace platform.

PLATFORM OVERVIEW:
Dozyr connects talented professionals with companies offering remote work opportunities. Our platform facilitates job posting, talent discovery, secure payments through escrow, and project management.

YOUR ROLE:
- Provide helpful, accurate information about Dozyr's services
- Assist users with platform navigation and feature explanations
- Offer guidance on best practices for remote work
- Maintain a professional, friendly, and supportive tone
- Be concise but comprehensive in your responses
- Always prioritize user success and satisfaction

GUIDELINES:
- Keep responses helpful and actionable
- If you don't know something specific about Dozyr, admit it and suggest contacting support
- Never provide financial advice or guarantees
- Always encourage following platform guidelines and terms of service
- Promote professional communication and work standards`
    },
    talent: {
      type: String,
      default: `
SPECIFIC CONTEXT: You're helping a TALENT (freelancer/contractor) who uses Dozyr to find remote work opportunities.

COMMON TALENT NEEDS:
- Finding and applying to relevant jobs
- Creating compelling proposals
- Optimizing their profile to attract clients
- Understanding payment and escrow processes
- Managing contracts and milestones
- Building client relationships and getting reviews
- Skill development and positioning

Focus on helping them succeed as a service provider and build their freelance career.`
    },
    manager: {
      type: String,
      default: `
SPECIFIC CONTEXT: You're helping a MANAGER (client/company) who uses Dozyr to hire remote talent.

COMMON MANAGER NEEDS:
- Posting effective job descriptions
- Finding and evaluating qualified talent
- Managing proposals and hiring decisions
- Setting up contracts and milestones
- Understanding payment and escrow processes
- Managing remote teams and projects
- Getting the best results from hired talent

Focus on helping them find great talent and manage successful remote work projects.`
    },
    admin: {
      type: String,
      default: `
SPECIFIC CONTEXT: You're helping an ADMIN who manages the Dozyr platform.

COMMON ADMIN NEEDS:
- Platform oversight and management
- User support escalations
- System monitoring and analytics
- Policy and guideline enforcement
- Platform feature explanations
- Technical troubleshooting guidance

You can provide more detailed technical information and platform insights for administrative users.`
    }
  },

  // Welcome Messages by Role
  welcome_messages: {
    talent: {
      type: String,
      default: '👋 Hi {name}! I\'m your Dozyr AI Assistant. I\'m here to help you succeed as a freelancer on our platform. Whether you need help finding jobs, writing proposals, or managing your projects, just ask!'
    },
    manager: {
      type: String,
      default: '👋 Welcome {name}! I\'m your Dozyr AI Assistant. I\'m here to help you find the perfect talent for your projects. Need help posting jobs, evaluating proposals, or managing your remote team? I\'m here to assist!'
    },
    admin: {
      type: String,
      default: '👋 Hello {name}! I\'m your Dozyr AI Assistant. I\'m here to support you with platform administration, user assistance, and any technical questions you might have. How can I help you today?'
    }
  },

  // Rate Limiting Settings
  rate_limits: {
    messages_per_hour: {
      type: Number,
      default: 20,
      min: 1,
      max: 100
    },
    messages_per_day: {
      type: Number,
      default: 100,
      min: 1,
      max: 500
    },
    characters_per_message: {
      type: Number,
      default: 1000,
      min: 50,
      max: 2000
    },
    cooldown_seconds: {
      type: Number,
      default: 3,
      min: 0,
      max: 60
    }
  },

  // Moderation Settings
  moderation: {
    enabled: {
      type: Boolean,
      default: true
    },
    blocked_words: [{
      type: String
    }],
    auto_escalate_keywords: [{
      type: String
    }],
    require_approval_for_sensitive: {
      type: Boolean,
      default: false
    }
  },

  // Analytics Settings
  analytics: {
    track_conversations: {
      type: Boolean,
      default: true
    },
    track_user_satisfaction: {
      type: Boolean,
      default: true
    },
    retention_days: {
      type: Number,
      default: 365,
      min: 30,
      max: 2555 // ~7 years
    }
  },

  // Metadata
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updated_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes for better query performance
aiSettingsSchema.index({ created_at: -1 });
aiSettingsSchema.index({ is_enabled: 1 });

// Static method to get current settings (singleton pattern)
aiSettingsSchema.statics.getCurrentSettings = async function() {
  let settings = await this.findOne().sort({ created_at: -1 });

  if (!settings) {
    // Create default settings if none exist
    settings = new this({
      created_by: new mongoose.Types.ObjectId(), // Will be set by admin
      updated_by: new mongoose.Types.ObjectId()
    });
    await settings.save();
  }

  return settings;
};

// Method to update settings
aiSettingsSchema.statics.updateSettings = async function(updates, updatedBy) {
  const settings = await this.getCurrentSettings();

  Object.assign(settings, updates);
  settings.updated_by = updatedBy;

  return await settings.save();
};

module.exports = mongoose.model('AISettings', aiSettingsSchema);
const OpenAI = require('openai');
const AISettings = require('../models/AISettings');
const AIChatLog = require('../models/AIChatLog');
const AIRateLimit = require('../models/AIRateLimit');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

class AIService {
  static async generateChatResponse(message, user, sessionId, conversationLog = null, metadata = {}) {
    const startTime = Date.now();
    let aiTokensUsed = 0;
    let aiError = null;

    try {
      console.log(`🤖 AI Chat Request from ${user.first_name} ${user.last_name} (${user.role}): ${message}`);

      // 1. Get AI Settings
      const settings = await AISettings.getCurrentSettings();

      // 2. Check if AI is enabled
      if (!settings.is_enabled) {
        return {
          success: false,
          message: "I apologize, but the AI assistant is currently disabled for maintenance. Please try again later or contact support.",
          error: "AI_DISABLED"
        };
      }

      // 3. Check rate limits
      const rateLimitCheck = await AIRateLimit.checkRateLimit(user.id, user.email, message.length);
      if (!rateLimitCheck.allowed) {
        // Log the blocked attempt
        if (conversationLog) {
          await conversationLog.addMessage({
            sender: 'ai',
            content: this.getRateLimitMessage(rateLimitCheck),
            flagged_content: true,
            flag_reason: `Rate limit: ${rateLimitCheck.reason}`
          });
        }

        return {
          success: false,
          message: this.getRateLimitMessage(rateLimitCheck),
          error: "RATE_LIMITED",
          rate_limit_info: rateLimitCheck
        };
      }

      // 4. Content moderation
      const moderationResult = await this.checkContentModeration(message, settings);
      if (moderationResult.blocked) {
        if (conversationLog) {
          await conversationLog.addMessage({
            sender: 'ai',
            content: moderationResult.message,
            flagged_content: true,
            flag_reason: moderationResult.reason
          });
        }

        return {
          success: false,
          message: moderationResult.message,
          error: "CONTENT_BLOCKED"
        };
      }

      // 5. Build system prompt from settings
      const systemPrompt = this.buildSystemPrompt(user.role, settings);

      // 6. Call OpenAI API
      const completion = await openai.chat.completions.create({
        model: settings.model_name,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message }
        ],
        temperature: settings.temperature,
        max_tokens: settings.max_tokens,
      });

      const response = completion.choices[0].message.content;
      aiTokensUsed = completion.usage.total_tokens;
      const responseTime = Date.now() - startTime;

      console.log(`🤖 AI Response (${responseTime}ms, ${aiTokensUsed} tokens): ${response.substring(0, 100)}...`);

      // 7. Log the conversation
      if (conversationLog) {
        // Add user message
        await conversationLog.addMessage({
          sender: 'user',
          content: message,
          contains_sensitive: moderationResult.sensitive
        });

        // Add AI response
        await conversationLog.addMessage({
          sender: 'ai',
          content: response,
          ai_model: settings.model_name,
          ai_temperature: settings.temperature,
          ai_tokens_used: aiTokensUsed,
          ai_response_time_ms: responseTime
        });
      }

      return {
        success: true,
        message: response,
        timestamp: new Date().toISOString(),
        tokens_used: aiTokensUsed,
        response_time: responseTime,
        model_used: settings.model_name
      };

    } catch (error) {
      console.error('AI Service Error:', error);
      aiError = error.message;

      // Log the error
      if (conversationLog) {
        await conversationLog.addMessage({
          sender: 'ai',
          content: "I'm sorry, I'm experiencing technical difficulties. Please try again in a moment.",
          flagged_content: true,
          flag_reason: `AI Error: ${error.message}`,
          ai_response_time_ms: Date.now() - startTime
        });
      }

      return {
        success: false,
        message: "I'm sorry, I'm having trouble processing your request right now. Please try again in a moment.",
        error: error.message,
        response_time: Date.now() - startTime
      };
    }
  }

  // Helper method to get rate limit message
  static getRateLimitMessage(rateLimitCheck) {
    switch (rateLimitCheck.reason) {
      case 'cooldown':
        return `Please wait ${Math.ceil(rateLimitCheck.wait_time / 1000)} seconds before sending another message.`;
      case 'hourly_limit':
        return `You've reached the hourly message limit of ${rateLimitCheck.limit}. Please try again at ${rateLimitCheck.reset_time.toLocaleTimeString()}.`;
      case 'daily_limit':
        return `You've reached the daily message limit of ${rateLimitCheck.limit}. Please try again tomorrow.`;
      case 'message_too_long':
        return `Your message is too long (${rateLimitCheck.current_length} characters). Please keep messages under ${rateLimitCheck.limit} characters.`;
      case 'user_blocked':
        return `Your access to the AI assistant has been temporarily restricted. ${rateLimitCheck.block_reason ? 'Reason: ' + rateLimitCheck.block_reason : ''}`;
      default:
        return 'You have exceeded the usage limits. Please try again later.';
    }
  }

  // Content moderation check
  static async checkContentModeration(message, settings) {
    const lowercaseMessage = message.toLowerCase();

    // Check for blocked words
    if (settings.moderation.enabled && settings.moderation.blocked_words.length > 0) {
      for (const blockedWord of settings.moderation.blocked_words) {
        if (lowercaseMessage.includes(blockedWord.toLowerCase())) {
          return {
            blocked: true,
            sensitive: true,
            reason: 'Blocked word detected',
            message: 'Your message contains content that is not allowed. Please rephrase your question.'
          };
        }
      }
    }

    // Check for escalation keywords
    let shouldEscalate = false;
    if (settings.moderation.auto_escalate_keywords.length > 0) {
      for (const keyword of settings.moderation.auto_escalate_keywords) {
        if (lowercaseMessage.includes(keyword.toLowerCase())) {
          shouldEscalate = true;
          break;
        }
      }
    }

    return {
      blocked: false,
      sensitive: shouldEscalate,
      reason: null,
      should_escalate: shouldEscalate
    };
  }

  // Build system prompt from settings
  static buildSystemPrompt(userRole, settings) {
    let systemPrompt = settings.system_prompts.base;

    // Add role-specific context
    if (settings.system_prompts[userRole]) {
      systemPrompt += '\n\n' + settings.system_prompts[userRole];
    }

    // Add personality and tone modifications
    if (settings.personality !== 'professional') {
      systemPrompt += this.getPersonalityPrompt(settings.personality, settings.custom_personality_prompt);
    }

    if (settings.tone !== 'neutral') {
      systemPrompt += this.getTonePrompt(settings.tone);
    }

    return systemPrompt;
  }

  // Get personality-specific prompt additions
  static getPersonalityPrompt(personality, customPrompt) {
    if (personality === 'custom' && customPrompt) {
      return `\n\nPersonality Instructions: ${customPrompt}`;
    }

    const personalityPrompts = {
      friendly: '\n\nPersonality: Be extra friendly, use casual language, and show enthusiasm in your responses.',
      casual: '\n\nPersonality: Use a relaxed, conversational tone. Feel free to use contractions and casual expressions.',
      formal: '\n\nPersonality: Maintain a formal, professional tone. Use complete sentences and avoid casual language.',
      helpful: '\n\nPersonality: Focus on being extremely helpful and going above and beyond to assist users.',
      technical: '\n\nPersonality: Provide detailed technical explanations and be precise with terminology.'
    };

    return personalityPrompts[personality] || '';
  }

  // Get tone-specific prompt additions
  static getTonePrompt(tone) {
    const tonePrompts = {
      warm: '\n\nTone: Use a warm, welcoming tone that makes users feel comfortable and supported.',
      energetic: '\n\nTone: Be energetic and enthusiastic in your responses. Use exclamation points and positive language.',
      calm: '\n\nTone: Maintain a calm, measured tone. Be reassuring and steady in your responses.',
      enthusiastic: '\n\nTone: Show enthusiasm and excitement about helping users achieve their goals.',
      serious: '\n\nTone: Maintain a serious, professional tone. Focus on accuracy and reliability.'
    };

    return tonePrompts[tone] || '';
  }

  static getSystemPrompt(userRole) {
    const basePrompt = `You are Dozyr's AI Customer Service Assistant, a helpful and professional virtual assistant for the Dozyr remote job marketplace platform.

PLATFORM OVERVIEW:
Dozyr connects talented professionals with companies offering remote work opportunities. Our platform facilitates job posting, talent discovery, secure payments through escrow, and project management.

YOUR ROLE:
- Provide helpful, accurate information about Dozyr's services
- Assist users with platform navigation and feature explanations
- Offer guidance on best practices for remote work
- Maintain a professional, friendly, and supportive tone
- Be concise but comprehensive in your responses
- Always prioritize user success and satisfaction

CORE FEATURES TO HELP WITH:
- Job posting and searching
- Profile creation and optimization
- Proposal submission and management
- Contract and milestone management
- Secure escrow payment system
- Messaging and communication tools
- Skill verification and endorsements

GUIDELINES:
- Keep responses helpful and actionable
- If you don't know something specific about Dozyr, admit it and suggest contacting support
- Never provide financial advice or guarantees
- Always encourage following platform guidelines and terms of service
- Promote professional communication and work standards`;

    const roleSpecificPrompts = {
      talent: `
SPECIFIC CONTEXT: You're helping a TALENT (freelancer/contractor) who uses Dozyr to find remote work opportunities.

COMMON TALENT NEEDS:
- Finding and applying to relevant jobs
- Creating compelling proposals
- Optimizing their profile to attract clients
- Understanding payment and escrow processes
- Managing contracts and milestones
- Building client relationships and getting reviews
- Skill development and positioning

Focus on helping them succeed as a service provider and build their freelance career.`,

      manager: `
SPECIFIC CONTEXT: You're helping a MANAGER (client/company) who uses Dozyr to hire remote talent.

COMMON MANAGER NEEDS:
- Posting effective job descriptions
- Finding and evaluating qualified talent
- Managing proposals and hiring decisions
- Setting up contracts and milestones
- Understanding payment and escrow processes
- Managing remote teams and projects
- Getting the best results from hired talent

Focus on helping them find great talent and manage successful remote work projects.`,

      admin: `
SPECIFIC CONTEXT: You're helping an ADMIN who manages the Dozyr platform.

COMMON ADMIN NEEDS:
- Platform oversight and management
- User support escalations
- System monitoring and analytics
- Policy and guideline enforcement
- Platform feature explanations
- Technical troubleshooting guidance

You can provide more detailed technical information and platform insights for administrative users.`
    };

    return basePrompt + (roleSpecificPrompts[userRole] || roleSpecificPrompts.talent);
  }

  static async generateWelcomeMessage(userRole, userName) {
    try {
      // Get AI settings for custom welcome messages
      const settings = await AISettings.getCurrentSettings();

      if (!settings.is_enabled) {
        return "I apologize, but the AI assistant is currently disabled for maintenance. Please try again later or contact support.";
      }

      // Get welcome message from settings and replace {name} placeholder
      let welcomeMessage = settings.welcome_messages[userRole] || settings.welcome_messages.talent;
      welcomeMessage = welcomeMessage.replace('{name}', userName);

      return welcomeMessage;
    } catch (error) {
      console.error('Error generating welcome message:', error);
      // Fallback to default messages
      const welcomeMessages = {
        talent: `👋 Hi ${userName}! I'm your Dozyr AI Assistant. I'm here to help you succeed as a freelancer on our platform. Whether you need help finding jobs, writing proposals, or managing your projects, just ask!`,
        manager: `👋 Welcome ${userName}! I'm your Dozyr AI Assistant. I'm here to help you find the perfect talent for your projects. Need help posting jobs, evaluating proposals, or managing your remote team? I'm here to assist!`,
        admin: `👋 Hello ${userName}! I'm your Dozyr AI Assistant. I'm here to support you with platform administration, user assistance, and any technical questions you might have. How can I help you today?`
      };

      return welcomeMessages[userRole] || welcomeMessages.talent;
    }
  }

  // Helper method to start or get conversation log
  static async getOrCreateConversationLog(sessionId, user, metadata = {}) {
    let conversationLog = await AIChatLog.findOne({ session_id: sessionId, is_active: true });

    if (!conversationLog) {
      conversationLog = await AIChatLog.startConversation(sessionId, user, metadata);
    }

    return conversationLog;
  }

  // Helper method to end conversation
  static async endConversation(sessionId, satisfaction = null, feedback = null) {
    const conversationLog = await AIChatLog.findOne({ session_id: sessionId, is_active: true });

    if (conversationLog) {
      conversationLog.conversation_end = new Date();
      conversationLog.is_active = false;

      if (satisfaction) {
        conversationLog.user_satisfaction_rating = satisfaction;
      }

      if (feedback) {
        conversationLog.user_feedback = feedback;
      }

      await conversationLog.save();
    }

    return conversationLog;
  }
}

module.exports = AIService;
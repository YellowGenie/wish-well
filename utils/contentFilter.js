const validator = require('validator');

class ContentFilter {
  static detectViolations(text) {
    const violations = [];

    // Email detection
    const emailViolations = this.detectEmails(text);
    violations.push(...emailViolations);

    // Phone number detection
    const phoneViolations = this.detectPhoneNumbers(text);
    violations.push(...phoneViolations);

    // External link detection
    const linkViolations = this.detectExternalLinks(text);
    violations.push(...linkViolations);

    // Social media handles detection
    const socialViolations = this.detectSocialHandles(text);
    violations.push(...socialViolations);

    // Inappropriate content detection (basic)
    const inappropriateViolations = this.detectInappropriateContent(text);
    violations.push(...inappropriateViolations);

    return violations;
  }

  static detectEmails(text) {
    const violations = [];
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = text.match(emailRegex) || [];

    matches.forEach(email => {
      if (validator.isEmail(email)) {
        violations.push({
          type: 'email',
          content: email,
          confidence: 1.0,
          reason: 'Email address detected in message'
        });
      }
    });

    return violations;
  }

  static detectPhoneNumbers(text) {
    const violations = [];
    
    // Various phone number patterns
    const phonePatterns = [
      /(\+?\d{1,4}[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})/g, // US format
      /(\+?\d{1,4}[\s.-]?)?\(?(\d{2,4})\)?[\s.-]?(\d{3,4})[\s.-]?(\d{3,4})/g, // International
      /\b\d{3}[\s.-]?\d{3}[\s.-]?\d{4}\b/g, // Simple format
      /\b\d{10,15}\b/g // Just digits
    ];

    phonePatterns.forEach(pattern => {
      const matches = text.match(pattern) || [];
      matches.forEach(match => {
        // Filter out obvious false positives (like years, IDs, etc.)
        const digitsOnly = match.replace(/\D/g, '');
        if (digitsOnly.length >= 10 && digitsOnly.length <= 15) {
          // Check if it's not a year or common ID format
          if (!this.isLikelyNotPhoneNumber(match)) {
            violations.push({
              type: 'phone',
              content: match,
              confidence: 0.8,
              reason: 'Phone number detected in message'
            });
          }
        }
      });
    });

    return violations;
  }

  static detectExternalLinks(text) {
    const violations = [];
    
    // URL patterns
    const urlPatterns = [
      /(https?:\/\/[^\s]+)/g,
      /(www\.[^\s]+)/g,
      /([a-zA-Z0-9-]+\.(com|org|net|edu|gov|io|co|app|dev|tech)[^\s]*)/g
    ];

    urlPatterns.forEach(pattern => {
      const matches = text.match(pattern) || [];
      matches.forEach(match => {
        violations.push({
          type: 'external_link',
          content: match,
          confidence: 0.9,
          reason: 'External link detected in message'
        });
      });
    });

    return violations;
  }

  static detectSocialHandles(text) {
    const violations = [];
    
    // Social media handle patterns
    const socialPatterns = [
      /@[a-zA-Z0-9_]+/g, // Twitter/Instagram handles
      /linkedin\.com\/in\/[^\s]+/g, // LinkedIn profiles
      /facebook\.com\/[^\s]+/g, // Facebook profiles
      /instagram\.com\/[^\s]+/g, // Instagram profiles
      /twitter\.com\/[^\s]+/g, // Twitter profiles
      /tiktok\.com\/@[^\s]+/g, // TikTok profiles
    ];

    socialPatterns.forEach(pattern => {
      const matches = text.match(pattern) || [];
      matches.forEach(match => {
        violations.push({
          type: 'social_handle',
          content: match,
          confidence: 0.7,
          reason: 'Social media handle or profile link detected'
        });
      });
    });

    return violations;
  }

  static detectInappropriateContent(text) {
    const violations = [];
    
    // Basic inappropriate content keywords
    const inappropriateKeywords = [
      'spam', 'scam', 'fraud', 'phishing',
      'inappropriate content', 'harassment',
      // Add more keywords as needed
    ];

    const lowerText = text.toLowerCase();
    inappropriateKeywords.forEach(keyword => {
      if (lowerText.includes(keyword)) {
        violations.push({
          type: 'inappropriate',
          content: keyword,
          confidence: 0.6,
          reason: 'Potentially inappropriate content detected'
        });
      }
    });

    return violations;
  }

  static isLikelyNotPhoneNumber(text) {
    // Check for patterns that are likely not phone numbers
    const notPhonePatterns = [
      /^\d{4}$/, // Years
      /^19\d{2}$|^20\d{2}$/, // Years 1900-2099
      /^\d{1,3}$/, // Too short
      /^0+$/, // All zeros
      /^1+$/, // All ones
    ];

    return notPhonePatterns.some(pattern => pattern.test(text.replace(/\D/g, '')));
  }

  static sanitizeMessage(text, violations) {
    let sanitized = text;

    violations.forEach(violation => {
      switch (violation.type) {
        case 'email':
          sanitized = sanitized.replace(violation.content, '[EMAIL REMOVED]');
          break;
        case 'phone':
          sanitized = sanitized.replace(violation.content, '[PHONE REMOVED]');
          break;
        case 'external_link':
          sanitized = sanitized.replace(violation.content, '[LINK REMOVED]');
          break;
        case 'social_handle':
          sanitized = sanitized.replace(violation.content, '[SOCIAL HANDLE REMOVED]');
          break;
        default:
          // For inappropriate content, we might want to flag but not auto-sanitize
          break;
      }
    });

    return sanitized;
  }

  static shouldBlockMessage(violations) {
    // Define rules for when to block a message entirely
    const highRiskViolations = violations.filter(v => 
      (v.type === 'email' && v.confidence >= 0.9) ||
      (v.type === 'phone' && v.confidence >= 0.8) ||
      (v.type === 'external_link' && v.confidence >= 0.9)
    );

    // Block if there are multiple high-confidence violations
    return highRiskViolations.length >= 2 || 
           violations.filter(v => v.type === 'inappropriate').length > 0;
  }

  static generateViolationSummary(violations) {
    const summary = {
      total: violations.length,
      byType: {},
      highConfidence: 0,
      shouldFlag: false,
      shouldBlock: false
    };

    violations.forEach(violation => {
      summary.byType[violation.type] = (summary.byType[violation.type] || 0) + 1;
      if (violation.confidence >= 0.8) {
        summary.highConfidence++;
      }
    });

    summary.shouldFlag = violations.length > 0;
    summary.shouldBlock = this.shouldBlockMessage(violations);

    return summary;
  }

  static async processMessage(text) {
    const violations = this.detectViolations(text);
    const summary = this.generateViolationSummary(violations);
    
    let processedMessage = text;
    if (summary.shouldBlock) {
      processedMessage = '[MESSAGE BLOCKED - POLICY VIOLATION]';
    } else if (summary.shouldFlag) {
      processedMessage = this.sanitizeMessage(text, violations);
    }

    return {
      originalMessage: text,
      processedMessage,
      violations,
      summary,
      action: summary.shouldBlock ? 'blocked' : (summary.shouldFlag ? 'sanitized' : 'allowed')
    };
  }
}

module.exports = ContentFilter;
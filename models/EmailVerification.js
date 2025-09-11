const { mongoose } = require('../config/mongodb');

const emailVerificationSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  email: {
    type: String,
    required: true
  },
  verification_code: {
    type: String,
    required: true
  },
  expires_at: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 } // TTL index
  },
  used_at: Date
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

emailVerificationSchema.index({ user_id: 1, verification_code: 1 });

// Static methods
emailVerificationSchema.statics.generateCode = function() {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

emailVerificationSchema.statics.getExpiryTime = function(minutes = 15) {
  return new Date(Date.now() + minutes * 60 * 1000);
};

emailVerificationSchema.statics.findLatestByUser = function(userId) {
  return this.findOne({ user_id: userId })
    .sort({ created_at: -1 })
    .limit(1);
};

emailVerificationSchema.statics.findByUserAndCode = function(userId, verificationCode) {
  return this.findOne({
    user_id: userId,
    verification_code: verificationCode,
    expires_at: { $gt: new Date() }, // Code must not be expired
    used_at: { $exists: false } // Code must not be used
  });
};

emailVerificationSchema.statics.markAsUsed = function(verificationId) {
  return this.findByIdAndUpdate(verificationId, {
    used_at: new Date()
  });
};

const EmailVerification = mongoose.model('EmailVerification', emailVerificationSchema);
module.exports = EmailVerification;
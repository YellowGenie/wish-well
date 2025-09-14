const { mongoose } = require('../config/mongodb');
const crypto = require('crypto');

// Password Reset Schema
const passwordResetSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User'
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  token: {
    type: String,
    required: true,
    unique: true
  },
  expires_at: {
    type: Date,
    required: true
  },
  used_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

// Create indexes for performance
passwordResetSchema.index({ token: 1 });
passwordResetSchema.index({ user_id: 1 });
passwordResetSchema.index({ email: 1 });
passwordResetSchema.index({ expires_at: 1 });

// Static methods
passwordResetSchema.statics.generateToken = function() {
  return crypto.randomBytes(32).toString('hex');
};

passwordResetSchema.statics.getExpiryTime = function(hours = 1) {
  const expiryTime = new Date();
  expiryTime.setHours(expiryTime.getHours() + hours);
  return expiryTime;
};

passwordResetSchema.statics.findByToken = async function(token) {
  return this.findOne({
    token,
    expires_at: { $gt: new Date() },
    used_at: null
  }).populate('user_id', 'email first_name last_name');
};

passwordResetSchema.statics.findByEmail = async function(email) {
  const User = require('./User');
  const user = await User.findOne({ email });
  if (!user) return null;

  return this.findOne({
    user_id: user._id,
    expires_at: { $gt: new Date() },
    used_at: null
  }).sort({ created_at: -1 });
};

passwordResetSchema.statics.markAsUsed = async function(token) {
  return this.updateOne(
    { token },
    { used_at: new Date() }
  );
};

passwordResetSchema.statics.deleteExpiredTokens = async function() {
  return this.deleteMany({
    $or: [
      { expires_at: { $lt: new Date() } },
      { used_at: { $ne: null } }
    ]
  });
};

passwordResetSchema.statics.deleteByUserId = async function(userId) {
  return this.deleteMany({ user_id: userId });
};

const PasswordReset = mongoose.model('PasswordReset', passwordResetSchema);

module.exports = PasswordReset;
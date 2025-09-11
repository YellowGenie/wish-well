const { mongoose } = require('../config/mongodb');

// Deleted User Schema for soft deletes
const deletedUserSchema = new mongoose.Schema({
  original_user_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  first_name: {
    type: String
  },
  last_name: {
    type: String
  },
  role: {
    type: String,
    enum: ['talent', 'manager', 'admin'],
    required: true
  },
  profile_image: {
    type: String
  },
  user_data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  profile_data: {
    type: mongoose.Schema.Types.Mixed
  },
  deletion_reason: {
    type: String
  },
  deleted_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  deleted_at: {
    type: Date,
    default: Date.now
  },
  original_created_at: {
    type: Date
  }
});

// Indexes
deletedUserSchema.index({ original_user_id: 1 });
deletedUserSchema.index({ deleted_by: 1 });
deletedUserSchema.index({ deleted_at: -1 });

const DeletedUser = mongoose.model('DeletedUser', deletedUserSchema);

module.exports = DeletedUser;
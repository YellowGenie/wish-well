const { mongoose } = require('../config/mongodb');

const interviewSchema = new mongoose.Schema({
  job_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true
  },
  talent_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TalentProfile',
    required: true
  },
  manager_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManagerProfile',
    required: true
  },
  status: {
    type: String,
    enum: ['scheduled', 'completed', 'cancelled'],
    default: 'scheduled'
  },
  scheduled_at: Date,
  meeting_link: String,
  notes: String
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

const Interview = mongoose.model('Interview', interviewSchema);
module.exports = Interview;
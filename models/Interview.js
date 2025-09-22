const { mongoose } = require('../config/mongodb');

const questionSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['text', 'multiple_choice', 'coding', 'practical'],
    default: 'text'
  },
  answer: {
    type: String,
    trim: true
  },
  answered_at: Date
});

const interviewSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  job_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job'
  },
  proposal_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Proposal'
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
    enum: ['created', 'sent', 'in_progress', 'completed', 'reviewed', 'next_steps', 'rejected', 'inappropriate', 'hold', 'cancelled'],
    default: 'created'
  },
  questions: [questionSchema],
  estimated_duration: {
    type: Number,
    min: 15,
    max: 480
  },
  scheduled_at: Date,
  started_at: Date,
  completed_at: Date,
  meeting_link: String,
  notes: String,
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  manager_rating: {
    type: Number,
    min: 1,
    max: 5
  },
  manager_feedback: String,
  talent_rating: {
    type: Number,
    min: 1,
    max: 5
  },
  talent_feedback: String,
  is_flagged: {
    type: Boolean,
    default: false
  },
  flagged_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  flag_reason: String,
  flagged_at: Date
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Indexes
interviewSchema.index({ job_id: 1 });
interviewSchema.index({ talent_id: 1 });
interviewSchema.index({ manager_id: 1 });
interviewSchema.index({ status: 1 });
interviewSchema.index({ scheduled_at: 1 });

// Static methods
interviewSchema.statics.create = async function({
  title,
  description,
  job_id,
  proposal_id,
  talent_id,
  manager_id,
  questions = [],
  estimated_duration,
  scheduled_at,
  priority = 'medium'
}) {
  const interview = new this({
    title,
    description,
    job_id,
    proposal_id,
    talent_id,
    manager_id,
    questions: questions.map(q => typeof q === 'string' ? { text: q } : q),
    estimated_duration,
    scheduled_at,
    priority
  });
  const savedInterview = await interview.save();
  return savedInterview._id;
};

interviewSchema.statics.findById = async function(id) {
  return await this.findOne({ _id: id })
    .populate('job_id')
    .populate('proposal_id')
    .populate({
      path: 'talent_id',
      populate: {
        path: 'user_id',
        select: 'first_name last_name'
      }
    })
    .populate({
      path: 'manager_id',
      populate: {
        path: 'user_id',
        select: 'first_name last_name'
      }
    });
};

interviewSchema.statics.getInterviewsByManager = async function(manager_id, status, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const filter = { manager_id: new mongoose.Types.ObjectId(manager_id) };
  if (status) filter.status = status;

  const [interviews, total] = await Promise.all([
    this.find(filter)
      .populate('job_id', 'title')
      .populate({
        path: 'talent_id',
        populate: {
          path: 'user_id',
          select: 'first_name last_name'
        }
      })
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    this.countDocuments(filter)
  ]);

  return {
    interviews: interviews.map(i => ({ ...i, id: i._id.toString() })),
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
};

interviewSchema.statics.getInterviewsByTalent = async function(talent_id, status, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const filter = { talent_id: new mongoose.Types.ObjectId(talent_id) };
  if (status) filter.status = status;

  const [interviews, total] = await Promise.all([
    this.find(filter)
      .populate('job_id', 'title')
      .populate({
        path: 'manager_id',
        populate: {
          path: 'user_id',
          select: 'first_name last_name'
        }
      })
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    this.countDocuments(filter)
  ]);

  return {
    interviews: interviews.map(i => ({ ...i, id: i._id.toString() })),
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
};

interviewSchema.statics.updateStatus = async function(id, status, user_id, change_reason) {
  const result = await this.updateOne(
    { _id: id },
    {
      $set: {
        status,
        ...(status === 'in_progress' && { started_at: new Date() }),
        ...(status === 'completed' && { completed_at: new Date() })
      }
    }
  );
  return result.modifiedCount > 0;
};

interviewSchema.statics.answerQuestion = async function(interview_id, question_index, answer, user_id) {
  const result = await this.updateOne(
    {
      _id: interview_id,
      [`questions.${question_index}`]: { $exists: true }
    },
    {
      $set: {
        [`questions.${question_index}.answer`]: answer,
        [`questions.${question_index}.answered_at`]: new Date()
      }
    }
  );
  return result.modifiedCount > 0;
};

interviewSchema.statics.addRating = async function(id, rater_type, rating, feedback, user_id) {
  const updateData = {};
  if (rater_type === 'manager') {
    updateData.manager_rating = rating;
    updateData.manager_feedback = feedback;
  } else if (rater_type === 'talent') {
    updateData.talent_rating = rating;
    updateData.talent_feedback = feedback;
  }

  const result = await this.updateOne({ _id: id }, { $set: updateData });
  return result.modifiedCount > 0;
};

interviewSchema.statics.flagInterview = async function(id, flagged_by, reason) {
  const result = await this.updateOne(
    { _id: id },
    {
      $set: {
        is_flagged: true,
        flagged_by,
        flag_reason: reason,
        flagged_at: new Date()
      }
    }
  );
  return result.modifiedCount > 0;
};

interviewSchema.statics.getInterviewProgress = async function(id) {
  const interview = await this.findById(id);
  if (!interview) return null;

  const totalQuestions = interview.questions.length;
  const answeredQuestions = interview.questions.filter(q => q.answer).length;
  const progress = totalQuestions > 0 ? (answeredQuestions / totalQuestions) * 100 : 0;

  return {
    total_questions: totalQuestions,
    answered_questions: answeredQuestions,
    progress_percentage: Math.round(progress),
    status: interview.status,
    started_at: interview.started_at,
    completed_at: interview.completed_at
  };
};

const Interview = mongoose.model('Interview', interviewSchema);
module.exports = Interview;
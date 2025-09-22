const { mongoose } = require('../config/mongodb');

const templateQuestionSchema = new mongoose.Schema({
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
  order: {
    type: Number,
    default: 0
  }
});

const interviewTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  manager_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManagerProfile',
    required: true
  },
  category: {
    type: String,
    enum: ['technical', 'behavioral', 'cultural_fit', 'general', 'specialized'],
    default: 'general'
  },
  questions: [templateQuestionSchema],
  estimated_duration: {
    type: Number,
    min: 15,
    max: 480,
    default: 60
  },
  difficulty_level: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced', 'expert'],
    default: 'intermediate'
  },
  tags: [{
    type: String,
    trim: true
  }],
  is_public: {
    type: Boolean,
    default: false
  },
  usage_count: {
    type: Number,
    default: 0
  },
  last_used_at: Date,
  is_active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Indexes
interviewTemplateSchema.index({ manager_id: 1 });
interviewTemplateSchema.index({ category: 1 });
interviewTemplateSchema.index({ tags: 1 });
interviewTemplateSchema.index({ is_public: 1 });
interviewTemplateSchema.index({ is_active: 1 });
interviewTemplateSchema.index({ name: 'text', description: 'text' });

// Static methods
interviewTemplateSchema.statics.create = async function({
  name,
  description,
  manager_id,
  category = 'general',
  questions = [],
  estimated_duration = 60,
  difficulty_level = 'intermediate',
  tags = [],
  is_public = false
}) {
  const template = new this({
    name,
    description,
    manager_id,
    category,
    questions: questions.map((q, index) => ({
      text: typeof q === 'string' ? q : q.text,
      type: typeof q === 'object' ? q.type || 'text' : 'text',
      order: typeof q === 'object' ? q.order || index : index
    })),
    estimated_duration,
    difficulty_level,
    tags,
    is_public
  });

  const savedTemplate = await template.save();
  return savedTemplate._id;
};

interviewTemplateSchema.statics.findById = async function(id) {
  return await this.findOne({ _id: id, is_active: true })
    .populate({
      path: 'manager_id',
      populate: {
        path: 'user_id',
        select: 'first_name last_name'
      }
    });
};

interviewTemplateSchema.statics.getTemplatesByManager = async function(manager_id, filters = {}, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const filter = {
    manager_id: new mongoose.Types.ObjectId(manager_id),
    is_active: true
  };

  if (filters.category) filter.category = filters.category;
  if (filters.difficulty_level) filter.difficulty_level = filters.difficulty_level;
  if (filters.tags && filters.tags.length > 0) filter.tags = { $in: filters.tags };
  if (filters.search) {
    filter.$or = [
      { name: { $regex: filters.search, $options: 'i' } },
      { description: { $regex: filters.search, $options: 'i' } },
      { tags: { $regex: filters.search, $options: 'i' } }
    ];
  }

  const [templates, total] = await Promise.all([
    this.find(filter)
      .sort({ last_used_at: -1, created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    this.countDocuments(filter)
  ]);

  return {
    templates: templates.map(t => ({ ...t, id: t._id.toString() })),
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
};

interviewTemplateSchema.statics.getPublicTemplates = async function(filters = {}, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const filter = {
    is_public: true,
    is_active: true
  };

  if (filters.category) filter.category = filters.category;
  if (filters.difficulty_level) filter.difficulty_level = filters.difficulty_level;
  if (filters.tags && filters.tags.length > 0) filter.tags = { $in: filters.tags };
  if (filters.search) {
    filter.$or = [
      { name: { $regex: filters.search, $options: 'i' } },
      { description: { $regex: filters.search, $options: 'i' } },
      { tags: { $regex: filters.search, $options: 'i' } }
    ];
  }

  const [templates, total] = await Promise.all([
    this.find(filter)
      .populate({
        path: 'manager_id',
        populate: {
          path: 'user_id',
          select: 'first_name last_name'
        }
      })
      .sort({ usage_count: -1, created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    this.countDocuments(filter)
  ]);

  return {
    templates: templates.map(t => ({ ...t, id: t._id.toString() })),
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
};

interviewTemplateSchema.statics.updateTemplate = async function(id, manager_id, updateData) {
  const result = await this.updateOne(
    { _id: id, manager_id, is_active: true },
    { $set: updateData }
  );
  return result.modifiedCount > 0;
};

interviewTemplateSchema.statics.deleteTemplate = async function(id, manager_id) {
  const result = await this.updateOne(
    { _id: id, manager_id },
    { $set: { is_active: false } }
  );
  return result.modifiedCount > 0;
};

interviewTemplateSchema.statics.useTemplate = async function(id) {
  const result = await this.updateOne(
    { _id: id, is_active: true },
    {
      $inc: { usage_count: 1 },
      $set: { last_used_at: new Date() }
    }
  );
  return result.modifiedCount > 0;
};

interviewTemplateSchema.statics.duplicateTemplate = async function(id, manager_id, name) {
  const originalTemplate = await this.findById(id);
  if (!originalTemplate) return null;

  const duplicatedTemplate = new this({
    name: name || `${originalTemplate.name} (Copy)`,
    description: originalTemplate.description,
    manager_id,
    category: originalTemplate.category,
    questions: originalTemplate.questions,
    estimated_duration: originalTemplate.estimated_duration,
    difficulty_level: originalTemplate.difficulty_level,
    tags: originalTemplate.tags,
    is_public: false
  });

  const saved = await duplicatedTemplate.save();
  return saved._id;
};

const InterviewTemplate = mongoose.model('InterviewTemplate', interviewTemplateSchema);
module.exports = InterviewTemplate;
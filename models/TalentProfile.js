const { mongoose } = require('../config/mongodb');

// TalentProfile Schema
const talentProfileSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  title: {
    type: String,
    trim: true
  },
  bio: {
    type: String,
    trim: true
  },
  hourly_rate: {
    type: Number,
    min: 0
  },
  availability: {
    type: String,
    enum: ['full-time', 'part-time', 'contract'],
    default: 'contract'
  },
  location: {
    type: String,
    trim: true
  },
  portfolio_description: {
    type: String,
    trim: true
  },
  profile_picture: {
    type: String,
    trim: true
  }
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

// Indexes
talentProfileSchema.index({ user_id: 1 });
talentProfileSchema.index({ hourly_rate: 1 });
talentProfileSchema.index({ availability: 1 });
talentProfileSchema.index({ location: 1 });

// Static methods
talentProfileSchema.statics.create = async function({ user_id, title, bio, hourly_rate, availability, location, portfolio_description }) {
  const profile = new this({ user_id, title, bio, hourly_rate, availability, location, portfolio_description });
  const savedProfile = await profile.save();
  return savedProfile._id;
};

talentProfileSchema.statics.findByUserId = async function(user_id) {
  return await this.findOne({ user_id })
    .populate('user_id', 'first_name last_name email');
};

talentProfileSchema.statics.findById = async function(id) {
  return await this.findOne({ _id: id })
    .populate('user_id', 'first_name last_name email');
};

talentProfileSchema.statics.update = async function(user_id, updates) {
  const result = await this.updateOne({ user_id }, { $set: updates });
  return result.modifiedCount > 0;
};

talentProfileSchema.statics.addSkill = async function(talent_id, skill_id, proficiency = 'intermediate') {
  try {
    const TalentSkill = mongoose.model('TalentSkill');
    const skill = new TalentSkill({ talent_id, skill_id, proficiency });
    const savedSkill = await skill.save();
    return savedSkill._id;
  } catch (error) {
    if (error.code === 11000) { // Duplicate key error
      return null; // Skill already exists
    }
    throw error;
  }
};

talentProfileSchema.statics.removeSkill = async function(talent_id, skill_id) {
  const TalentSkill = mongoose.model('TalentSkill');
  const result = await TalentSkill.deleteOne({ talent_id, skill_id });
  return result.deletedCount > 0;
};

talentProfileSchema.statics.getSkills = async function(talent_id) {
  const TalentSkill = mongoose.model('TalentSkill');
  const skills = await TalentSkill.find({ talent_id })
    .populate('skill_id', 'name category')
    .sort({ 'skill_id.name': 1 });
  
  return skills.map(ts => ({
    id: ts.skill_id._id,
    name: ts.skill_id.name,
    category: ts.skill_id.category,
    proficiency: ts.proficiency
  }));
};

talentProfileSchema.statics.searchTalents = async function({ skills, hourly_rate_min, hourly_rate_max, availability, location, page = 1, limit = 20 }) {
  const skip = (page - 1) * limit;
  
  let query = { };
  
  // Build query conditions
  const User = mongoose.model('User');
  const activeUserIds = await User.find({ is_active: true }).distinct('_id');
  query.user_id = { $in: activeUserIds };
  
  if (hourly_rate_min !== undefined) {
    query.hourly_rate = { ...query.hourly_rate, $gte: hourly_rate_min };
  }
  
  if (hourly_rate_max !== undefined) {
    query.hourly_rate = { ...query.hourly_rate, $lte: hourly_rate_max };
  }
  
  if (availability) {
    query.availability = availability;
  }
  
  if (location) {
    query.location = new RegExp(location, 'i'); // Case-insensitive search
  }
  
  const talents = await this.find(query)
    .populate('user_id', 'first_name last_name email')
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(limit);
  
  const total = await this.countDocuments(query);
  
  return {
    talents: talents.map(talent => ({
      ...talent.toObject(),
      first_name: talent.user_id.first_name,
      last_name: talent.user_id.last_name,
      email: talent.user_id.email
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
};

const TalentProfile = mongoose.model('TalentProfile', talentProfileSchema);

module.exports = TalentProfile;
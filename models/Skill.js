const { mongoose } = require('../config/mongodb');

// Skill Schema
const skillSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  category: {
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
skillSchema.index({ name: 1 }, { unique: true });
skillSchema.index({ category: 1 });
skillSchema.index({ name: 'text', category: 'text' });

// Static methods
skillSchema.statics.findByName = async function(name) {
  return await this.findOne({ name: { $regex: new RegExp(name, 'i') } });
};

skillSchema.statics.findByCategory = async function(category) {
  return await this.find({ category: { $regex: new RegExp(category, 'i') } }).sort({ name: 1 });
};

skillSchema.statics.createSkill = async function(name, category = null) {
  try {
    const skill = new this({ name: name.trim(), category });
    return await skill.save();
  } catch (error) {
    if (error.code === 11000) {
      return null; // Skill already exists
    }
    throw error;
  }
};

skillSchema.statics.getAllSkills = async function() {
  return await this.find().sort({ name: 1 });
};

skillSchema.statics.searchSkills = async function(query) {
  return await this.find({
    $or: [
      { name: { $regex: new RegExp(query, 'i') } },
      { category: { $regex: new RegExp(query, 'i') } }
    ]
  }).sort({ name: 1 });
};

const Skill = mongoose.model('Skill', skillSchema);

module.exports = Skill;
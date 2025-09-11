const { mongoose } = require('../config/mongodb');

// TalentSkill Schema - Junction table for talent-skill relationships
const talentSkillSchema = new mongoose.Schema({
  talent_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TalentProfile',
    required: true
  },
  skill_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Skill',
    required: true
  },
  proficiency: {
    type: String,
    enum: ['beginner', 'intermediate', 'expert'],
    default: 'intermediate'
  }
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

// Compound index to ensure unique talent-skill combinations
talentSkillSchema.index({ talent_id: 1, skill_id: 1 }, { unique: true });
talentSkillSchema.index({ talent_id: 1 });
talentSkillSchema.index({ skill_id: 1 });

const TalentSkill = mongoose.model('TalentSkill', talentSkillSchema);

module.exports = TalentSkill;
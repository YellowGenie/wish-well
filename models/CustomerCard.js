const { mongoose } = require('../config/mongodb');

const customerCardSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  stripe_customer_id: {
    type: String,
    required: true
  },
  stripe_payment_method_id: {
    type: String,
    required: true,
    unique: true
  },
  last_four: {
    type: String,
    required: true
  },
  brand: {
    type: String,
    required: true
  },
  exp_month: {
    type: Number,
    required: true
  },
  exp_year: {
    type: Number,
    required: true
  },
  is_default: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

customerCardSchema.index({ user_id: 1 });

const CustomerCard = mongoose.model('CustomerCard', customerCardSchema);
module.exports = CustomerCard;
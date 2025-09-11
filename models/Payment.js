const { mongoose } = require('../config/mongodb');

const paymentSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  stripe_customer_id: String,
  stripe_payment_intent_id: {
    type: String,
    unique: true,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'usd'
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  job_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job'
  },
  description: String
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

paymentSchema.index({ user_id: 1 });
paymentSchema.index({ status: 1 });

const Payment = mongoose.model('Payment', paymentSchema);
module.exports = Payment;
const Stripe = require('stripe');

let stripe = null;

// Only initialize Stripe if we have a secret key
if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'your_stripe_secret_key') {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-06-20',
  });
  console.log('✅ Stripe initialized successfully');
} else {
  console.log('⚠️ Stripe not initialized - missing STRIPE_SECRET_KEY environment variable');
}

module.exports = stripe;
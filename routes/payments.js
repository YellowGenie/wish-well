const express = require('express');
const router = express.Router();
const stripe = require('../config/stripe');
const { auth } = require('../middleware/auth');
const Payment = require('../models/Payment');
const CustomerCard = require('../models/CustomerCard');
const User = require('../models/User');
const PaymentPackage = require('../models/PaymentPackage');

// Helper function to check user's available credits
async function checkUserCredits(userId) {
  try {
    // Check for actual package purchases
    const packagePurchases = await Payment.find({
      user_id: userId,
      payment_type: 'package_purchase',
      status: 'completed'
    }).populate('package_id');

    if (packagePurchases && packagePurchases.length > 0) {
      const latestPackage = packagePurchases[packagePurchases.length - 1];
      return {
        hasCredits: true,
        packageInfo: {
          name: latestPackage.package_id ? latestPackage.package_id.name : 'Purchased Package',
          remaining_credits: packagePurchases.length * 5, // 5 credits per package
          amount_paid: latestPackage.amount / 100
        }
      };
    }

    // Fallback to simulation logic
    const PackageController = require('../controllers/packageController');
    const hasActivePackage = await PackageController.checkUserHasActivePackage(userId);

    if (hasActivePackage) {
      return {
        hasCredits: true,
        packageInfo: {
          name: 'Professional Package',
          remaining_credits: 5
        }
      };
    }

    return { hasCredits: false };
  } catch (error) {
    console.error('Error checking user credits:', error);
    return { hasCredits: false };
  }
}

// Helper function to get default job posting price
async function getDefaultJobPostingPrice() {
  try {
    // Look for a default or basic package for job posting
    const packages = await PaymentPackage.find({
      'availability.is_active': true,
      'tags': { $in: ['default', 'basic'] }
    }).sort({ 'pricing.base_price': 1 }).limit(1);

    if (packages.length > 0) {
      const pkg = packages[0];
      const jobPostsFeature = pkg.features.find(f => f.feature_key === 'job_posts');
      if (jobPostsFeature) {
        return {
          price: pkg.pricing.base_price, // price in cents
          package_name: pkg.name
        };
      }
    }

    return null; // No default pricing found
  } catch (error) {
    console.error('Error getting default pricing:', error);
    return null;
  }
}

// Middleware to check if Stripe is available
const checkStripe = (req, res, next) => {
  if (!stripe) {
    return res.status(503).json({
      error: 'Payment system unavailable',
      message: 'Stripe is not configured. Payments are currently disabled.'
    });
  }
  next();
};

// Apply Stripe check to payment routes that need it (excluding create-payment-intent for free posting)
router.use(['/confirm-payment', '/cards', '/webhook'], checkStripe);

// Debug endpoint to check user payments (temporary)
router.get('/debug-user-payments', auth, async (req, res) => {
  try {
    const user_id = req.user.id;

    // Get all payments for this user
    const allPayments = await Payment.find({ user_id }).sort({ created_at: -1 });

    // Check specific package purchases
    const packagePurchases = await Payment.find({
      user_id,
      payment_type: 'package_purchase',
      status: 'completed'
    });

    // Check any completed payments
    const completedPayments = await Payment.find({
      user_id,
      status: 'completed'
    });

    res.json({
      user_id,
      total_payments: allPayments.length,
      all_payments: allPayments,
      package_purchases,
      completed_payments,
      debug_info: {
        has_package_purchases: packagePurchases.length > 0,
        has_completed_payments: completedPayments.length > 0
      }
    });
  } catch (error) {
    console.error('Debug payments error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Create payment intent for job posting
router.post('/create-payment-intent', auth, async (req, res) => {
  try {
    const { job_id, description = 'Job posting fee' } = req.body;
    const user_id = req.user.id;

    // Debug logging
    console.log(`Creating payment intent for user ${user_id}`);

    // Check user's active packages and available credits
    const PackageController = require('../controllers/packageController');
    let amount = 0; // Default to free
    let usePackageCredits = false;
    let packageInfo = null;

    try {
      // Check if user has available credits from packages
      const creditsCheck = await checkUserCredits(user_id);
      console.log('Credits check result:', creditsCheck);

      if (creditsCheck.hasCredits) {
        // User has available credits - post for free using package credits
        usePackageCredits = true;
        packageInfo = creditsCheck.packageInfo;
        amount = 0;
      } else {
        // No credits available - check default pricing
        const defaultPackage = await getDefaultJobPostingPrice();
        amount = defaultPackage ? defaultPackage.price : 0; // If no default pricing, make it free
      }
    } catch (packageError) {
      console.log('Package system check failed, making job posting free:', packageError.message);
      amount = 0;
    }

    // If amount is 0, return success without creating Stripe payment
    if (amount === 0) {
      return res.json({
        success: true,
        free_posting: !usePackageCredits,
        using_package_credits: usePackageCredits,
        package_info: packageInfo,
        message: usePackageCredits ?
          'Job posting will use your package credits' :
          'Job posting is currently free'
      });
    }
    
    // Create or get Stripe customer
    let customer;
    try {
      const customers = await stripe.customers.list({
        email: req.user.email,
        limit: 1
      });
      
      if (customers.data.length > 0) {
        customer = customers.data[0];
      } else {
        customer = await stripe.customers.create({
          email: req.user.email,
          name: `${req.user.first_name} ${req.user.last_name}`,
          metadata: {
            user_id: user_id.toString()
          }
        });
      }
    } catch (error) {
      return res.status(400).json({
        error: 'Failed to create customer',
        details: error.message
      });
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      customer: customer.id,
      metadata: {
        user_id: user_id.toString(),
        job_id: job_id ? job_id.toString() : '',
        description
      },
      setup_future_usage: 'on_session' // Save payment method for future use
    });

    // Save payment record to database
    const payment_id = await Payment.create({
      user_id,
      stripe_customer_id: customer.id,
      stripe_payment_intent_id: paymentIntent.id,
      amount,
      currency: 'usd',
      status: 'pending',
      job_id,
      description
    });

    res.json({
      client_secret: paymentIntent.client_secret,
      payment_id,
      customer_id: customer.id
    });

  } catch (error) {
    console.error('Payment intent creation error:', error);
    res.status(500).json({
      error: 'Failed to create payment intent',
      details: error.message
    });
  }
});

// Confirm payment and complete job posting
router.post('/confirm-payment', auth, async (req, res) => {
  try {
    const { payment_intent_id } = req.body;
    
    // Retrieve payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);
    
    if (paymentIntent.status === 'succeeded') {
      // Update payment status in database
      await Payment.updateByPaymentIntentId(payment_intent_id, {
        status: 'completed'
      });
      
      // If payment method was saved, store it
      if (paymentIntent.payment_method) {
        const paymentMethod = await stripe.paymentMethods.retrieve(paymentIntent.payment_method);
        
        // Check if card is already saved
        const existingCard = await CustomerCard.findByPaymentMethodId(paymentIntent.payment_method);
        
        if (!existingCard && paymentMethod.type === 'card') {
          const userCards = await CustomerCard.findByUserId(req.user.id);
          const isFirstCard = userCards.length === 0;
          
          await CustomerCard.create({
            user_id: req.user.id,
            stripe_customer_id: paymentIntent.customer,
            stripe_payment_method_id: paymentIntent.payment_method,
            last_four: paymentMethod.card.last4,
            brand: paymentMethod.card.brand,
            exp_month: paymentMethod.card.exp_month,
            exp_year: paymentMethod.card.exp_year,
            is_default: isFirstCard
          });
        }
      }
      
      res.json({
        success: true,
        message: 'Payment confirmed successfully'
      });
    } else {
      res.status(400).json({
        error: 'Payment not completed',
        status: paymentIntent.status
      });
    }

  } catch (error) {
    console.error('Payment confirmation error:', error);
    res.status(500).json({
      error: 'Failed to confirm payment',
      details: error.message
    });
  }
});

// Get user's payment history
router.get('/history', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    
    const result = await Payment.findByUserId(req.user.id, page, limit);
    
    res.json(result);

  } catch (error) {
    console.error('Payment history error:', error);
    res.status(500).json({
      error: 'Failed to retrieve payment history',
      details: error.message
    });
  }
});

// Get saved payment methods
router.get('/cards', auth, async (req, res) => {
  try {
    const cards = await CustomerCard.findByUserId(req.user.id);
    
    res.json({
      cards: cards.map(card => ({
        id: card.id,
        last_four: card.last_four,
        brand: card.brand,
        exp_month: card.exp_month,
        exp_year: card.exp_year,
        is_default: card.is_default
      }))
    });

  } catch (error) {
    console.error('Cards retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve saved cards',
      details: error.message
    });
  }
});

// Delete a saved payment method
router.delete('/cards/:id', auth, async (req, res) => {
  try {
    const cardId = req.params.id;
    
    // Get card details before deleting
    const card = await CustomerCard.findById(cardId);
    
    if (!card || card.user_id !== req.user.id) {
      return res.status(404).json({
        error: 'Card not found'
      });
    }
    
    // Detach payment method from Stripe
    try {
      await stripe.paymentMethods.detach(card.stripe_payment_method_id);
    } catch (stripeError) {
      console.warn('Failed to detach payment method from Stripe:', stripeError.message);
    }
    
    // Delete from database
    const deleted = await CustomerCard.delete(cardId, req.user.id);
    
    if (deleted) {
      res.json({
        success: true,
        message: 'Card deleted successfully'
      });
    } else {
      res.status(400).json({
        error: 'Failed to delete card'
      });
    }

  } catch (error) {
    console.error('Card deletion error:', error);
    res.status(500).json({
      error: 'Failed to delete card',
      details: error.message
    });
  }
});

// Set default payment method
router.put('/cards/:id/default', auth, async (req, res) => {
  try {
    const cardId = req.params.id;
    
    const updated = await CustomerCard.setDefault(req.user.id, cardId);
    
    if (updated) {
      res.json({
        success: true,
        message: 'Default card updated successfully'
      });
    } else {
      res.status(400).json({
        error: 'Failed to update default card'
      });
    }

  } catch (error) {
    console.error('Default card update error:', error);
    res.status(500).json({
      error: 'Failed to update default card',
      details: error.message
    });
  }
});

// Download invoice (PDF generation)
router.get('/invoice/:payment_id', auth, async (req, res) => {
  try {
    const payment_id = req.params.payment_id;
    
    const payment = await Payment.findById(payment_id);
    
    if (!payment || payment.user_id !== req.user.id) {
      return res.status(404).json({
        error: 'Invoice not found'
      });
    }
    
    if (payment.status !== 'completed') {
      return res.status(400).json({
        error: 'Invoice only available for completed payments'
      });
    }
    
    // Simple text-based invoice for now
    const invoice = `
DOZYR INVOICE
=============

Invoice #: ${payment.id}
Date: ${new Date(payment.created_at).toLocaleDateString()}
Payment ID: ${payment.stripe_payment_intent_id}

Description: ${payment.description}
Amount: $${(payment.amount / 100).toFixed(2)} ${payment.currency.toUpperCase()}
Status: ${payment.status}

Thank you for your business!
`;
    
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${payment.id}.txt"`);
    res.send(invoice);

  } catch (error) {
    console.error('Invoice download error:', error);
    res.status(500).json({
      error: 'Failed to download invoice',
      details: error.message
    });
  }
});

// Webhook endpoint for Stripe events
router.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      await Payment.updateByPaymentIntentId(paymentIntent.id, {
        status: 'completed'
      });
      break;
      
    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object;
      await Payment.updateByPaymentIntentId(failedPayment.id, {
        status: 'failed'
      });
      break;
      
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({received: true});
});

module.exports = router;
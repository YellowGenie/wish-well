const express = require('express');
const router = express.Router();
const stripe = require('../config/stripe');
const { auth } = require('../middleware/auth');
const { body, validationResult, param } = require('express-validator');
const EscrowAccount = require('../models/EscrowAccount');
const Contract = require('../models/Contract');
const ManagerProfile = require('../models/ManagerProfile');
const TalentProfile = require('../models/TalentProfile');
const CustomerCard = require('../models/CustomerCard');
const Notification = require('../models/Notification');

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

// Apply Stripe check to all escrow routes
router.use(checkStripe);

// Create escrow account for accepted contract
router.post('/create', auth, [
  body('contract_id').isMongoId().withMessage('Valid contract ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { contract_id } = req.body;
    
    // Get manager profile
    const managerProfile = await ManagerProfile.findByUserId(req.user.id);
    if (!managerProfile) {
      return res.status(403).json({ error: 'Only managers can create escrow accounts' });
    }

    // Get contract details
    const contract = await Contract.findById(contract_id);
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Verify manager owns the contract
    if (contract.manager_id.toString() !== managerProfile._id.toString()) {
      return res.status(403).json({ error: 'You can only create escrow for your own contracts' });
    }

    // Verify contract is accepted
    if (contract.status !== 'accepted') {
      return res.status(400).json({ error: 'Can only create escrow for accepted contracts' });
    }

    // Check if escrow already exists
    const existingEscrow = await EscrowAccount.findByContractId(contract_id);
    if (existingEscrow) {
      return res.status(400).json({ error: 'Escrow account already exists for this contract' });
    }

    // Get or create Stripe customer
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
            user_id: req.user.id.toString(),
            type: 'manager'
          }
        });
      }
    } catch (error) {
      return res.status(400).json({
        error: 'Failed to create customer',
        details: error.message
      });
    }

    // Calculate platform fee (5%)
    const platformFeeAmount = Math.round(contract.total_amount * 0.05 * 100) / 100; // Round to 2 decimal places

    // Create escrow account
    const escrowId = await EscrowAccount.create({
      contract_id: contract_id,
      manager_id: managerProfile._id,
      talent_id: contract.talent_id,
      stripe_customer_id: customer.id,
      total_amount: contract.total_amount,
      platform_fee_percentage: 5.0,
      platform_fee_amount: platformFeeAmount,
      status: 'created'
    });

    // Update contract status to active
    await Contract.updateStatus(contract_id, 'active');

    const escrowAccount = await EscrowAccount.findByContractId(contract_id);

    res.status(201).json({
      success: true,
      message: 'Escrow account created successfully',
      escrow_account: escrowAccount
    });

  } catch (error) {
    console.error('Escrow creation error:', error);
    res.status(500).json({
      error: 'Failed to create escrow account',
      details: error.message
    });
  }
});

// Fund escrow account (deposit money)
router.post('/fund', auth, [
  body('contract_id').isMongoId().withMessage('Valid contract ID is required'),
  body('payment_method_id').optional().isString().withMessage('Payment method ID must be a string'),
  body('use_saved_card').optional().isBoolean().withMessage('Use saved card must be boolean'),
  body('save_payment_method').optional().isBoolean().withMessage('Save payment method must be boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { contract_id, payment_method_id, use_saved_card = false, save_payment_method = false } = req.body;
    
    // Get manager profile
    const managerProfile = await ManagerProfile.findByUserId(req.user.id);
    if (!managerProfile) {
      return res.status(403).json({ error: 'Only managers can fund escrow accounts' });
    }

    // Get escrow account
    const escrowAccount = await EscrowAccount.findByContractId(contract_id);
    if (!escrowAccount) {
      return res.status(404).json({ error: 'Escrow account not found' });
    }

    // Verify manager owns the escrow
    if (escrowAccount.manager_id.toString() !== managerProfile._id.toString()) {
      return res.status(403).json({ error: 'You can only fund your own escrow accounts' });
    }

    // Verify escrow is in correct status
    if (escrowAccount.status !== 'created') {
      return res.status(400).json({ error: 'Escrow account is not available for funding' });
    }

    // Calculate total amount including platform fee (in cents for Stripe)
    const totalAmountCents = Math.round((escrowAccount.total_amount + escrowAccount.platform_fee_amount) * 100);

    let paymentMethodToUse = payment_method_id;

    // If using saved card, get the payment method
    if (use_saved_card && !payment_method_id) {
      const defaultCard = await CustomerCard.findDefaultByUserId(req.user.id);
      if (defaultCard) {
        paymentMethodToUse = defaultCard.stripe_payment_method_id;
      } else {
        return res.status(400).json({ error: 'No saved payment method found' });
      }
    }

    // Create payment intent for funding
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmountCents,
      currency: escrowAccount.currency,
      customer: escrowAccount.stripe_customer_id,
      payment_method: paymentMethodToUse,
      confirmation_method: 'manual',
      confirm: true,
      setup_future_usage: save_payment_method ? 'on_session' : undefined,
      metadata: {
        escrow_id: escrowAccount._id.toString(),
        contract_id: contract_id.toString(),
        manager_id: req.user.id.toString(),
        type: 'escrow_funding'
      },
      return_url: `${process.env.FRONTEND_URL}/contracts/${contract_id}`
    });

    // Add transaction record
    await EscrowAccount.addTransaction(escrowAccount._id, {
      type: 'deposit',
      amount: totalAmountCents / 100,
      stripe_payment_intent_id: paymentIntent.id,
      status: 'pending',
      description: 'Escrow funding'
    });

    // Handle payment intent status
    if (paymentIntent.status === 'succeeded') {
      // Update escrow amounts
      await EscrowAccount.updateAmounts(escrowAccount._id, {
        held_amount: escrowAccount.total_amount,
        status: 'funded'
      });

      // Update transaction status
      const transactions = await EscrowAccount.findByContractId(contract_id);
      const pendingTransaction = transactions.transactions.find(t => 
        t.stripe_payment_intent_id === paymentIntent.id && t.status === 'pending'
      );
      
      if (pendingTransaction) {
        await EscrowAccount.updateTransactionStatus(
          escrowAccount._id, 
          pendingTransaction._id, 
          'completed'
        );
      }

      // Save payment method if requested
      if (save_payment_method && paymentIntent.payment_method) {
        const paymentMethod = await stripe.paymentMethods.retrieve(paymentIntent.payment_method);
        
        if (paymentMethod.type === 'card') {
          const userCards = await CustomerCard.findByUserId(req.user.id);
          const isFirstCard = userCards.length === 0;
          
          // Check if card already exists
          const existingCard = await CustomerCard.findByPaymentMethodId(paymentIntent.payment_method);
          if (!existingCard) {
            await CustomerCard.create({
              user_id: req.user.id,
              stripe_customer_id: escrowAccount.stripe_customer_id,
              stripe_payment_method_id: paymentIntent.payment_method,
              last_four: paymentMethod.card.last4,
              brand: paymentMethod.card.brand,
              exp_month: paymentMethod.card.exp_month,
              exp_year: paymentMethod.card.exp_year,
              is_default: isFirstCard
            });
          }
        }
      }

      // Notify talent that escrow is funded
      const contract = await Contract.findById(contract_id);
      const talentProfile = await TalentProfile.findById(contract.talent_id).populate('user_id');
      
      await Notification.create({
        user_id: talentProfile.user_id._id,
        type: 'escrow_funded',
        title: 'Escrow Account Funded',
        message: `The escrow account for "${contract.title}" has been funded. You can now begin work.`,
        data: {
          contract_id: contract_id,
          escrow_id: escrowAccount._id.toString()
        }
      });

      res.json({
        success: true,
        message: 'Escrow funded successfully',
        payment_intent: {
          id: paymentIntent.id,
          status: paymentIntent.status
        }
      });
    } else if (paymentIntent.status === 'requires_action') {
      res.json({
        success: false,
        requires_action: true,
        payment_intent: {
          id: paymentIntent.id,
          client_secret: paymentIntent.client_secret,
          status: paymentIntent.status
        }
      });
    } else {
      res.status(400).json({
        error: 'Payment failed',
        payment_intent: {
          id: paymentIntent.id,
          status: paymentIntent.status
        }
      });
    }

  } catch (error) {
    console.error('Escrow funding error:', error);
    res.status(500).json({
      error: 'Failed to fund escrow account',
      details: error.message
    });
  }
});

// Release funds to talent
router.post('/release', auth, [
  body('contract_id').isMongoId().withMessage('Valid contract ID is required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Release amount must be at least $0.01'),
  body('milestone_id').optional().isMongoId().withMessage('Milestone ID must be valid'),
  body('notes').optional().isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { contract_id, amount, milestone_id, notes } = req.body;
    
    // Get manager profile
    const managerProfile = await ManagerProfile.findByUserId(req.user.id);
    if (!managerProfile) {
      return res.status(403).json({ error: 'Only managers can release escrow funds' });
    }

    // Get escrow account
    const escrowAccount = await EscrowAccount.findByContractId(contract_id);
    if (!escrowAccount) {
      return res.status(404).json({ error: 'Escrow account not found' });
    }

    // Verify manager owns the escrow
    if (escrowAccount.manager_id.toString() !== managerProfile._id.toString()) {
      return res.status(403).json({ error: 'You can only release funds from your own escrow accounts' });
    }

    // Verify escrow is funded
    if (escrowAccount.status !== 'funded' && escrowAccount.status !== 'partial_release') {
      return res.status(400).json({ error: 'Escrow account must be funded to release funds' });
    }

    // Check available balance
    const availableBalance = escrowAccount.held_amount - escrowAccount.released_amount - escrowAccount.refunded_amount;
    if (amount > availableBalance) {
      return res.status(400).json({ 
        error: 'Insufficient funds in escrow',
        available_balance: availableBalance 
      });
    }

    // For now, we'll simulate the transfer (in a real implementation, you'd use Stripe Connect)
    // Create a transfer transaction record
    const transferAmount = amount * 100; // Convert to cents
    
    // Add transaction record
    await EscrowAccount.addTransaction(escrowAccount._id, {
      type: 'release',
      amount: amount,
      status: 'completed',
      description: `Fund release${milestone_id ? ' for milestone' : ''}${notes ? ': ' + notes : ''}`,
      milestone_id: milestone_id,
      processed_at: new Date()
    });

    // Update escrow amounts
    const newReleasedAmount = escrowAccount.released_amount + amount;
    const newStatus = newReleasedAmount >= escrowAccount.held_amount ? 'completed' : 'partial_release';
    
    await EscrowAccount.updateAmounts(escrowAccount._id, {
      released_amount: newReleasedAmount,
      status: newStatus
    });

    // If milestone-based, update milestone status
    if (milestone_id) {
      await Contract.updateMilestoneStatus(contract_id, milestone_id, 'paid');
    }

    // If fully released, update contract status
    if (newStatus === 'completed') {
      await Contract.updateStatus(contract_id, 'completed');
    }

    // Notify talent about fund release
    const contract = await Contract.findById(contract_id);
    const talentProfile = await TalentProfile.findById(contract.talent_id).populate('user_id');
    
    await Notification.create({
      user_id: talentProfile.user_id._id,
      type: 'funds_released',
      title: 'Funds Released',
      message: `$${amount.toFixed(2)} has been released from the escrow for "${contract.title}".`,
      data: {
        contract_id: contract_id,
        amount: amount,
        milestone_id: milestone_id
      }
    });

    res.json({
      success: true,
      message: 'Funds released successfully',
      released_amount: amount,
      remaining_balance: availableBalance - amount
    });

  } catch (error) {
    console.error('Escrow release error:', error);
    res.status(500).json({
      error: 'Failed to release escrow funds',
      details: error.message
    });
  }
});

// Get escrow account details
router.get('/contract/:contract_id', auth, [
  param('contract_id').isMongoId().withMessage('Valid contract ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { contract_id } = req.params;

    // Get escrow account
    const escrowAccount = await EscrowAccount.findByContractId(contract_id);
    if (!escrowAccount) {
      return res.status(404).json({ error: 'Escrow account not found' });
    }

    // Check user access
    const managerProfile = await ManagerProfile.findByUserId(req.user.id);
    const talentProfile = await TalentProfile.findByUserId(req.user.id);
    
    const hasAccess = (
      (managerProfile && escrowAccount.manager_id.toString() === managerProfile._id.toString()) ||
      (talentProfile && escrowAccount.talent_id.toString() === talentProfile._id.toString())
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Calculate available balance
    const availableBalance = escrowAccount.held_amount - escrowAccount.released_amount - escrowAccount.refunded_amount;

    res.json({
      escrow_account: {
        ...escrowAccount._doc,
        available_balance: availableBalance
      }
    });

  } catch (error) {
    console.error('Escrow retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve escrow account',
      details: error.message
    });
  }
});

// Get user's escrow accounts (manager or talent)
router.get('/', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status; // Optional status filter

    // Try to get manager profile first
    let managerProfile = null;
    let talentProfile = null;
    
    try {
      managerProfile = await ManagerProfile.findByUserId(req.user.id);
    } catch (err) {
      // User might not be a manager
    }
    
    if (!managerProfile) {
      try {
        talentProfile = await TalentProfile.findByUserId(req.user.id);
      } catch (err) {
        // User might not be a talent
      }
    }

    if (!managerProfile && !talentProfile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    let result;
    if (managerProfile) {
      result = await EscrowAccount.findByManagerId(managerProfile._id, page, limit);
    } else {
      result = await EscrowAccount.findByTalentId(talentProfile._id, page, limit);
    }

    // Apply status filter if provided
    if (status) {
      result.accounts = result.accounts.filter(account => account.status === status);
      result.total = result.accounts.length;
      result.totalPages = Math.ceil(result.total / limit);
    }

    // Add available balance to each account
    result.accounts = result.accounts.map(account => ({
      ...account,
      available_balance: account.held_amount - account.released_amount - account.refunded_amount
    }));

    res.json(result);

  } catch (error) {
    console.error('Escrow accounts retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve escrow accounts',
      details: error.message
    });
  }
});

module.exports = router;
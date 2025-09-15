const mongoose = require('mongoose');
const PaymentSettings = require('../models/PaymentSettings');
const CommissionSettings = require('../models/CommissionSettings');
const PaymentPackage = require('../models/PaymentPackage');
const TransactionLog = require('../models/TransactionLog');
const User = require('../models/User');

/**
 * Initialize the payment system with default settings and configurations
 * This should be run after deploying the new payment system
 */
async function initializePaymentSystem() {
  console.log('🚀 Initializing Payment System...');

  try {
    // Find or create admin user
    let adminUser = await User.findOne({ role: 'admin' });

    if (!adminUser) {
      console.log('⚠️ No admin user found. Please create an admin user first.');
      console.log('You can use the createAdminUser.js utility script.');
      return false;
    }

    console.log(`✅ Found admin user: ${adminUser.first_name} ${adminUser.last_name}`);

    // Initialize Payment Settings
    console.log('📋 Initializing payment settings...');
    await PaymentSettings.initializeDefaults(adminUser._id);
    console.log('✅ Payment settings initialized');

    // Initialize Commission Settings
    console.log('💰 Initializing commission settings...');
    await CommissionSettings.initializeDefaults(adminUser._id);
    console.log('✅ Commission settings initialized');

    // Create default packages
    console.log('📦 Creating default payment packages...');
    await createDefaultPackages(adminUser._id);
    console.log('✅ Default packages created');

    // Create initial transaction log entry
    console.log('📝 Creating system initialization log...');
    await TransactionLog.create({
      transaction_type: 'manual_adjustment',
      related_entity_type: 'system',
      related_entity_id: adminUser._id,
      user_id: adminUser._id,
      payment_details: {
        original_amount: 0,
        processed_amount: 0,
        net_amount: 0
      },
      status: 'completed',
      metadata: {
        description: 'Payment system initialized',
        admin_notes: 'System initialization completed successfully'
      }
    });
    console.log('✅ System initialization logged');

    console.log('🎉 Payment System initialization completed successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Review payment settings in the admin dashboard');
    console.log('2. Configure Stripe webhooks if not already done');
    console.log('3. Test payment flows in development environment');
    console.log('4. Monitor transaction logs for any issues');

    return true;

  } catch (error) {
    console.error('❌ Error initializing payment system:', error);
    throw error;
  }
}

/**
 * Create default payment packages for the platform
 */
async function createDefaultPackages(adminUserId) {
  const defaultPackages = [
    {
      name: 'Basic Job Posting',
      slug: 'basic-job-posting',
      description: 'Post a single job with basic features and 30-day visibility',
      package_type: 'job_posting',
      target_audience: 'manager',
      pricing: {
        base_price: 1, // $0.01 in cents
        currency: 'usd',
        billing_cycle: 'one_time'
      },
      features: [
        {
          feature_key: 'job_posts',
          feature_name: 'Job Posts',
          feature_value: 1,
          feature_description: '1 job posting'
        },
        {
          feature_key: 'extended_visibility',
          feature_name: 'Visibility Duration',
          feature_value: 30,
          feature_description: '30 days visibility'
        }
      ],
      availability: {
        is_active: true
      },
      metadata: {
        name: 'Basic Job Posting',
        description: 'Default package for basic job postings',
        created_by: adminUserId,
        priority: 1
      }
    },
    {
      name: 'Featured Job Posting',
      slug: 'featured-job-posting',
      description: 'Featured job posting with premium visibility and highlighting',
      package_type: 'featured_listing',
      target_audience: 'manager',
      pricing: {
        base_price: 500, // $5.00 in cents
        currency: 'usd',
        billing_cycle: 'one_time'
      },
      features: [
        {
          feature_key: 'job_posts',
          feature_name: 'Job Posts',
          feature_value: 1,
          feature_description: '1 featured job posting'
        },
        {
          feature_key: 'extended_visibility',
          feature_name: 'Visibility Duration',
          feature_value: 60,
          feature_description: '60 days visibility'
        },
        {
          feature_key: 'premium_badge',
          feature_name: 'Premium Badge',
          feature_value: true,
          feature_description: 'Premium job badge'
        }
      ],
      availability: {
        is_active: true
      },
      metadata: {
        name: 'Featured Job Posting',
        description: 'Premium featured job posting with enhanced visibility',
        created_by: adminUserId,
        priority: 2
      }
    },
    {
      name: 'Bulk Job Package - 5 Posts',
      slug: 'bulk-job-package-5',
      description: 'Package of 5 job postings with bulk discount',
      package_type: 'bulk_package',
      target_audience: 'manager',
      pricing: {
        base_price: 400, // $4.00 in cents (20% discount)
        currency: 'usd',
        billing_cycle: 'one_time'
      },
      features: [
        {
          feature_key: 'job_posts',
          feature_name: 'Job Posts',
          feature_value: 5,
          feature_description: '5 job postings'
        },
        {
          feature_key: 'bulk_posting',
          feature_name: 'Bulk Management',
          feature_value: true,
          feature_description: 'Bulk job management tools'
        }
      ],
      discount_rules: [
        {
          discount_type: 'percentage',
          discount_value: 20,
          min_quantity: 1
        }
      ],
      availability: {
        is_active: true
      },
      metadata: {
        name: 'Bulk Job Package - 5 Posts',
        description: 'Bulk package with 5 job postings at discounted rate',
        created_by: adminUserId,
        priority: 3
      }
    },
    {
      name: 'Enterprise Plan',
      slug: 'enterprise-plan',
      description: 'Enterprise-level access with unlimited postings and premium features',
      package_type: 'enterprise_plan',
      target_audience: 'manager',
      pricing: {
        base_price: 9900, // $99.00 in cents
        currency: 'usd',
        billing_cycle: 'monthly'
      },
      features: [
        {
          feature_key: 'job_posts',
          feature_name: 'Job Posts',
          feature_value: -1, // -1 indicates unlimited
          feature_description: 'Unlimited job postings'
        },
        {
          feature_key: 'featured_listings',
          feature_name: 'Featured Listings',
          feature_value: 10,
          feature_description: '10 featured listings per month'
        },
        {
          feature_key: 'priority_support',
          feature_name: 'Priority Support',
          feature_value: true,
          feature_description: '24/7 priority customer support'
        },
        {
          feature_key: 'analytics_dashboard',
          feature_name: 'Advanced Analytics',
          feature_value: true,
          feature_description: 'Advanced hiring analytics and reporting'
        },
        {
          feature_key: 'custom_branding',
          feature_name: 'Custom Branding',
          feature_value: true,
          feature_description: 'Custom company branding on job posts'
        }
      ],
      availability: {
        is_active: true
      },
      metadata: {
        name: 'Enterprise Plan',
        description: 'Comprehensive enterprise solution for large organizations',
        created_by: adminUserId,
        priority: 10
      }
    }
  ];

  for (const packageData of defaultPackages) {
    try {
      const existingPackage = await PaymentPackage.findOne({ slug: packageData.slug });
      if (!existingPackage) {
        await PaymentPackage.create(packageData);
        console.log(`  ✅ Created package: ${packageData.name}`);
      } else {
        console.log(`  ⏭️ Package already exists: ${packageData.name}`);
      }
    } catch (error) {
      console.error(`  ❌ Error creating package ${packageData.name}:`, error.message);
    }
  }
}

/**
 * Reset payment system (DANGER: This will remove all payment data)
 * Only use in development environments
 */
async function resetPaymentSystem() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Cannot reset payment system in production environment');
  }

  console.log('⚠️ RESETTING PAYMENT SYSTEM - THIS WILL DELETE ALL PAYMENT DATA');

  try {
    // Delete all payment-related collections
    await PaymentSettings.deleteMany({});
    await CommissionSettings.deleteMany({});
    await PaymentPackage.deleteMany({});
    await TransactionLog.deleteMany({});

    console.log('✅ Payment system reset completed');
    console.log('Run initializePaymentSystem() to reinitialize');

  } catch (error) {
    console.error('❌ Error resetting payment system:', error);
    throw error;
  }
}

/**
 * Check payment system health
 */
async function checkPaymentSystemHealth() {
  console.log('🏥 Checking Payment System Health...');

  try {
    // Check if collections exist and have data
    const settingsCount = await PaymentSettings.countDocuments();
    const commissionCount = await CommissionSettings.countDocuments();
    const packagesCount = await PaymentPackage.countDocuments();
    const transactionsCount = await TransactionLog.countDocuments();

    console.log('📊 Health Check Results:');
    console.log(`  Payment Settings: ${settingsCount} records`);
    console.log(`  Commission Settings: ${commissionCount} records`);
    console.log(`  Payment Packages: ${packagesCount} records`);
    console.log(`  Transaction Logs: ${transactionsCount} records`);

    // Check system status
    const systemStatus = await PaymentSettings.getSystemStatus();
    console.log(`  System Status: ${systemStatus.status}`);
    console.log(`  System Message: ${systemStatus.message}`);

    const healthScore = [
      settingsCount > 0,
      commissionCount > 0,
      packagesCount > 0,
      systemStatus.status !== 'unknown'
    ].filter(Boolean).length;

    console.log(`\n🏥 Health Score: ${healthScore}/4`);

    if (healthScore === 4) {
      console.log('✅ Payment system is healthy');
      return true;
    } else {
      console.log('⚠️ Payment system needs attention');
      if (settingsCount === 0) console.log('  - Initialize payment settings');
      if (commissionCount === 0) console.log('  - Initialize commission settings');
      if (packagesCount === 0) console.log('  - Create payment packages');
      return false;
    }

  } catch (error) {
    console.error('❌ Error checking payment system health:', error);
    return false;
  }
}

// CLI interface
if (require.main === module) {
  const command = process.argv[2];

  mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/dozyr')
    .then(async () => {
      console.log('📱 Connected to MongoDB');

      switch (command) {
        case 'init':
          await initializePaymentSystem();
          break;
        case 'reset':
          await resetPaymentSystem();
          break;
        case 'health':
          await checkPaymentSystemHealth();
          break;
        default:
          console.log('Usage:');
          console.log('  node initializePaymentSystem.js init    - Initialize payment system');
          console.log('  node initializePaymentSystem.js health  - Check system health');
          console.log('  node initializePaymentSystem.js reset   - Reset system (dev only)');
      }

      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Database connection error:', error);
      process.exit(1);
    });
}

module.exports = {
  initializePaymentSystem,
  resetPaymentSystem,
  checkPaymentSystemHealth,
  createDefaultPackages
};
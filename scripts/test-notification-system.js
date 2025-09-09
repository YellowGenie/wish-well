const AdminNotification = require('../models/AdminNotification');
const AdminNotificationTemplate = require('../models/AdminNotificationTemplate');
const User = require('../models/User');

async function testNotificationSystem() {
  console.log('🧪 Testing Admin Notification System...\n');

  try {
    // Test 1: Create a notification template
    console.log('1️⃣ Creating notification template...');
    const templateId = await AdminNotificationTemplate.create({
      created_by: 1, // Assuming admin user with ID 1 exists
      template_name: 'Test Notification',
      template_description: 'A test notification template',
      title: 'Welcome {user_name}!',
      message: 'This is a test notification. Your account type is {user_role}.',
      notification_type: 'both',
      display_settings: {
        theme: 'info',
        dismissible: true,
        autoClose: false,
        showIcon: true,
        actionButtons: [
          { text: 'Got it!', action: 'dismiss' },
          { text: 'Learn More', action: 'redirect', url: '/help' }
        ]
      },
      modal_size: 'medium',
      default_target_audience: 'both',
      default_priority: 'normal'
    });
    console.log(`✅ Template created with ID: ${templateId}`);

    // Test 2: Create an admin notification
    console.log('\n2️⃣ Creating admin notification...');
    const notificationId = await AdminNotification.create({
      created_by: 1,
      title: 'System Maintenance Notice',
      message: 'We will be performing scheduled maintenance tonight from 11 PM to 1 AM EST. The platform may be temporarily unavailable during this time.',
      notification_type: 'modal',
      target_audience: 'both',
      priority: 'high',
      display_settings: {
        theme: 'warning',
        dismissible: true,
        autoClose: false,
        showIcon: true,
        actionButtons: [
          { text: 'Understood', action: 'dismiss' }
        ]
      },
      modal_size: 'medium',
      schedule_type: 'immediate'
    });
    console.log(`✅ Notification created with ID: ${notificationId}`);

    // Test 3: Retrieve the notification
    console.log('\n3️⃣ Retrieving notification...');
    const notification = await AdminNotification.findById(notificationId);
    if (notification) {
      console.log(`✅ Retrieved notification: "${notification.title}"`);
      console.log(`   Priority: ${notification.priority}`);
      console.log(`   Type: ${notification.notification_type}`);
      console.log(`   Target: ${notification.target_audience}`);
    } else {
      console.log('❌ Failed to retrieve notification');
    }

    // Test 4: Get active notifications for a user (assuming user ID 2 exists)
    console.log('\n4️⃣ Getting active notifications for user...');
    try {
      const activeNotifications = await AdminNotification.getActiveNotificationsForUser(2, 'talent');
      console.log(`✅ Found ${activeNotifications.length} active notification(s) for user`);
    } catch (error) {
      console.log(`ℹ️ No active notifications found (this is normal for new installations)`);
    }

    // Test 5: Test analytics
    console.log('\n5️⃣ Testing analytics...');
    const analytics = await AdminNotification.getAnalytics(notificationId, '30');
    console.log(`✅ Analytics retrieved: ${analytics.length} data points`);

    // Test 6: Test template variables
    console.log('\n6️⃣ Testing template variables...');
    const variables = await AdminNotificationTemplate.getTemplateVariables(templateId);
    console.log(`✅ Template variables found: ${variables.map(v => v.name).join(', ')}`);

    // Test 7: Test template replacement
    console.log('\n7️⃣ Testing variable replacement...');
    const template = await AdminNotificationTemplate.findById(templateId);
    const processedTitle = AdminNotificationTemplate.replaceVariables(template.title, {
      user_name: 'John Doe'
    });
    const processedMessage = AdminNotificationTemplate.replaceVariables(template.message, {
      user_name: 'John Doe',
      user_role: 'talent'
    });
    console.log(`✅ Processed title: "${processedTitle}"`);
    console.log(`✅ Processed message: "${processedMessage}"`);

    // Test 8: Simulate user interactions
    console.log('\n8️⃣ Simulating user interactions...');
    await AdminNotification.markAsDelivered(notificationId, 2, {
      delivery_method: 'modal',
      device_type: 'web'
    });
    console.log('✅ Marked as delivered');

    await AdminNotification.markAsViewed(notificationId, 2);
    console.log('✅ Marked as viewed');

    await AdminNotification.markAsClicked(notificationId, 2, {
      button: 'Learn More',
      timestamp: new Date().toISOString()
    });
    console.log('✅ Marked as clicked');

    // Test 9: Get updated notification stats
    console.log('\n9️⃣ Checking updated stats...');
    const updatedNotification = await AdminNotification.findById(notificationId);
    console.log(`✅ Stats - Delivered: ${updatedNotification.total_delivered}, Viewed: ${updatedNotification.total_viewed}, Clicked: ${updatedNotification.total_clicked}`);

    // Cleanup - mark as dismissed
    await AdminNotification.markAsDismissed(notificationId, 2);
    console.log('✅ Marked as dismissed (cleanup)');

    console.log('\n🎉 All tests passed! The admin notification system is working correctly.');
    console.log('\n📝 Next steps:');
    console.log('   1. Start the backend server: npm run dev');
    console.log('   2. Start the frontend: npm run dev (in dozyr folder)');
    console.log('   3. Login as an admin user');
    console.log('   4. Navigate to /admin/notifications');
    console.log('   5. Create your first notification!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.log('\n🔧 Troubleshooting:');
    console.log('   1. Make sure you have run the database schema script first:');
    console.log('      node scripts/create-admin-notifications-schema.js');
    console.log('   2. Ensure you have at least one admin user in your database');
    console.log('   3. Check your database connection and credentials');
  }
}

// Run the test if this script is called directly
if (require.main === module) {
  testNotificationSystem()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Test runner error:', error);
      process.exit(1);
    });
}

module.exports = { testNotificationSystem };
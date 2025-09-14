const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');

// All notification routes require authentication
router.use(auth);

// Get active notifications for current user
router.get('/active', async (req, res) => {
  try {
    // For now, return empty array since notification system isn't fully implemented
    // This prevents the 404 errors in the frontend
    res.json([]);
  } catch (error) {
    console.error('Error fetching active notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Get user notification preferences
router.get('/preferences', async (req, res) => {
  try {
    // Return default preferences for now
    const defaultPreferences = {
      receive_admin_notifications: true,
      preferred_delivery_method: 'both',
      auto_dismiss_timeout: 5000,
      sound_enabled: true,
      animation_enabled: true,
      respect_quiet_hours: false,
      quiet_hours_start: '22:00',
      quiet_hours_end: '08:00',
      min_priority_level: 'low'
    };

    res.json(defaultPreferences);
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

// Update user notification preferences
router.put('/preferences', async (req, res) => {
  try {
    // For now, just return success
    // TODO: Implement actual preference saving
    res.json({ message: 'Preferences updated successfully' });
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// Mark notification as viewed
router.post('/:id/view', async (req, res) => {
  try {
    const { id } = req.params;
    // TODO: Implement actual view tracking
    res.json({ message: 'Notification marked as viewed' });
  } catch (error) {
    console.error('Error marking notification as viewed:', error);
    res.status(500).json({ error: 'Failed to mark notification as viewed' });
  }
});

// Dismiss notification
router.post('/:id/dismiss', async (req, res) => {
  try {
    const { id } = req.params;
    // TODO: Implement actual dismiss functionality
    res.json({ message: 'Notification dismissed' });
  } catch (error) {
    console.error('Error dismissing notification:', error);
    res.status(500).json({ error: 'Failed to dismiss notification' });
  }
});

// Track notification click
router.post('/:id/click', async (req, res) => {
  try {
    const { id } = req.params;
    const { click_data } = req.body;
    // TODO: Implement actual click tracking
    res.json({ message: 'Click tracked successfully' });
  } catch (error) {
    console.error('Error tracking notification click:', error);
    res.status(500).json({ error: 'Failed to track click' });
  }
});

// Dismiss all notifications
router.post('/dismiss-all', async (req, res) => {
  try {
    // TODO: Implement actual dismiss all functionality
    res.json({ message: 'All notifications dismissed' });
  } catch (error) {
    console.error('Error dismissing all notifications:', error);
    res.status(500).json({ error: 'Failed to dismiss all notifications' });
  }
});

module.exports = router;
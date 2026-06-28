const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../lib/asyncHandler');
const { getPreferences, savePreferences, getLogs, getFeed } = require('../lib/notificationService');

// Notification settings are user-owned data. Requiring auth at the router level
// prevents one user from reading or modifying another user's alert preferences.
router.use(requireAuth);

// GET /api/notifications/preferences
router.get('/preferences', asyncHandler(async (req, res) => {
  const prefs = await getPreferences(req.session.userId);
  res.json(prefs);
}));

// POST /api/notifications/preferences
router.post('/preferences', asyncHandler(async (req, res) => {
  const updated = await savePreferences(req.session.userId, req.body);
  res.json({ message: 'Preferences updated successfully.', preferences: updated });
}));

// GET /api/notifications/logs
router.get('/logs', asyncHandler(async (req, res) => {
  const logs = await getLogs(req.session.userId);
  res.json(logs);
}));

// GET /api/notifications/feed
router.get('/feed', asyncHandler(async (req, res) => {
  const feed = await getFeed(req.session.userId);
  res.json(feed);
}));

module.exports = router;

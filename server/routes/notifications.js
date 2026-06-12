const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../lib/asyncHandler');
const { getPreferences, savePreferences, getLogs } = require('../lib/notificationService');

router.use(requireAuth);

// GET /api/notifications/preferences
router.get('/preferences', asyncHandler(async (req, res) => {
  const prefs = getPreferences(req.session.userId);
  res.json(prefs);
}));

// POST /api/notifications/preferences
router.post('/preferences', asyncHandler(async (req, res) => {
  const updated = savePreferences(req.session.userId, req.body);
  res.json({ message: 'Preferences updated successfully.', preferences: updated });
}));

// GET /api/notifications/logs
router.get('/logs', asyncHandler(async (req, res) => {
  const logs = getLogs(req.session.userId);
  res.json(logs);
}));

module.exports = router;

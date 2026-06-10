// matches.js — item matching endpoint
//
// GET /api/matches/my-missing — returns potential found-item matches
// for each of the current user's approved missing item reports.
// Matching uses cached photo profiles
// and keyword/category fallback scoring.

const express = require('express');
const { readJSON } = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { findMatchesForMissingItems } = require('../lib/matcher');

const router = express.Router();

router.get('/my-missing', requireAuth, (req, res) => {
  const myMissing = readJSON('missing-items.json')
    .filter(i => i.submittedBy === req.session.userId && i.status === 'approved');

  const approvedFound = readJSON('items.json')
    .filter(i => i.status === 'approved');

  const matches = findMatchesForMissingItems(myMissing, approvedFound);
  res.json({ matches });
});

module.exports = router;

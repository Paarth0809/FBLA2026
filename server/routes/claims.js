// claims.js — Routes for ownership claims on found and missing items
//
// When a student thinks an item belongs to them, they submit a claim with a
// description proving ownership. The admin reviews it and approves or rejects it.
// If approved, both the claimer and the item submitter see each other's contact info.
//
// Authenticated routes (must be logged in):
//   DELETE /api/claims/mine/resolved  — remove approved/rejected claims from history
//   GET    /api/claims/mine           — claims submitted BY the current user
//   GET    /api/claims/received       — claims made ON items submitted by the current user
//   POST   /api/claims                — submit a new claim

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readJSON, writeJSON } = require('../lib/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// DELETE /api/claims/mine/resolved — remove approved or rejected claims from the user's view.
// This is defined first so "mine" is not confused for a claim ID in the POST route.
router.delete('/mine/resolved', requireAuth, (req, res) => {
  const resolved = ['approved', 'rejected'];
  const all  = readJSON('claims.json');
  // Filter out claims this user submitted that have already been decided
  const kept = all.filter(c => !(c.submittedBy === req.session.userId && resolved.includes(c.status)));
  writeJSON('claims.json', kept);
  res.json({ removed: all.length - kept.length });
});

// GET /api/claims/mine — all claims submitted BY the current user (the claimer's view).
// Each claim is enriched with the item's contactEmail so the claimer knows how to
// reach the finder once their claim is approved by the admin.
router.get('/mine', requireAuth, (req, res) => {
  const items   = readJSON('items.json');
  const missing = readJSON('missing-items.json');

  const claims = readJSON('claims.json')
    .filter(c => c.submittedBy === req.session.userId)
    .map(c => {
      // Look up the relevant item to get its contact email
      const source = c.itemType === 'found' ? items : missing;
      const item   = source.find(i => i.id === c.itemId);
      // Add itemContactEmail to the claim object — the frontend shows this
      // only when the admin has approved the claim
      return { ...c, itemContactEmail: item ? item.contactEmail : null };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json(claims);
});

// GET /api/claims/received — all claims made ON items submitted by the current user (the finder's view).
// Used on the My Submissions page to show the finder who is trying to claim their item.
router.get('/received', requireAuth, (req, res) => {
  const uid = req.session.userId;

  // Build sets of item IDs that belong to this user for quick lookup
  const myFoundIds   = new Set(readJSON('items.json')         .filter(i => i.submittedBy === uid).map(i => i.id));
  const myMissingIds = new Set(readJSON('missing-items.json') .filter(i => i.submittedBy === uid).map(i => i.id));

  // Return all claims that reference one of this user's items
  const claims = readJSON('claims.json')
    .filter(c => myFoundIds.has(c.itemId) || myMissingIds.has(c.itemId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json(claims);
});

// POST /api/claims — submit a new ownership claim on a found or missing item.
// itemType must be either "found" or "missing" to indicate which collection to look in.
router.post('/', requireAuth, (req, res) => {
  try {
    const { itemId, itemType, claimerName, claimerEmail, claimerPhone, description } = req.body;

    // Validate required fields (phone is optional)
    if (!itemId || !itemType || !claimerName || !claimerEmail || !description)
      return res.status(400).json({ error: 'All required fields must be filled in.' });

    // Look up the item name so the admin dashboard can display it without a second query
    let itemName = '';
    if (itemType === 'found') {
      const item = readJSON('items.json').find(i => i.id === itemId);
      if (!item) return res.status(404).json({ error: 'Item not found.' });
      itemName = item.itemName;
    } else if (itemType === 'missing') {
      const item = readJSON('missing-items.json').find(i => i.id === itemId);
      if (!item) return res.status(404).json({ error: 'Item not found.' });
      itemName = item.itemName;
    } else {
      return res.status(400).json({ error: 'itemType must be "found" or "missing".' });
    }

    const claim = {
      id:           uuidv4(),
      itemId,
      itemType,     // "found" or "missing" — tells us which JSON file to look in later
      itemName,     // stored here for convenience so admin can read it without another lookup
      claimerName:  claimerName.trim(),
      claimerEmail: claimerEmail.trim(),
      claimerPhone: (claimerPhone || '').trim(),  // optional field
      description:  description.trim(),           // the claimer's proof of ownership
      submittedBy:  req.session.userId,
      status:       'pending',  // starts pending until an admin approves or rejects
      createdAt:    new Date().toISOString()
    };

    const claims = readJSON('claims.json');
    claims.push(claim);
    writeJSON('claims.json', claims);

    res.json({ message: 'Claim submitted! The admin will be in touch soon.', claim });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;

// admin.js — Admin-only management routes
//
// Every route in this file is protected by requireAdmin middleware, which is
// applied once at the top with router.use(). Any non-admin request is rejected
// with a 403 before it reaches any individual route handler.
//
// Admins can:
//   - View all found items, missing items, and claims (including pending ones)
//   - Approve or reject any submission
//   - Delete any submission permanently
//   - Mark found items as claimed and approve claims (which auto-updates the item status)

const express = require('express');
const { readJSON, writeJSON } = require('../lib/db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Apply the admin check to every route in this file — no individual route
// needs to repeat it. Any logged-in non-admin gets a 403 Forbidden.
router.use(requireAdmin);

// ════════════════════════════════════════════════════════════════════
//  FOUND ITEMS
// ════════════════════════════════════════════════════════════════════

// GET /api/admin/items — return ALL found items (all statuses), newest first
router.get('/items', (req, res) => {
  const items = readJSON('items.json');
  items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(items);
});

// PUT /api/admin/items/:id/approve — publish a found item to the public board
router.put('/items/:id/approve', (req, res) => {
  const items = readJSON('items.json');
  const i = items.findIndex(x => x.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Item not found.' });
  items[i].status = 'approved';
  writeJSON('items.json', items);
  res.json(items[i]);
});

// PUT /api/admin/items/:id/reject — reject a found item submission
router.put('/items/:id/reject', (req, res) => {
  const items = readJSON('items.json');
  const i = items.findIndex(x => x.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Item not found.' });
  items[i].status = 'rejected';
  writeJSON('items.json', items);
  res.json(items[i]);
});

// PUT /api/admin/items/:id/mark-claimed — manually mark a found item as claimed
// (used when the admin handles a pickup directly without an online claim)
router.put('/items/:id/mark-claimed', (req, res) => {
  const items = readJSON('items.json');
  const i = items.findIndex(x => x.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Item not found.' });
  items[i].status = 'claimed';
  writeJSON('items.json', items);
  res.json(items[i]);
});

// DELETE /api/admin/items/:id — permanently remove a found item record
router.delete('/items/:id', (req, res) => {
  const items = readJSON('items.json');
  const i = items.findIndex(x => x.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Item not found.' });
  items.splice(i, 1);  // remove the item from the array in place
  writeJSON('items.json', items);
  res.json({ message: 'Deleted.' });
});

// ════════════════════════════════════════════════════════════════════
//  MISSING ITEMS
// ════════════════════════════════════════════════════════════════════

// GET /api/admin/missing-items — return ALL missing item reports
router.get('/missing-items', (req, res) => {
  const items = readJSON('missing-items.json');
  items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(items);
});

// PUT /api/admin/missing-items/:id/approve — publish a missing item report
router.put('/missing-items/:id/approve', (req, res) => {
  const items = readJSON('missing-items.json');
  const i = items.findIndex(x => x.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Item not found.' });
  items[i].status = 'approved';
  writeJSON('missing-items.json', items);
  res.json(items[i]);
});

// PUT /api/admin/missing-items/:id/reject — reject a missing item report
router.put('/missing-items/:id/reject', (req, res) => {
  const items = readJSON('missing-items.json');
  const i = items.findIndex(x => x.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Item not found.' });
  items[i].status = 'rejected';
  writeJSON('missing-items.json', items);
  res.json(items[i]);
});

// DELETE /api/admin/missing-items/:id — permanently remove a missing item report
router.delete('/missing-items/:id', (req, res) => {
  const items = readJSON('missing-items.json');
  const i = items.findIndex(x => x.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Item not found.' });
  items.splice(i, 1);
  writeJSON('missing-items.json', items);
  res.json({ message: 'Deleted.' });
});

// ════════════════════════════════════════════════════════════════════
//  CLAIMS
// ════════════════════════════════════════════════════════════════════

// GET /api/admin/claims — return all claims submitted by any user
router.get('/claims', (req, res) => {
  const claims = readJSON('claims.json');
  claims.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(claims);
});

// PUT /api/admin/claims/:id/approve — approve a claim and cascade the status to the item.
// When a claim is approved, the associated item is automatically updated:
//   - A found item becomes "claimed" (taken off the board)
//   - A missing item becomes "found" (also removed from the active board)
// This keeps the two data sources in sync without requiring a second API call.
router.put('/claims/:id/approve', (req, res) => {
  const claims = readJSON('claims.json');
  const i = claims.findIndex(c => c.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Claim not found.' });

  claims[i].status = 'approved';
  writeJSON('claims.json', claims);

  // Cascade: update the item's status to reflect that it's been resolved
  if (claims[i].itemType === 'found') {
    const items = readJSON('items.json');
    const j = items.findIndex(x => x.id === claims[i].itemId);
    if (j !== -1) { items[j].status = 'claimed'; writeJSON('items.json', items); }
  } else if (claims[i].itemType === 'missing') {
    const items = readJSON('missing-items.json');
    const j = items.findIndex(x => x.id === claims[i].itemId);
    if (j !== -1) { items[j].status = 'found'; writeJSON('missing-items.json', items); }
  }

  res.json(claims[i]);
});

// PUT /api/admin/claims/:id/reject — reject a claim (item stays on the board)
router.put('/claims/:id/reject', (req, res) => {
  const claims = readJSON('claims.json');
  const i = claims.findIndex(c => c.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Claim not found.' });
  claims[i].status = 'rejected';
  writeJSON('claims.json', claims);
  res.json(claims[i]);
});

// DELETE /api/admin/claims/:id — permanently remove a claim record
router.delete('/claims/:id', (req, res) => {
  const claims = readJSON('claims.json');
  const i = claims.findIndex(c => c.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Claim not found.' });
  claims.splice(i, 1);
  writeJSON('claims.json', claims);
  res.json({ message: 'Deleted.' });
});

module.exports = router;

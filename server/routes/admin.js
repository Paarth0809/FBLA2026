const express = require('express');
const { readJSON, writeJSON } = require('../lib/db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Every route in this file requires admin role
router.use(requireAdmin);

// ═══════════════════════════════════════════════════════════════
//  FOUND ITEMS
// ═══════════════════════════════════════════════════════════════

router.get('/items', (req, res) => {
  const items = readJSON('items.json');
  items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(items);
});

router.put('/items/:id/approve', (req, res) => {
  const items = readJSON('items.json');
  const i = items.findIndex(x => x.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Item not found.' });
  items[i].status = 'approved';
  writeJSON('items.json', items);
  res.json(items[i]);
});

router.put('/items/:id/reject', (req, res) => {
  const items = readJSON('items.json');
  const i = items.findIndex(x => x.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Item not found.' });
  items[i].status = 'rejected';
  writeJSON('items.json', items);
  res.json(items[i]);
});

router.put('/items/:id/mark-claimed', (req, res) => {
  const items = readJSON('items.json');
  const i = items.findIndex(x => x.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Item not found.' });
  items[i].status = 'claimed';
  writeJSON('items.json', items);
  res.json(items[i]);
});

router.delete('/items/:id', (req, res) => {
  const items = readJSON('items.json');
  const i = items.findIndex(x => x.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Item not found.' });
  items.splice(i, 1);
  writeJSON('items.json', items);
  res.json({ message: 'Deleted.' });
});

// ═══════════════════════════════════════════════════════════════
//  MISSING ITEMS
// ═══════════════════════════════════════════════════════════════

router.get('/missing-items', (req, res) => {
  const items = readJSON('missing-items.json');
  items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(items);
});

router.put('/missing-items/:id/approve', (req, res) => {
  const items = readJSON('missing-items.json');
  const i = items.findIndex(x => x.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Item not found.' });
  items[i].status = 'approved';
  writeJSON('missing-items.json', items);
  res.json(items[i]);
});

router.put('/missing-items/:id/reject', (req, res) => {
  const items = readJSON('missing-items.json');
  const i = items.findIndex(x => x.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Item not found.' });
  items[i].status = 'rejected';
  writeJSON('missing-items.json', items);
  res.json(items[i]);
});

router.delete('/missing-items/:id', (req, res) => {
  const items = readJSON('missing-items.json');
  const i = items.findIndex(x => x.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Item not found.' });
  items.splice(i, 1);
  writeJSON('missing-items.json', items);
  res.json({ message: 'Deleted.' });
});

// ═══════════════════════════════════════════════════════════════
//  CLAIMS
// ═══════════════════════════════════════════════════════════════

router.get('/claims', (req, res) => {
  const claims = readJSON('claims.json');
  claims.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(claims);
});

router.put('/claims/:id/approve', (req, res) => {
  const claims = readJSON('claims.json');
  const i = claims.findIndex(c => c.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Claim not found.' });
  claims[i].status = 'approved';
  writeJSON('claims.json', claims);

  // When a claim is approved, also mark the item as claimed/found
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

router.put('/claims/:id/reject', (req, res) => {
  const claims = readJSON('claims.json');
  const i = claims.findIndex(c => c.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Claim not found.' });
  claims[i].status = 'rejected';
  writeJSON('claims.json', claims);
  res.json(claims[i]);
});

router.delete('/claims/:id', (req, res) => {
  const claims = readJSON('claims.json');
  const i = claims.findIndex(c => c.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Claim not found.' });
  claims.splice(i, 1);
  writeJSON('claims.json', claims);
  res.json({ message: 'Deleted.' });
});

module.exports = router;

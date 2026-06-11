// missingItems.js — Routes for missing item reports
//
// Public routes (no login needed):
//   GET  /api/missing-items        — search approved missing item reports
//   GET  /api/missing-items/:id    — view a single missing item report
//
// Authenticated routes (must be logged in):
//   GET    /api/missing-items/mine              — reports submitted by the current user
//   DELETE /api/missing-items/mine/resolved     — clear found/rejected items from history
//   PUT    /api/missing-items/:id/mark-found    — owner marks their own report as resolved
//   POST   /api/missing-items                   — submit a new missing item report

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readJSON, writeJSON } = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { generateAndSave } = require('../lib/aiProfile');
const { upload, normalizeUploadedPhoto } = require('../lib/photoUpload');

const router = express.Router();

// GET /api/missing-items — list approved missing item reports.
// Supports ?keyword= and ?category= filters just like the found items endpoint.
router.get('/', (req, res) => {
  const { keyword, category } = req.query;
  let items = readJSON('missing-items.json').filter(i => i.status === 'approved');

  if (keyword) {
    const kw = keyword.toLowerCase();
    items = items.filter(i =>
      i.itemName.toLowerCase().includes(kw) ||
      i.description.toLowerCase().includes(kw) ||
      i.lastSeenLocation.toLowerCase().includes(kw)
    );
  }

  if (category && category !== 'All Categories')
    items = items.filter(i => i.category === category);

  items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(items);
});

// DELETE /api/missing-items/mine/resolved — remove found/rejected reports from the user's history.
// "found" means the owner marked it as found; "rejected" means the admin rejected it.
// Named routes like this MUST be defined before /:id to avoid Express treating
// the word "mine" as an ID parameter.
router.delete('/mine/resolved', requireAuth, (req, res) => {
  const resolved = ['found', 'rejected'];
  const all  = readJSON('missing-items.json');
  const kept = all.filter(i => !(i.submittedBy === req.session.userId && resolved.includes(i.status)));
  writeJSON('missing-items.json', kept);
  res.json({ removed: all.length - kept.length });
});

// GET /api/missing-items/mine — all missing item reports submitted by the current user.
router.get('/mine', requireAuth, (req, res) => {
  const items = readJSON('missing-items.json')
    .filter(i => i.submittedBy === req.session.userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(items);
});

// PUT /api/missing-items/:id/mark-found — the original reporter marks their item as found.
// Only the person who submitted the report can do this — not even the admin.
// This also must be defined before /:id so "mark-found" isn't matched as an ID.
router.put('/:id/mark-found', requireAuth, (req, res) => {
  const items = readJSON('missing-items.json');
  const i = items.findIndex(x => x.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Item not found.' });

  // Owner-only check: return 403 Forbidden if someone else tries to update it
  if (items[i].submittedBy !== req.session.userId)
    return res.status(403).json({ error: 'You can only update your own reports.' });

  items[i].status = 'found';
  writeJSON('missing-items.json', items);
  res.json(items[i]);
});

// GET /api/missing-items/:id — return a single missing item report.
// Pending and rejected items are only visible to the submitter or an admin.
router.get('/:id', (req, res) => {
  const item = readJSON('missing-items.json').find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found.' });

  // "approved" and "found" items are public
  if (item.status !== 'approved' && item.status !== 'found') {
    if (!req.session.userId) return res.status(404).json({ error: 'Item not found.' });
    if (req.session.userRole !== 'admin' && item.submittedBy !== req.session.userId)
      return res.status(404).json({ error: 'Item not found.' });
  }

  res.json(item);
});

// POST /api/missing-items — submit a new missing item report.
router.post('/', requireAuth, upload.single('photo'), async (req, res) => {
  try {
    await normalizeUploadedPhoto(req.file);
    const { itemName, category, description, lastSeenLocation, lastSeenDate, contactEmail } = req.body;

    if (!itemName || !category || !description || !lastSeenLocation || !lastSeenDate || !contactEmail)
      return res.status(400).json({ error: 'All fields are required.' });

    const user = readJSON('users.json').find(u => u.id === req.session.userId);

    const item = {
      id:               uuidv4(),
      itemName:         itemName.trim(),
      category,
      description:      description.trim(),
      lastSeenLocation: lastSeenLocation.trim(),
      lastSeenDate,
      contactEmail:     contactEmail.trim(),
      photo:            req.file ? req.file.filename : null,
      status:           'pending',   // starts hidden from the public until admin approves
      submittedBy:      req.session.userId,
      submitterName:    user ? user.name : 'Unknown',
      createdAt:        new Date().toISOString()
    };

    const items = readJSON('missing-items.json');
    items.push(item);
    writeJSON('missing-items.json', items);

    // Fire-and-forget: generate a photo profile when matching is enabled
    if (item.photo) generateAndSave(item.id, 'missing');

    res.json({ message: 'Missing item reported! An administrator will review it shortly.', item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// Catch Multer errors and return JSON instead of HTML
router.use((err, req, res, next) => {
  res.status(400).json({ error: err.message || 'File upload error.' });
});

module.exports = router;

// items.js — Routes for found item submissions
//
// Public routes (no login needed):
//   GET  /api/items          — search approved found items
//   GET  /api/items/:id      — view a single item
//
// Authenticated routes (must be logged in):
//   GET    /api/items/mine           — items submitted by the current user
//   DELETE /api/items/mine/resolved  — clear claimed/rejected items from history
//   POST   /api/items                — submit a new found item (with optional photo)

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');
const { readJSON, writeJSON } = require('../lib/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── Multer configuration for photo uploads ────────────────────────────────────
// Multer is middleware that handles multipart/form-data (file uploads).
// diskStorage lets us control where files are saved and what they're named.
const storage = multer.diskStorage({
  // Save all uploaded photos into the top-level uploads/ folder
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../uploads')),
  // Name each file with a UUID so filenames never collide, keeping the original extension
  filename:    (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },  // reject files larger than 5 MB
  fileFilter: (req, file, cb) => {
    // Only allow image files — reject PDFs, executables, etc.
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed.'));
  }
});

// GET /api/items — return all approved found items, with optional search filters.
// The ?keyword= and ?category= query parameters narrow down the results.
// This route is public — no login required to browse found items.
router.get('/', (req, res) => {
  const { keyword, category } = req.query;

  // Start with only approved items (pending and rejected stay hidden from the public)
  let items = readJSON('items.json').filter(i => i.status === 'approved');

  // Keyword search across item name, description, and location
  if (keyword) {
    const kw = keyword.toLowerCase();
    items = items.filter(i =>
      i.itemName.toLowerCase().includes(kw) ||
      i.description.toLowerCase().includes(kw) ||
      i.locationFound.toLowerCase().includes(kw)
    );
  }

  // Filter by category if one was specified (and it's not the "show all" value)
  if (category && category !== 'All Categories')
    items = items.filter(i => i.category === category);

  // Return newest items first
  items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(items);
});

// DELETE /api/items/mine/resolved — remove claimed or rejected items from the user's history.
// This route MUST come before /:id below, otherwise Express would try to
// match "mine" and "resolved" as item IDs and return 404.
router.delete('/mine/resolved', requireAuth, (req, res) => {
  const resolved = ['claimed', 'rejected'];
  const all  = readJSON('items.json');
  // Keep everything that is NOT (owned by this user AND has a resolved status)
  const kept = all.filter(i => !(i.submittedBy === req.session.userId && resolved.includes(i.status)));
  writeJSON('items.json', kept);
  res.json({ removed: all.length - kept.length });
});

// GET /api/items/mine — all found items the current user has submitted.
// Used by the My Submissions page to show status (pending / approved / claimed / rejected).
// This route MUST come before /:id for the same reason as the DELETE above.
router.get('/mine', requireAuth, (req, res) => {
  const items = readJSON('items.json')
    .filter(i => i.submittedBy === req.session.userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(items);
});

// GET /api/items/:id — return a single found item by its UUID.
// Non-approved items are hidden from the public — only the submitter or an admin can see them.
router.get('/:id', (req, res) => {
  const item = readJSON('items.json').find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found.' });

  // Allow approved and claimed items to be viewed by anyone
  if (item.status !== 'approved' && item.status !== 'claimed') {
    if (!req.session.userId) return res.status(404).json({ error: 'Item not found.' });
    if (req.session.userRole !== 'admin' && item.submittedBy !== req.session.userId)
      return res.status(404).json({ error: 'Item not found.' });
  }

  res.json(item);
});

// POST /api/items — submit a new found item report.
// upload.single('photo') runs Multer first to handle the file upload,
// then our handler runs with req.file populated (or null if no photo was attached).
router.post('/', requireAuth, upload.single('photo'), (req, res) => {
  try {
    const { itemName, category, description, locationFound, dateFound, contactEmail } = req.body;

    // All text fields are required — photo is optional
    if (!itemName || !category || !description || !locationFound || !dateFound || !contactEmail)
      return res.status(400).json({ error: 'All fields are required.' });

    // Look up the submitter's name so admins can see who submitted without a join
    const user = readJSON('users.json').find(u => u.id === req.session.userId);

    const item = {
      id:            uuidv4(),
      itemName:      itemName.trim(),
      category,
      description:   description.trim(),
      locationFound: locationFound.trim(),
      dateFound,
      contactEmail:  contactEmail.trim(),
      photo:         req.file ? req.file.filename : null, // filename is the UUID-named file in uploads/
      status:        'pending',            // all submissions start as pending until an admin approves
      submittedBy:   req.session.userId,
      submitterName: user ? user.name : 'Unknown',
      createdAt:     new Date().toISOString()
    };

    const items = readJSON('items.json');
    items.push(item);
    writeJSON('items.json', items);

    res.json({ message: 'Item submitted! An administrator will review it shortly.', item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// Error handler for Multer — catches file-too-large and wrong-type errors
// and returns a JSON response instead of Express's default HTML error page.
router.use((err, req, res, next) => {
  res.status(400).json({ error: err.message || 'File upload error.' });
});

module.exports = router;

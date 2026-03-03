const express = require('express');
const multer  = require('multer');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');
const { readJSON, writeJSON } = require('../lib/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../uploads')),
  filename:    (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed.'));
  }
});

// GET /api/missing-items
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

// GET /api/missing-items/:id
router.get('/:id', (req, res) => {
  const item = readJSON('missing-items.json').find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found.' });

  if (item.status !== 'approved' && item.status !== 'found') {
    if (!req.session.userId) return res.status(404).json({ error: 'Item not found.' });
    if (req.session.userRole !== 'admin' && item.submittedBy !== req.session.userId)
      return res.status(404).json({ error: 'Item not found.' });
  }

  res.json(item);
});

// POST /api/missing-items
router.post('/', requireAuth, upload.single('photo'), (req, res) => {
  try {
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
      status:           'pending',
      submittedBy:      req.session.userId,
      submitterName:    user ? user.name : 'Unknown',
      createdAt:        new Date().toISOString()
    };

    const items = readJSON('missing-items.json');
    items.push(item);
    writeJSON('missing-items.json', items);

    res.json({ message: 'Missing item reported! An administrator will review it shortly.', item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// Catch multer errors (file too large, wrong type) and return JSON instead of HTML
router.use((err, req, res, next) => {
  res.status(400).json({ error: err.message || 'File upload error.' });
});

module.exports = router;

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readJSON, writeJSON } = require('../lib/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/claims — submit a claim for a found OR missing item
router.post('/', requireAuth, (req, res) => {
  try {
    const { itemId, itemType, claimerName, claimerEmail, claimerPhone, description } = req.body;

    if (!itemId || !itemType || !claimerName || !claimerEmail || !description)
      return res.status(400).json({ error: 'All required fields must be filled in.' });

    // Look up the item name for reference in the admin dashboard
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
      itemType,
      itemName,
      claimerName:  claimerName.trim(),
      claimerEmail: claimerEmail.trim(),
      claimerPhone: (claimerPhone || '').trim(),
      description:  description.trim(),
      submittedBy:  req.session.userId,
      status:       'pending',
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

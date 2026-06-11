// messages.js — In-app messaging between finders and claimers
//
// Routes:
//   POST /api/messages        — send a message to another registered user
//   GET  /api/messages/inbox  — fetch messages received by the current user
//   GET  /api/messages/sent   — fetch messages sent by the current user
//
// All endpoints require a valid login session (requireAuth).
// Messages are stored in data/messages.json as a flat array.

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { readJSON, writeJSON } = require('../lib/db');
const { requireAuth } = require('../middleware/auth');

// Enforce authentication on every messaging endpoint.
router.use(requireAuth);

// ── POST /api/messages ──────────────────────────────────────────────────────
// Send a new message from the logged-in user to another registered user.
//
// Expected JSON body:
//   receiverEmail  {string?} — email of the recipient, or omitted when messaging
//                              the owner of a missing-item report
//   itemId         {string}  — UUID of the item this message is about
//   itemName       {string}  — human-readable item name (stored for display, max 200 chars)
//   content        {string}  — message body (5–1000 characters)
//   replyToId      {string?} — optional UUID of the parent message (for replies)
router.post('/', (req, res) => {
  const { receiverEmail, itemId, content, itemName, replyToId } = req.body;

  // ── Syntactic validation — are all required fields present and the right type? ──
  if (receiverEmail !== undefined && typeof receiverEmail !== 'string') {
    return res.status(400).json({ error: 'receiverEmail must be a string.' });
  }
  if (!itemId || typeof itemId !== 'string') {
    return res.status(400).json({ error: 'itemId is required.' });
  }
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'Message content is required.' });
  }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const hasExplicitReceiver = typeof receiverEmail === 'string' && receiverEmail.trim().length > 0;
  if (hasExplicitReceiver && !EMAIL_RE.test(receiverEmail.trim())) {
    return res.status(400).json({ error: 'receiverEmail is not a valid email address.' });
  }

  // ── Semantic validation — does the data make logical sense? ──────────────
  const trimmedContent = content.trim();
  if (trimmedContent.length === 0) {
    return res.status(400).json({ error: 'Message content cannot be blank.' });
  }
  if (trimmedContent.length < 5) {
    return res.status(400).json({ error: 'Message is too short — please write at least 5 characters.' });
  }
  if (trimmedContent.length > 1000) {
    return res.status(400).json({ error: 'Message cannot exceed 1000 characters.' });
  }

  // Resolve the sender's full record from their active session.
  const users = readJSON('users.json');
  const sender = users.find(u => u.id === req.session.userId);
  if (!sender) {
    return res.status(401).json({ error: 'Sender account not found. Please log in again.' });
  }

  // ── Item existence + relationship authorization ────────────────────────────
  // Load the item from the DB so we can (a) verify it exists, (b) derive the
  // canonical itemName from the DB rather than trusting the client-supplied
  // value, and (c) check that the sender is actually related to this item.
  const trimmedItemId = itemId.trim();
  const allFoundItems   = readJSON('items.json');
  const allMissingItems = readJSON('missing-items.json');
  const foundItem = allFoundItems.find(i => i.id === trimmedItemId);
  const missingItem = allMissingItems.find(i => i.id === trimmedItemId);
  const item = foundItem || missingItem;
  if (!item) {
    return res.status(403).json({ error: 'Cannot verify relationship to this item.' });
  }

  // Always use the item name from the database; ignore the client-supplied value.
  const resolvedItemName = item.itemName || '';

  let receiver = null;
  if (hasExplicitReceiver) {
    const normalizedReceiver = receiverEmail.trim().toLowerCase();
    receiver = users.find(u => u.email.toLowerCase() === normalizedReceiver);
    if (!receiver) {
      return res.status(404).json({
        error: 'No account found for that email address. The recipient must be a registered user.'
      });
    }
  } else if (missingItem) {
    receiver = users.find(u => u.id === missingItem.submittedBy);
    if (!receiver) {
      return res.status(404).json({ error: 'The owner account for this missing item no longer exists.' });
    }
  } else {
    return res.status(400).json({ error: 'receiverEmail is required for this message.' });
  }

  // Users cannot message themselves.
  if (sender.email.toLowerCase() === receiver.email.toLowerCase()) {
    return res.status(400).json({ error: 'You cannot send a message to yourself.' });
  }

  const allClaims   = readJSON('claims.json');
  const allMessages = readJSON('messages.json');

  // Sender is authorized if any of these relationships hold:
  // 1. Finder → approved claimer
  const isFinderToApprovedClaimer =
    item.submittedBy === sender.id &&
    allClaims.some(c =>
      c.itemId === trimmedItemId &&
      c.submittedBy === receiver.id &&
      c.status === 'approved'
    );
  // 2. Approved claimer → finder
  const isApprovedClaimerToFinder =
    item.submittedBy === receiver.id &&
    allClaims.some(c =>
      c.itemId === trimmedItemId &&
      c.submittedBy === sender.id &&
      c.status === 'approved'
    );
  // 3. Sender already has a message in this thread with the SAME receiver (reply participant)
  const isReplyParticipant =
    allMessages.some(m =>
      m.itemId === trimmedItemId && (
        (m.senderEmail === sender.email   && m.receiverEmail === receiver.email) ||
        (m.receiverEmail === sender.email && m.senderEmail   === receiver.email)
      )
    );
  // 4. Any logged-in user → missing-item owner (e.g. finder saying "I found your item")
  const isMissingItemContact = Boolean(missingItem) && item.submittedBy === receiver.id;

  if (!isFinderToApprovedClaimer && !isApprovedClaimerToFinder && !isReplyParticipant && !isMissingItemContact) {
    return res.status(403).json({
      error: 'You are not authorized to message this user about this item.'
    });
  }

  // If a replyToId is supplied, the parent must belong to the same item thread
  // and involve the same two users — prevents cross-thread reply spoofing.
  let validReplyToId = null;
  if (replyToId && typeof replyToId === 'string') {
    const parent = allMessages.find(m => m.id === replyToId);
    if (
      parent &&
      parent.itemId === trimmedItemId &&
      (
        (parent.senderEmail === sender.email   && parent.receiverEmail === receiver.email) ||
        (parent.senderEmail === receiver.email && parent.receiverEmail === sender.email)
      )
    ) {
      validReplyToId = replyToId;
    }
  }

  const newMessage = {
    id:            uuidv4(),
    senderEmail:   sender.email,              // canonical email from DB
    senderName:    sender.name,
    receiverEmail: receiver.email,            // canonical email from DB (not raw user input)
    receiverName:  receiver.name,
    itemId:        trimmedItemId,
    itemName:      resolvedItemName,          // always from DB, never from client
    content:       trimmedContent,
    replyToId:     validReplyToId,
    timestamp:     new Date().toISOString()
  };

  allMessages.push(newMessage);
  writeJSON('messages.json', allMessages);

  res.status(201).json(newMessage);
});

// ── DELETE /api/messages/:id ────────────────────────────────────────────────
// Permanently delete a message. Only the sender or receiver may delete it.
router.delete('/:id', (req, res) => {
  const users = readJSON('users.json');
  const currentUser = users.find(u => u.id === req.session.userId);
  if (!currentUser) {
    return res.status(401).json({ error: 'User account not found. Please log in again.' });
  }

  const messages = readJSON('messages.json');
  const idx = messages.findIndex(m => m.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Message not found.' });
  }

  const msg = messages[idx];
  const email = currentUser.email.toLowerCase();
  if (msg.senderEmail.toLowerCase() !== email && msg.receiverEmail.toLowerCase() !== email) {
    return res.status(403).json({ error: 'You are not authorized to delete this message.' });
  }

  messages.splice(idx, 1);
  writeJSON('messages.json', messages);
  res.json({ ok: true });
});

// ── GET /api/messages/inbox ─────────────────────────────────────────────────
// Returns every message addressed to the current user, sorted newest-first.
router.get('/inbox', (req, res) => {
  const users = readJSON('users.json');
  const currentUser = users.find(u => u.id === req.session.userId);
  if (!currentUser) {
    return res.status(401).json({ error: 'User account not found. Please log in again.' });
  }

  const messages = readJSON('messages.json');
  const inbox = messages
    .filter(m => m.receiverEmail.toLowerCase() === currentUser.email.toLowerCase())
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  res.json(inbox);
});

// ── GET /api/messages/sent ──────────────────────────────────────────────────
// Returns every message sent by the current user, sorted newest-first.
router.get('/sent', (req, res) => {
  const users = readJSON('users.json');
  const currentUser = users.find(u => u.id === req.session.userId);
  if (!currentUser) {
    return res.status(401).json({ error: 'User account not found. Please log in again.' });
  }

  const messages = readJSON('messages.json');
  const sent = messages
    .filter(m => m.senderEmail.toLowerCase() === currentUser.email.toLowerCase())
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  res.json(sent);
});

module.exports = router;

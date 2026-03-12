// auth.js — Authentication routes
// Handles account creation, login, logout, session inspection, and account deletion.

const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { readJSON, writeJSON } = require('../lib/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/signup — create a new student account
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate that all required fields were sent
    if (!name || !email || !password)
      return res.status(400).json({ error: 'Name, email, and password are required.' });

    // Enforce a minimum password length before hashing
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    const users = readJSON('users.json');

    // Prevent duplicate accounts — check case-insensitively
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase()))
      return res.status(400).json({ error: 'An account with this email already exists.' });

    const user = {
      id:           uuidv4(),               // globally unique ID for this user
      name:         name.trim(),
      email:        email.toLowerCase().trim(),
      // bcrypt.hash is async and uses a salt factor of 10 — strong enough for
      // production while staying fast during development and testing
      passwordHash: await bcrypt.hash(password, 10),
      role:         'user',                 // new accounts are always regular users
      createdAt:    new Date().toISOString()
    };

    users.push(user);
    writeJSON('users.json', users);

    // Auto-login: start a session immediately after signup so the user
    // doesn't have to log in again right after creating their account
    req.session.userId   = user.id;
    req.session.userRole = user.role;

    // Return the public-safe user object (never include passwordHash in responses)
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/auth/login — sign in with email and password
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required.' });

    const users = readJSON('users.json');

    // Find the user by email (case-insensitive)
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    // bcrypt.compare hashes the submitted password and checks it against the stored hash.
    // We combine the "user not found" and "wrong password" checks into a single 401 so
    // attackers can't tell which one failed (prevents user enumeration).
    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      return res.status(401).json({ error: 'Invalid email or password.' });

    // Store the user's ID and role in the session — this is what requireAuth checks
    req.session.userId   = user.id;
    req.session.userRole = user.role;

    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/auth/logout — destroy the session and clear the cookie
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ message: 'Logged out.' }));
});

// GET /api/auth/me — return the currently logged-in user's info
// Called by nav.js on every page load to check whether the user is signed in
// and to populate the navigation bar.
router.get('/me', (req, res) => {
  if (!req.session.userId)
    return res.status(401).json({ error: 'Not logged in.' });

  const user = readJSON('users.json').find(u => u.id === req.session.userId);
  if (!user)
    return res.status(401).json({ error: 'User not found.' });

  res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

// DELETE /api/auth/account — permanently delete the current user's account
// This removes the user record, all items and missing items they submitted,
// and all claims associated with those items or submitted by them.
// The session is destroyed immediately so they are logged out automatically.
router.delete('/account', requireAuth, (req, res) => {
  const uid = req.session.userId;

  // Collect item IDs before deleting so we can clean up claims that reference them
  const myItemIds    = new Set(readJSON('items.json')         .filter(i => i.submittedBy === uid).map(i => i.id));
  const myMissingIds = new Set(readJSON('missing-items.json') .filter(i => i.submittedBy === uid).map(i => i.id));

  // Remove the user record
  writeJSON('users.json',         readJSON('users.json')         .filter(u => u.id !== uid));

  // Remove all items and missing items this user submitted
  writeJSON('items.json',         readJSON('items.json')         .filter(i => i.submittedBy !== uid));
  writeJSON('missing-items.json', readJSON('missing-items.json') .filter(i => i.submittedBy !== uid));

  // Remove claims submitted BY this user AND claims made ON their items
  writeJSON('claims.json',        readJSON('claims.json')        .filter(c =>
    c.submittedBy !== uid &&
    !myItemIds.has(c.itemId) &&
    !myMissingIds.has(c.itemId)
  ));

  // End the session so the browser is logged out
  req.session.destroy(() => res.json({ message: 'Account deleted.' }));
});

module.exports = router;

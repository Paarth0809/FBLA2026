const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { readJSON, writeJSON } = require('../lib/db');

const router = express.Router();

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ error: 'Name, email, and password are required.' });

    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    const users = readJSON('users.json');
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase()))
      return res.status(400).json({ error: 'An account with this email already exists.' });

    const user = {
      id: uuidv4(),
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash: await bcrypt.hash(password, 10),
      role: 'user',
      createdAt: new Date().toISOString()
    };

    users.push(user);
    writeJSON('users.json', users);

    // Auto-login after signup
    req.session.userId   = user.id;
    req.session.userRole = user.role;

    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required.' });

    const users = readJSON('users.json');
    const user  = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      return res.status(401).json({ error: 'Invalid email or password.' });

    req.session.userId   = user.id;
    req.session.userRole = user.role;

    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ message: 'Logged out.' }));
});

// GET /api/auth/me  — returns current user or 401
router.get('/me', (req, res) => {
  if (!req.session.userId)
    return res.status(401).json({ error: 'Not logged in.' });

  const user = readJSON('users.json').find(u => u.id === req.session.userId);
  if (!user)
    return res.status(401).json({ error: 'User not found.' });

  res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

module.exports = router;

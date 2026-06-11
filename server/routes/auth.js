// auth.js — Authentication routes
// Handles account creation, login, logout, session inspection, and account deletion.

const express = require('express');
const bcrypt = require('bcryptjs');
const { Prisma } = require('@prisma/client');
const { prisma } = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../lib/asyncHandler');
const { userToApi } = require('../lib/modelMapper');

const router = express.Router();

function publicUser(user) {
  const apiUser = userToApi(user);
  if (!apiUser) return null;
  return { id: apiUser.id, name: apiUser.name, email: apiUser.email, role: apiUser.role };
}

function establishSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = user.id;
      req.session.userRole = publicUser(user).role;
      resolve();
    });
  });
}

// POST /api/auth/signup — create a new student account
router.post('/signup', asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password)
    return res.status(400).json({ error: 'Name, email, and password are required.' });

  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const normalizedEmail = email.toLowerCase().trim();
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
        role: 'USER',
        auditLogs: {
          create: {
            action: 'USER_SIGNED_UP',
            targetType: 'user',
            metadata: { email: normalizedEmail }
          }
        }
      }
    });

    await establishSession(req, user);
    res.json(publicUser(user));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }
    throw err;
  }
}));

// POST /api/auth/login — sign in with email and password
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required.' });

  const normalizedEmail = email.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (!user || !(await bcrypt.compare(password, user.passwordHash)))
    return res.status(401).json({ error: 'Invalid email or password.' });

  await establishSession(req, user);

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: 'USER_LOGGED_IN',
      targetType: 'user',
      targetId: user.id
    }
  }).catch(() => {});

  res.json(publicUser(user));
}));

// POST /api/auth/logout — destroy the session and clear the cookie
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('glhs.sid');
    res.json({ message: 'Logged out.' });
  });
});

// GET /api/auth/me — return the currently logged-in user's info
router.get('/me', asyncHandler(async (req, res) => {
  if (!req.session.userId)
    return res.status(401).json({ error: 'Not logged in.' });

  const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
  if (!user)
    return res.status(401).json({ error: 'User not found.' });

  res.json(publicUser(user));
}));

// DELETE /api/auth/account — permanently delete the current user's account.
router.delete('/account', requireAuth, asyncHandler(async (req, res) => {
  const uid = req.session.userId;

  await prisma.$transaction(async (tx) => {
    const myFound = await tx.foundItem.findMany({ where: { submittedById: uid }, select: { id: true } });
    const myMissing = await tx.missingItem.findMany({ where: { submittedById: uid }, select: { id: true } });
    const myFoundIds = myFound.map(item => item.id);
    const myMissingIds = myMissing.map(item => item.id);

    await tx.message.deleteMany({
      where: { OR: [{ senderId: uid }, { receiverId: uid }] }
    });

    await tx.claim.deleteMany({
      where: {
        OR: [
          { submittedById: uid },
          { itemType: 'FOUND', itemId: { in: myFoundIds } },
          { itemType: 'MISSING', itemId: { in: myMissingIds } }
        ]
      }
    });

    await tx.foundItem.deleteMany({ where: { submittedById: uid } });
    await tx.missingItem.deleteMany({ where: { submittedById: uid } });
    await tx.auditLog.create({
      data: {
        actorId: uid,
        action: 'ACCOUNT_DELETED',
        targetType: 'user',
        targetId: uid
      }
    }).catch(() => null);
    await tx.user.delete({ where: { id: uid } });
  });

  req.session.destroy(() => {
    res.clearCookie('glhs.sid');
    res.json({ message: 'Account deleted.' });
  });
}));

module.exports = router;

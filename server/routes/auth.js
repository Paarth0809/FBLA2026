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

const crypto = require('crypto');
const { dispatchEmail } = require('../lib/notificationService');

// In-memory token store: token -> { userId, expiresAt }
const resetTokens = new Map();

// POST /api/auth/forgot-password — generate token and email it to the user
router.post('/forgot-password', asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email address is required.' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  // To prevent user enumeration/probing, always return a success message even if the email doesn't exist
  if (!user) {
    return res.json({ message: 'If this email is registered, you will receive a password reset link shortly.' });
  }

  // Generate a cryptographically secure token
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 3600000; // 1 hour validity

  resetTokens.set(token, { userId: user.id, expiresAt });

  // Send the email
  const subject = 'Password Reset Request - Green Level Lost & Found';
  const body = `Hi ${user.name},

We received a request to reset your password for your Green Level Lost & Found account.

Click the link below to reset your password (valid for 1 hour):
http://localhost:3000/reset-password.html?token=${token}

If you did not request this reset, you can safely ignore this email.

Best regards,
Green Level Lost & Found`;

  await dispatchEmail(user.id, user.email, subject, body);

  res.json({ message: 'If this email is registered, you will receive a password reset link shortly.' });
}));

// POST /api/auth/reset-password — validate token and update password
router.post('/reset-password', asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ error: 'Token and new password are required.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const resetData = resetTokens.get(token);
  if (!resetData || resetData.expiresAt < Date.now()) {
    // Clean up if expired token is found
    if (resetData) resetTokens.delete(token);
    return res.status(400).json({ error: 'Invalid or expired password reset token.' });
  }

  const user = await prisma.user.findUnique({ where: { id: resetData.userId } });
  if (!user) {
    resetTokens.delete(token);
    return res.status(404).json({ error: 'User not found.' });
  }

  // Hash new password and save it
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash }
  });

  // Clean up the used token
  resetTokens.delete(token);

  res.json({ message: 'Password reset successfully!' });
}));

module.exports = router;

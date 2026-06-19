// routes/gatorbot.js — server-side website assistant endpoint

const express = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { asyncHandler } = require('../lib/asyncHandler');
const { answerGatorBot } = require('../lib/gatorbot');

const router = express.Router();

const chatSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  pagePath: z.string().trim().max(300).optional().default(''),
  pageTitle: z.string().trim().max(160).optional().default('')
});

async function getSessionUser(req) {
  const userId = req.session && req.session.userId;
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true }
  });
}

router.post('/chat', asyncHandler(async (req, res) => {
  const parsed = chatSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  const user = await getSessionUser(req);
  const response = await answerGatorBot({ ...parsed.data, user });
  res.json(response);
}));

module.exports = router;

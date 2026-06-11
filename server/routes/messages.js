// messages.js — In-app messaging between finders and claimers.

const express = require('express');
const router = express.Router();
const { prisma } = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../lib/asyncHandler');
const { messageToApi, messageIncludes } = require('../lib/modelMapper');

router.use(requireAuth);

router.post('/', asyncHandler(async (req, res) => {
  const { receiverEmail, itemId, content, replyToId } = req.body;

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

  const sender = await prisma.user.findUnique({ where: { id: req.session.userId } });
  if (!sender) {
    return res.status(401).json({ error: 'Sender account not found. Please log in again.' });
  }

  const trimmedItemId = itemId.trim();
  const foundItem = await prisma.foundItem.findUnique({ where: { id: trimmedItemId } });
  const missingItem = await prisma.missingItem.findUnique({ where: { id: trimmedItemId } });
  const item = foundItem || missingItem;
  if (!item) {
    return res.status(403).json({ error: 'Cannot verify relationship to this item.' });
  }

  let receiver = null;
  if (hasExplicitReceiver) {
    receiver = await prisma.user.findUnique({ where: { email: receiverEmail.trim().toLowerCase() } });
    if (!receiver) {
      return res.status(404).json({
        error: 'No account found for that email address. The recipient must be a registered user.'
      });
    }
  } else if (missingItem) {
    receiver = await prisma.user.findUnique({ where: { id: missingItem.submittedById } });
    if (!receiver) {
      return res.status(404).json({ error: 'The owner account for this missing item no longer exists.' });
    }
  } else {
    return res.status(400).json({ error: 'receiverEmail is required for this message.' });
  }

  if (sender.id === receiver.id) {
    return res.status(400).json({ error: 'You cannot send a message to yourself.' });
  }

  const approvedClaimBetweenUsers = await prisma.claim.findFirst({
    where: {
      itemId: trimmedItemId,
      status: 'APPROVED',
      OR: [
        { submittedById: receiver.id, ownerId: sender.id },
        { submittedById: sender.id, ownerId: receiver.id }
      ]
    }
  });

  const isFinderToApprovedClaimer =
    item.submittedById === sender.id && approvedClaimBetweenUsers?.submittedById === receiver.id;

  const isApprovedClaimerToFinder =
    item.submittedById === receiver.id && approvedClaimBetweenUsers?.submittedById === sender.id;

  const replyThread = await prisma.message.findFirst({
    where: {
      itemId: trimmedItemId,
      OR: [
        { senderId: sender.id, receiverId: receiver.id },
        { senderId: receiver.id, receiverId: sender.id }
      ]
    }
  });

  const isMissingItemContact = Boolean(missingItem) && item.submittedById === receiver.id;

  if (!isFinderToApprovedClaimer && !isApprovedClaimerToFinder && !replyThread && !isMissingItemContact) {
    return res.status(403).json({
      error: 'You are not authorized to message this user about this item.'
    });
  }

  let validReplyToId = null;
  if (replyToId && typeof replyToId === 'string') {
    const parent = await prisma.message.findUnique({ where: { id: replyToId } });
    if (
      parent &&
      parent.itemId === trimmedItemId &&
      (
        (parent.senderId === sender.id && parent.receiverId === receiver.id) ||
        (parent.senderId === receiver.id && parent.receiverId === sender.id)
      )
    ) {
      validReplyToId = replyToId;
    }
  }

  const record = await prisma.$transaction(async (tx) => {
    const msg = await tx.message.create({
      data: {
        senderId: sender.id,
        receiverId: receiver.id,
        itemId: trimmedItemId,
        itemType: foundItem ? 'FOUND' : 'MISSING',
        itemName: item.itemName || '',
        content: trimmedContent,
        replyToId: validReplyToId
      },
      include: messageIncludes
    });

    await tx.auditLog.create({
      data: {
        actorId: sender.id,
        action: 'MESSAGE_SENT',
        targetType: 'message',
        targetId: msg.id,
        metadata: { itemId: trimmedItemId }
      }
    });

    return msg;
  });

  res.status(201).json(messageToApi(record));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const msg = await prisma.message.findUnique({ where: { id: req.params.id } });
  if (!msg) {
    return res.status(404).json({ error: 'Message not found.' });
  }

  if (msg.senderId !== req.session.userId && msg.receiverId !== req.session.userId) {
    return res.status(403).json({ error: 'You are not authorized to delete this message.' });
  }

  await prisma.$transaction(async (tx) => {
    await tx.message.delete({ where: { id: req.params.id } });
    await tx.auditLog.create({
      data: {
        actorId: req.session.userId,
        action: 'MESSAGE_DELETED',
        targetType: 'message',
        targetId: req.params.id
      }
    });
  });

  res.json({ ok: true });
}));

router.get('/inbox', asyncHandler(async (req, res) => {
  const records = await prisma.message.findMany({
    where: { receiverId: req.session.userId },
    include: messageIncludes,
    orderBy: { createdAt: 'desc' }
  });
  res.json(records.map(messageToApi));
}));

router.get('/sent', asyncHandler(async (req, res) => {
  const records = await prisma.message.findMany({
    where: { senderId: req.session.userId },
    include: messageIncludes,
    orderBy: { createdAt: 'desc' }
  });
  res.json(records.map(messageToApi));
}));

module.exports = router;

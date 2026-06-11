// claims.js — Routes for ownership claims on found and missing items.

const express = require('express');
const { prisma } = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../lib/asyncHandler');
const { claimToApi, foundItemToApi, missingItemToApi, itemIncludes, claimIncludes } = require('../lib/modelMapper');

const router = express.Router();

router.delete('/mine/resolved', requireAuth, asyncHandler(async (req, res) => {
  const result = await prisma.claim.deleteMany({
    where: {
      submittedById: req.session.userId,
      status: { in: ['APPROVED', 'REJECTED'] }
    }
  });
  res.json({ removed: result.count });
}));

router.get('/mine', requireAuth, asyncHandler(async (req, res) => {
  const records = await prisma.claim.findMany({
    where: { submittedById: req.session.userId },
    include: claimIncludes,
    orderBy: { createdAt: 'desc' }
  });

  const claims = await Promise.all(records.map(async (record) => {
    const claim = claimToApi(record);
    if (claim.status !== 'approved') {
      return { ...claim, itemContactEmail: null, itemSubmitterEmail: null };
    }

    if (claim.itemType === 'found') {
      const item = await prisma.foundItem.findUnique({
        where: { id: claim.itemId },
        include: itemIncludes
      });
      return {
        ...claim,
        itemContactEmail: item?.contactEmailPrivate || null,
        itemSubmitterEmail: item?.submittedBy?.email || null
      };
    }

    const item = await prisma.missingItem.findUnique({
      where: { id: claim.itemId },
      include: itemIncludes
    });
    return {
      ...claim,
      itemContactEmail: item?.contactEmailPrivate || null,
      itemSubmitterEmail: item?.submittedBy?.email || null
    };
  }));

  res.json(claims);
}));

router.get('/received', requireAuth, asyncHandler(async (req, res) => {
  const uid = req.session.userId;
  const foundIds = (await prisma.foundItem.findMany({
    where: { submittedById: uid },
    select: { id: true }
  })).map(item => item.id);
  const missingIds = (await prisma.missingItem.findMany({
    where: { submittedById: uid },
    select: { id: true }
  })).map(item => item.id);

  const records = await prisma.claim.findMany({
    where: {
      OR: [
        { itemType: 'FOUND', itemId: { in: foundIds } },
        { itemType: 'MISSING', itemId: { in: missingIds } },
        { ownerId: uid }
      ]
    },
    include: claimIncludes,
    orderBy: { createdAt: 'desc' }
  });

  const claims = records.map(record => {
    const claim = claimToApi(record);
    if (claim.status === 'approved') {
      return { ...claim, claimerAccountEmail: record.submittedBy?.email || claim.claimerEmail };
    }
    return { ...claim, claimerAccountEmail: null };
  });

  res.json(claims);
}));

router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const { itemId, itemType, claimerName, claimerEmail, claimerPhone, description } = req.body;

  if (!itemId || !itemType || !claimerName || !claimerEmail || !description)
    return res.status(400).json({ error: 'All required fields must be filled in.' });

  let item = null;
  let normalizedType = null;
  if (itemType === 'found') {
    item = await prisma.foundItem.findUnique({ where: { id: itemId }, include: itemIncludes });
    normalizedType = 'FOUND';
  } else if (itemType === 'missing') {
    item = await prisma.missingItem.findUnique({ where: { id: itemId }, include: itemIncludes });
    normalizedType = 'MISSING';
  } else {
    return res.status(400).json({ error: 'itemType must be "found" or "missing".' });
  }

  if (!item) return res.status(404).json({ error: 'Item not found.' });

  const record = await prisma.$transaction(async (tx) => {
    const claim = await tx.claim.create({
      data: {
        itemId,
        itemType: normalizedType,
        itemName: item.itemName,
        claimerName: claimerName.trim(),
        claimerEmail: claimerEmail.trim(),
        claimerPhone: (claimerPhone || '').trim() || null,
        description: description.trim(),
        submittedById: req.session.userId,
        ownerId: item.submittedById,
        status: 'PENDING'
      },
      include: claimIncludes
    });

    await tx.auditLog.create({
      data: {
        actorId: req.session.userId,
        action: 'CLAIM_CREATED',
        targetType: 'claim',
        targetId: claim.id,
        metadata: { itemId, itemType }
      }
    });

    return claim;
  });

  res.json({ message: 'Claim submitted! The admin will be in touch soon.', claim: claimToApi(record) });
}));

module.exports = router;

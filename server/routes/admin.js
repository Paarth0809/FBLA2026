// admin.js — Admin-only management routes.

const express = require('express');
const { prisma } = require('../lib/prisma');
const { requireAdmin } = require('../middleware/auth');
const { generateAndSave } = require('../lib/aiProfile');
const { triggerAlert } = require('../lib/notificationService');
const { findMatchesForMissingItems } = require('../lib/matcher');
const { asyncHandler } = require('../lib/asyncHandler');
const {
  foundItemToApi,
  missingItemToApi,
  claimToApi,
  messageToApi,
  itemIncludes,
  claimIncludes,
  messageIncludes
} = require('../lib/modelMapper');

const router = express.Router();

router.use(requireAdmin);

router.get('/items', asyncHandler(async (req, res) => {
  const records = await prisma.foundItem.findMany({
    include: itemIncludes,
    orderBy: { createdAt: 'desc' }
  });
  res.json(records.map(foundItemToApi));
}));

router.put('/items/:id/approve', asyncHandler(async (req, res) => {
  const record = await prisma.$transaction(async (tx) => {
    const item = await tx.foundItem.update({
      where: { id: req.params.id },
      data: { status: 'APPROVED' },
      include: itemIncludes
    }).catch(() => null);
    if (!item) return null;
    await tx.auditLog.create({
      data: {
        actorId: req.session.userId,
        action: 'FOUND_ITEM_APPROVED',
        targetType: 'found_item',
        targetId: item.id
      }
    });
    return item;
  });
  if (!record) return res.status(404).json({ error: 'Item not found.' });

  const item = foundItemToApi(record);
  if (item.photo && !item.aiProfile) generateAndSave(item.id, 'found');

  // Trigger status alert for the reporter of the found item
  triggerAlert(item.submittedBy, 'STATUS', { itemType: 'found', itemName: item.itemName, status: 'APPROVED' });

  // Check for matches and alert missing item owners
  (async () => {
    try {
      const myMissingRecords = await prisma.missingItem.findMany({
        where: { status: 'APPROVED' },
        include: itemIncludes
      });
      const matches = findMatchesForMissingItems(
        myMissingRecords.map(missingItemToApi),
        [item]
      );
      for (const group of matches) {
        if (group.foundMatches.length > 0) {
          triggerAlert(group.missingItem.submittedBy, 'MATCH', {
            itemName: group.missingItem.itemName,
            matchName: item.itemName,
            category: item.category,
            locationFound: item.locationFound
          });
        }
      }
    } catch (err) {
      console.error('[Notification] Match check failed on found item approval:', err.message);
    }
  })();

  res.json(item);
}));

router.put('/items/:id/reject', asyncHandler(async (req, res) => {
  const record = await prisma.$transaction(async (tx) => {
    const item = await tx.foundItem.update({
      where: { id: req.params.id },
      data: { status: 'REJECTED' },
      include: itemIncludes
    }).catch(() => null);
    if (!item) return null;
    await tx.auditLog.create({
      data: {
        actorId: req.session.userId,
        action: 'FOUND_ITEM_REJECTED',
        targetType: 'found_item',
        targetId: item.id
      }
    });
    return item;
  });
  if (!record) return res.status(404).json({ error: 'Item not found.' });
  const item = foundItemToApi(record);
  triggerAlert(item.submittedBy, 'STATUS', { itemType: 'found', itemName: item.itemName, status: 'REJECTED' });
  res.json(item);
}));

router.put('/items/:id/mark-claimed', asyncHandler(async (req, res) => {
  const record = await prisma.$transaction(async (tx) => {
    const item = await tx.foundItem.update({
      where: { id: req.params.id },
      data: { status: 'CLAIMED' },
      include: itemIncludes
    }).catch(() => null);
    if (!item) return null;
    await tx.auditLog.create({
      data: {
        actorId: req.session.userId,
        action: 'FOUND_ITEM_MARKED_CLAIMED',
        targetType: 'found_item',
        targetId: item.id
      }
    });
    return item;
  });
  if (!record) return res.status(404).json({ error: 'Item not found.' });
  res.json(foundItemToApi(record));
}));

router.delete('/items/:id', asyncHandler(async (req, res) => {
  const existing = await prisma.foundItem.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Item not found.' });

  await prisma.$transaction(async (tx) => {
    await tx.claim.deleteMany({ where: { itemType: 'FOUND', itemId: req.params.id } });
    await tx.foundItem.delete({ where: { id: req.params.id } });
    await tx.auditLog.create({
      data: {
        actorId: req.session.userId,
        action: 'FOUND_ITEM_DELETED',
        targetType: 'found_item',
        targetId: req.params.id
      }
    });
  });

  res.json({ message: 'Deleted.' });
}));

router.get('/missing-items', asyncHandler(async (req, res) => {
  const records = await prisma.missingItem.findMany({
    include: itemIncludes,
    orderBy: { createdAt: 'desc' }
  });
  res.json(records.map(missingItemToApi));
}));

router.put('/missing-items/:id/approve', asyncHandler(async (req, res) => {
  const record = await prisma.$transaction(async (tx) => {
    const item = await tx.missingItem.update({
      where: { id: req.params.id },
      data: { status: 'APPROVED' },
      include: itemIncludes
    }).catch(() => null);
    if (!item) return null;
    await tx.auditLog.create({
      data: {
        actorId: req.session.userId,
        action: 'MISSING_ITEM_APPROVED',
        targetType: 'missing_item',
        targetId: item.id
      }
    });
    return item;
  });
  if (!record) return res.status(404).json({ error: 'Item not found.' });

  const item = missingItemToApi(record);
  if (item.photo && !item.aiProfile) generateAndSave(item.id, 'missing');

  // Trigger status alert for the reporter of the missing item
  triggerAlert(item.submittedBy, 'STATUS', { itemType: 'missing', itemName: item.itemName, status: 'APPROVED' });

  // Check for matches and alert the owner
  (async () => {
    try {
      const approvedFoundRecords = await prisma.foundItem.findMany({
        where: { status: 'APPROVED' },
        include: itemIncludes
      });
      const matches = findMatchesForMissingItems(
        [item],
        approvedFoundRecords.map(foundItemToApi)
      );
      for (const group of matches) {
        if (group.foundMatches.length > 0) {
          // Send a match alert with details of the best match
          const bestMatch = group.foundMatches[0].item;
          triggerAlert(item.submittedBy, 'MATCH', {
            itemName: item.itemName,
            matchName: bestMatch.itemName,
            category: bestMatch.category,
            locationFound: bestMatch.locationFound
          });
        }
      }
    } catch (err) {
      console.error('[Notification] Match check failed on missing item approval:', err.message);
    }
  })();

  res.json(item);
}));

router.put('/missing-items/:id/reject', asyncHandler(async (req, res) => {
  const record = await prisma.$transaction(async (tx) => {
    const item = await tx.missingItem.update({
      where: { id: req.params.id },
      data: { status: 'REJECTED' },
      include: itemIncludes
    }).catch(() => null);
    if (!item) return null;
    await tx.auditLog.create({
      data: {
        actorId: req.session.userId,
        action: 'MISSING_ITEM_REJECTED',
        targetType: 'missing_item',
        targetId: item.id
      }
    });
    return item;
  });
  if (!record) return res.status(404).json({ error: 'Item not found.' });
  const item = missingItemToApi(record);
  triggerAlert(item.submittedBy, 'STATUS', { itemType: 'missing', itemName: item.itemName, status: 'REJECTED' });
  res.json(item);
}));

router.delete('/missing-items/:id', asyncHandler(async (req, res) => {
  const existing = await prisma.missingItem.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Item not found.' });

  await prisma.$transaction(async (tx) => {
    await tx.claim.deleteMany({ where: { itemType: 'MISSING', itemId: req.params.id } });
    await tx.missingItem.delete({ where: { id: req.params.id } });
    await tx.auditLog.create({
      data: {
        actorId: req.session.userId,
        action: 'MISSING_ITEM_DELETED',
        targetType: 'missing_item',
        targetId: req.params.id
      }
    });
  });

  res.json({ message: 'Deleted.' });
}));

router.get('/claims', asyncHandler(async (req, res) => {
  const records = await prisma.claim.findMany({
    include: claimIncludes,
    orderBy: { createdAt: 'desc' }
  });
  res.json(records.map(claimToApi));
}));

router.put('/claims/:id/approve', asyncHandler(async (req, res) => {
  const result = await prisma.$transaction(async (tx) => {
    const claim = await tx.claim.findUnique({ where: { id: req.params.id } });
    if (!claim) return { kind: 'missing' };

    if (claim.itemType === 'FOUND') {
      const item = await tx.foundItem.findUnique({ where: { id: claim.itemId } });
      if (!item) return { kind: 'orphan' };
      await tx.foundItem.update({ where: { id: claim.itemId }, data: { status: 'CLAIMED' } });
    } else if (claim.itemType === 'MISSING') {
      const item = await tx.missingItem.findUnique({ where: { id: claim.itemId } });
      if (!item) return { kind: 'orphan' };
      await tx.missingItem.update({ where: { id: claim.itemId }, data: { status: 'FOUND' } });
    } else {
      return { kind: 'invalid' };
    }

    const updated = await tx.claim.update({
      where: { id: req.params.id },
      data: { status: 'APPROVED' },
      include: claimIncludes
    });

    await tx.auditLog.create({
      data: {
        actorId: req.session.userId,
        action: 'CLAIM_APPROVED',
        targetType: 'claim',
        targetId: updated.id,
        metadata: { itemId: updated.itemId, itemType: updated.itemType }
      }
    });

    return { kind: 'ok', claim: updated };
  });

  if (result.kind === 'missing') return res.status(404).json({ error: 'Claim not found.' });
  if (result.kind === 'orphan') return res.status(409).json({ error: 'Cannot approve claim because the related item no longer exists.' });
  if (result.kind === 'invalid') return res.status(400).json({ error: 'Claim has an invalid item type.' });

  const claim = claimToApi(result.claim);
  triggerAlert(claim.submittedBy, 'CLAIM_STATUS', { itemName: claim.itemName, status: 'APPROVED' });
  res.json(claim);
}));

router.put('/claims/:id/reject', asyncHandler(async (req, res) => {
  const record = await prisma.$transaction(async (tx) => {
    const claim = await tx.claim.update({
      where: { id: req.params.id },
      data: { status: 'REJECTED' },
      include: claimIncludes
    }).catch(() => null);
    if (!claim) return null;
    await tx.auditLog.create({
      data: {
        actorId: req.session.userId,
        action: 'CLAIM_REJECTED',
        targetType: 'claim',
        targetId: claim.id
      }
    });
    return claim;
  });
  if (!record) return res.status(404).json({ error: 'Claim not found.' });
  const claim = claimToApi(record);
  triggerAlert(claim.submittedBy, 'CLAIM_STATUS', { itemName: claim.itemName, status: 'REJECTED' });
  res.json(claim);
}));

router.delete('/claims/:id', asyncHandler(async (req, res) => {
  const existing = await prisma.claim.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Claim not found.' });

  await prisma.$transaction(async (tx) => {
    await tx.claim.delete({ where: { id: req.params.id } });
    await tx.auditLog.create({
      data: {
        actorId: req.session.userId,
        action: 'CLAIM_DELETED',
        targetType: 'claim',
        targetId: req.params.id
      }
    });
  });

  res.json({ message: 'Deleted.' });
}));

router.get('/messages', asyncHandler(async (req, res) => {
  const { itemId } = req.query;
  if (!itemId || typeof itemId !== 'string' || !itemId.trim()) {
    return res.status(400).json({ error: 'itemId query parameter is required.' });
  }
  const records = await prisma.message.findMany({
    where: { itemId: itemId.trim() },
    include: messageIncludes,
    orderBy: { createdAt: 'asc' }
  });
  res.json(records.map(messageToApi));
}));

module.exports = router;

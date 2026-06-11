// missingItems.js — Routes for missing item reports

const express = require('express');
const { prisma } = require('../lib/prisma');
const { requireAuth, getSessionUser } = require('../middleware/auth');
const { generateAndSave } = require('../lib/aiProfile');
const { upload, normalizeUploadedPhoto, uploadedAssetData } = require('../lib/photoUpload');
const { publicMissingItem } = require('../lib/dto');
const { asyncHandler } = require('../lib/asyncHandler');
const { missingItemToApi, itemIncludes, parseDateOnly } = require('../lib/modelMapper');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const { keyword, category } = req.query;
  const currentUser = await getSessionUser(req);
  const where = { status: 'APPROVED' };

  if (category && category !== 'All Categories') {
    where.category = String(category);
  }

  if (keyword) {
    const kw = String(keyword);
    where.OR = [
      { itemName: { contains: kw, mode: 'insensitive' } },
      { description: { contains: kw, mode: 'insensitive' } },
      { lastSeenLocation: { contains: kw, mode: 'insensitive' } }
    ];
  }

  const records = await prisma.missingItem.findMany({
    where,
    include: itemIncludes,
    orderBy: { createdAt: 'desc' }
  });

  res.json(records.map(missingItemToApi).map(item => publicMissingItem(item, currentUser)));
}));

router.delete('/mine/resolved', requireAuth, asyncHandler(async (req, res) => {
  const resolved = ['FOUND', 'REJECTED'];
  const items = await prisma.missingItem.findMany({
    where: { submittedById: req.session.userId, status: { in: resolved } },
    select: { id: true }
  });
  const ids = items.map(item => item.id);

  const result = await prisma.$transaction(async (tx) => {
    if (ids.length) {
      await tx.claim.deleteMany({ where: { itemType: 'MISSING', itemId: { in: ids } } });
    }
    return tx.missingItem.deleteMany({
      where: { submittedById: req.session.userId, status: { in: resolved } }
    });
  });

  res.json({ removed: result.count });
}));

router.get('/mine', requireAuth, asyncHandler(async (req, res) => {
  const records = await prisma.missingItem.findMany({
    where: { submittedById: req.session.userId },
    include: itemIncludes,
    orderBy: { createdAt: 'desc' }
  });
  res.json(records.map(missingItemToApi));
}));

router.put('/:id/mark-found', requireAuth, asyncHandler(async (req, res) => {
  const item = await prisma.missingItem.findUnique({
    where: { id: req.params.id },
    include: itemIncludes
  });
  if (!item) return res.status(404).json({ error: 'Item not found.' });

  if (item.submittedById !== req.session.userId)
    return res.status(403).json({ error: 'You can only update your own reports.' });

  const updated = await prisma.$transaction(async (tx) => {
    const record = await tx.missingItem.update({
      where: { id: req.params.id },
      data: { status: 'FOUND' },
      include: itemIncludes
    });
    await tx.auditLog.create({
      data: {
        actorId: req.session.userId,
        action: 'MISSING_ITEM_MARKED_FOUND',
        targetType: 'missing_item',
        targetId: req.params.id
      }
    });
    return record;
  });

  res.json(missingItemToApi(updated));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const currentUser = await getSessionUser(req);
  const record = await prisma.missingItem.findUnique({
    where: { id: req.params.id },
    include: itemIncludes
  });
  if (!record) return res.status(404).json({ error: 'Item not found.' });

  const item = missingItemToApi(record);
  if (item.status !== 'approved' && item.status !== 'found') {
    if (!req.session.userId) return res.status(404).json({ error: 'Item not found.' });
    if (currentUser?.role !== 'admin' && item.submittedBy !== req.session.userId)
      return res.status(404).json({ error: 'Item not found.' });
  }

  const isAdmin = currentUser?.role === 'admin';
  const isOwner = currentUser && item.submittedBy === currentUser.id;
  res.json(isAdmin || isOwner ? item : publicMissingItem(item, currentUser));
}));

router.post('/', requireAuth, upload.single('photo'), asyncHandler(async (req, res) => {
  await normalizeUploadedPhoto(req.file);
  const { itemName, category, description, lastSeenLocation, lastSeenDate, contactEmail } = req.body;

  if (!itemName || !category || !description || !lastSeenLocation || !lastSeenDate || !contactEmail)
    return res.status(400).json({ error: 'All fields are required.' });

  const user = req.user || await getSessionUser(req);
  const assetData = await uploadedAssetData(req.file, req.session.userId, 'MISSING_ITEM_PHOTO');

  const record = await prisma.$transaction(async (tx) => {
    let asset = null;
    if (assetData) {
      asset = await tx.uploadedAsset.create({ data: assetData });
    }

    const item = await tx.missingItem.create({
      data: {
        itemName: itemName.trim(),
        category,
        description: description.trim(),
        lastSeenLocation: lastSeenLocation.trim(),
        lastSeenDate: parseDateOnly(lastSeenDate),
        contactEmailPrivate: contactEmail.trim(),
        status: 'PENDING',
        submitterName: user ? user.name : 'Unknown',
        submittedById: req.session.userId,
        photoAssetId: asset ? asset.id : null
      },
      include: itemIncludes
    });

    await tx.auditLog.create({
      data: {
        actorId: req.session.userId,
        action: 'MISSING_ITEM_CREATED',
        targetType: 'missing_item',
        targetId: item.id
      }
    });

    return item;
  });

  const item = missingItemToApi(record);
  if (item.photo) generateAndSave(item.id, 'missing');

  res.json({
    message: 'Missing item reported! An administrator will review it shortly. Check My Submissions for updates and progress.',
    item
  });
}));

router.use((err, req, res, next) => {
  const message = err.message || 'File upload error.';
  const uploadError =
    err.name === 'MulterError' ||
    /only image files are allowed|file too large|heic conversion failed|unsupported image/i.test(message);

  if (!uploadError) return next(err);
  res.status(400).json({ error: message });
});

module.exports = router;

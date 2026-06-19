// items.js — Routes for found item submissions

const express = require('express');
const { prisma } = require('../lib/prisma');
const { requireAuth, getSessionUser } = require('../middleware/auth');
const { generateAndSave } = require('../lib/aiProfile');
const { upload, normalizeUploadedPhoto, uploadedAssetData } = require('../lib/photoUpload');
const { publicFoundItem } = require('../lib/dto');
const { asyncHandler } = require('../lib/asyncHandler');
const { foundItemToApi, itemIncludes, parseDateOnly } = require('../lib/modelMapper');

const router = express.Router();

function cleanOptional(value) {
  const text = String(value || '').trim();
  return text || null;
}

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function mapLocationData(body) {
  return {
    mapFloorId: cleanOptional(body.mapFloorId),
    mapRoomId: cleanOptional(body.mapRoomId),
    mapRoomNumber: cleanOptional(body.mapRoomNumber),
    mapPinX: parseOptionalNumber(body.mapPinX),
    mapPinZ: parseOptionalNumber(body.mapPinZ)
  };
}

function foundItemToMapPin(item) {
  return {
    id: item.id,
    itemName: item.itemName,
    category: item.category,
    description: item.description,
    locationFound: item.locationFound,
    dateFound: item.dateFound,
    photo: item.photo || null,
    status: item.status,
    submitterName: item.submitterName || 'Unknown',
    mapFloorId: item.mapFloorId || null,
    mapRoomId: item.mapRoomId || null,
    mapRoomNumber: item.mapRoomNumber || null,
    mapPinX: item.mapPinX ?? null,
    mapPinZ: item.mapPinZ ?? null,
    detailUrl: `/item.html?id=${item.id}`,
    claimUrl: `/claim.html?id=${item.id}&type=found`
  };
}

router.get('/', asyncHandler(async (req, res) => {
  const { keyword, category } = req.query;
  const where = { status: 'APPROVED' };

  if (category && category !== 'All Categories') {
    where.category = String(category);
  }

  if (keyword) {
    const kw = String(keyword);
    where.OR = [
      { itemName: { contains: kw, mode: 'insensitive' } },
      { description: { contains: kw, mode: 'insensitive' } },
      { locationFound: { contains: kw, mode: 'insensitive' } }
    ];
  }

  const records = await prisma.foundItem.findMany({
    where,
    include: itemIncludes,
    orderBy: { createdAt: 'desc' }
  });

  res.json(records.map(foundItemToApi).map(publicFoundItem));
}));

router.delete('/mine/resolved', requireAuth, asyncHandler(async (req, res) => {
  const resolved = ['CLAIMED', 'REJECTED'];
  const items = await prisma.foundItem.findMany({
    where: { submittedById: req.session.userId, status: { in: resolved } },
    select: { id: true }
  });
  const ids = items.map(item => item.id);

  const result = await prisma.$transaction(async (tx) => {
    if (ids.length) {
      await tx.claim.deleteMany({ where: { itemType: 'FOUND', itemId: { in: ids } } });
    }
    return tx.foundItem.deleteMany({
      where: { submittedById: req.session.userId, status: { in: resolved } }
    });
  });

  res.json({ removed: result.count });
}));

router.get('/mine', requireAuth, asyncHandler(async (req, res) => {
  const records = await prisma.foundItem.findMany({
    where: { submittedById: req.session.userId },
    include: itemIncludes,
    orderBy: { createdAt: 'desc' }
  });
  res.json(records.map(foundItemToApi));
}));

router.get('/map-pins', asyncHandler(async (req, res) => {
  const records = await prisma.foundItem.findMany({
    where: {
      status: 'APPROVED',
      mapFloorId: { not: null },
      mapRoomId: { not: null }
    },
    include: itemIncludes,
    orderBy: { createdAt: 'desc' },
    take: 250
  });

  res.json(records.map(foundItemToApi).map(foundItemToMapPin));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const currentUser = await getSessionUser(req);
  const record = await prisma.foundItem.findUnique({
    where: { id: req.params.id },
    include: itemIncludes
  });
  if (!record) return res.status(404).json({ error: 'Item not found.' });

  const item = foundItemToApi(record);
  if (item.status !== 'approved' && item.status !== 'claimed') {
    if (!req.session.userId) return res.status(404).json({ error: 'Item not found.' });
    if (currentUser?.role !== 'admin' && item.submittedBy !== req.session.userId)
      return res.status(404).json({ error: 'Item not found.' });
  }

  const isAdmin = currentUser?.role === 'admin';
  const isOwner = currentUser && item.submittedBy === currentUser.id;
  res.json(isAdmin || isOwner ? item : publicFoundItem(item));
}));

router.post('/', requireAuth, upload.single('photo'), asyncHandler(async (req, res) => {
  await normalizeUploadedPhoto(req.file);
  const { itemName, category, description, locationFound, dateFound, contactEmail } = req.body;

  if (!itemName || !category || !description || !locationFound || !dateFound || !contactEmail)
    return res.status(400).json({ error: 'All fields are required.' });

  const user = req.user || await getSessionUser(req);
  const assetData = await uploadedAssetData(req.file, req.session.userId, 'FOUND_ITEM_PHOTO');
  const mapFields = mapLocationData(req.body);

  const record = await prisma.$transaction(async (tx) => {
    let asset = null;
    if (assetData) {
      asset = await tx.uploadedAsset.create({ data: assetData });
    }

    const item = await tx.foundItem.create({
      data: {
        itemName: itemName.trim(),
        category,
        description: description.trim(),
        locationFound: locationFound.trim(),
        dateFound: parseDateOnly(dateFound),
        contactEmailPrivate: contactEmail.trim(),
        status: 'PENDING',
        submitterName: user ? user.name : 'Unknown',
        submittedById: req.session.userId,
        photoAssetId: asset ? asset.id : null,
        ...mapFields
      },
      include: itemIncludes
    });

    await tx.auditLog.create({
      data: {
        actorId: req.session.userId,
        action: 'FOUND_ITEM_CREATED',
        targetType: 'found_item',
        targetId: item.id
      }
    });

    return item;
  });

  const item = foundItemToApi(record);
  if (item.photo) generateAndSave(item.id, 'found');

  res.json({
    message: 'Item submitted! An administrator will review it shortly. Check My Submissions for updates and progress.',
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

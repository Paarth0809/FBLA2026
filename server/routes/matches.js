// matches.js — item matching endpoint

const express = require('express');
const { prisma } = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');
const { findMatchesForMissingItems } = require('../lib/matcher');
const { asyncHandler } = require('../lib/asyncHandler');
const { foundItemToApi, missingItemToApi, itemIncludes } = require('../lib/modelMapper');

const router = express.Router();

router.get('/my-missing', requireAuth, asyncHandler(async (req, res) => {
  const myMissingRecords = await prisma.missingItem.findMany({
    where: { submittedById: req.session.userId, status: 'APPROVED' },
    include: itemIncludes
  });

  const approvedFoundRecords = await prisma.foundItem.findMany({
    where: { status: 'APPROVED' },
    include: itemIncludes
  });

  const matches = findMatchesForMissingItems(
    myMissingRecords.map(missingItemToApi),
    approvedFoundRecords.map(foundItemToApi)
  );

  res.json({ matches });
}));

module.exports = router;

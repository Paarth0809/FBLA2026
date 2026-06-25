const path = require('path');
const fs = require('fs');
const { prisma } = require('../lib/prisma');

const uploadsDir = path.join(__dirname, '../../uploads');

module.exports = async function uploadProxy(req, res) {
  // Only serve generated image filenames. This avoids path traversal and keeps
  // private/local filesystem structure out of public routes.
  const filename = path.basename(req.params.filename || '');
  if (!/^[a-z0-9-]+\.(jpg|jpeg|png|gif|webp)$/i.test(filename)) {
    return res.status(404).send('Not found');
  }

  const asset = await prisma.uploadedAsset.findUnique({
    where: { storedName: filename },
    select: { publicUrl: true }
  }).catch(() => null);
  if (asset?.publicUrl) {
    // In production, the database can point to Vercel Blob while pages continue
    // to use the stable /uploads/:filename URL shape.
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.redirect(302, asset.publicUrl);
  }

  const filePath = path.join(uploadsDir, filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.sendFile(filePath);
};

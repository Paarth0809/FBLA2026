// Upload migration utility for deployment: copies local uploaded assets to Vercel Blob
// and records storage metadata without changing item ownership.
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { prisma } = require('../server/lib/prisma');

const uploadsDir = path.join(__dirname, '../uploads');
const dryRun = process.argv.includes('--dry-run');

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN is required to migrate local uploads to Vercel Blob.');
  }

  const { put } = await import('@vercel/blob');
  const assets = await prisma.uploadedAsset.findMany({
    where: {
      OR: [
        { storageProvider: 'local' },
        { publicUrl: null }
      ]
    },
    orderBy: { createdAt: 'asc' }
  });

  let migrated = 0;
  let skipped = 0;

  for (const asset of assets) {
    const localPath = path.join(uploadsDir, path.basename(asset.storedName));
    if (!fs.existsSync(localPath)) {
      skipped += 1;
      console.warn(`[skip] Missing local file for ${asset.storedName}`);
      continue;
    }

    const pathname = `uploads/${asset.storedName}`;
    const contentType = asset.contentType || asset.mimeType || 'application/octet-stream';
    console.log(`${dryRun ? '[dry-run]' : '[upload]'} ${asset.storedName} -> ${pathname}`);

    if (dryRun) {
      migrated += 1;
      continue;
    }

    const buffer = await fs.promises.readFile(localPath);
    const blob = await put(pathname, buffer, {
      access: 'public',
      contentType,
      addRandomSuffix: false
    });

    await prisma.uploadedAsset.update({
      where: { id: asset.id },
      data: {
        storageProvider: 'vercel-blob',
        storageKey: blob.pathname || pathname,
        publicUrl: blob.url,
        contentType
      }
    });

    migrated += 1;
  }

  console.log(`${dryRun ? 'Would migrate' : 'Migrated'} ${migrated} upload asset(s). Skipped ${skipped}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

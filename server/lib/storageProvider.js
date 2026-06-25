const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const uploadsDir = path.join(__dirname, '../../uploads');
const IMAGE_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp'
};

function activeStorageProvider() {
  // Local files are ideal for offline rehearsals; Vercel Blob is selected
  // automatically when deployment credentials are present.
  if (process.env.UPLOAD_STORAGE === 'vercel-blob' || process.env.BLOB_READ_WRITE_TOKEN) {
    return 'vercel-blob';
  }
  return 'local';
}

function safeExtension(originalName, contentType) {
  const fromName = path.extname(originalName || '').replace(/^\./, '').toLowerCase();
  if (/^(jpg|jpeg|png|gif|webp)$/.test(fromName)) return fromName === 'jpeg' ? 'jpg' : fromName;
  return IMAGE_EXTENSIONS[contentType] || 'jpg';
}

function makeStoredName(originalName, contentType) {
  return `${crypto.randomUUID()}.${safeExtension(originalName, contentType)}`;
}

async function putImage({ buffer, originalName, contentType }) {
  // The app stores generated filenames, never user-provided names, so uploaded
  // paths cannot escape the intended storage area.
  const storedName = makeStoredName(originalName, contentType);
  const provider = activeStorageProvider();

  if (provider === 'vercel-blob') {
    const { put } = await import('@vercel/blob');
    const blob = await put(`uploads/${storedName}`, buffer, {
      access: 'public',
      contentType,
      addRandomSuffix: false
    });
    return {
      provider,
      filename: storedName,
      storageKey: blob.pathname || `uploads/${storedName}`,
      publicUrl: blob.url
    };
  }

  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const filePath = path.join(uploadsDir, storedName);
  await fs.promises.writeFile(filePath, buffer);
  return {
    provider,
    filename: storedName,
    storageKey: storedName,
    publicUrl: null
  };
}

async function getImageBuffer(assetOrFilename) {
  // AI matching and image previews can read from either local disk or public
  // blob URLs through one small abstraction.
  const asset = typeof assetOrFilename === 'string'
    ? { storedName: assetOrFilename, storageProvider: 'local' }
    : assetOrFilename;
  if (!asset?.storedName) return null;

  if (asset.publicUrl) {
    const response = await fetch(asset.publicUrl);
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  }

  const filePath = path.join(uploadsDir, path.basename(asset.storedName));
  if (!fs.existsSync(filePath)) return null;
  return fs.promises.readFile(filePath);
}

async function deleteImage(asset) {
  // Account/item cleanup should remove the backing file when possible, but
  // deletion failures should not break the database transaction.
  if (!asset?.storedName) return;
  if (asset.storageProvider === 'vercel-blob' && asset.storageKey) {
    const { del } = await import('@vercel/blob');
    await del(asset.storageKey).catch(() => {});
    return;
  }
  const filePath = path.join(uploadsDir, path.basename(asset.storedName));
  await fs.promises.unlink(filePath).catch(() => {});
}

module.exports = {
  activeStorageProvider,
  putImage,
  getImageBuffer,
  deleteImage
};

const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const convertHeic = require('heic-convert');
const { putImage } = require('./storageProvider');

// Uploads stay in memory long enough to validate, convert HEIC, hash, and hand
// off to the configured storage provider. This keeps disk writes centralized.
const HEIC_EXTENSIONS = new Set(['.heic', '.heif']);

function isHeicFile(file) {
  if (!file) return false;
  const ext = path.extname(file.originalname || file.filename || '').toLowerCase();
  return HEIC_EXTENSIONS.has(ext) ||
    /image\/hei(c|f)/i.test(file.mimetype || '') ||
    /heic|heif/i.test(file.mimetype || '');
}

const upload = multer({
  // A 10 MB cap keeps judge-demo uploads realistic and prevents accidental
  // large files from overwhelming local or serverless memory.
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype?.startsWith('image/') || isHeicFile(file)) return cb(null, true);
    cb(new Error('Only image files are allowed. JPG, PNG, WEBP, GIF, and HEIC are supported.'));
  }
});

async function normalizeUploadedPhoto(file) {
  // iPhones often produce HEIC photos; converting at upload time makes previews
  // and matching work in browsers that only expect standard image formats.
  if (!file) return file;
  if (!file.buffer) throw new Error('Upload buffer was not available.');
  if (!isHeicFile(file)) return file;

  try {
    const outputBuffer = await convertHeic({
      buffer: file.buffer,
      format: 'JPEG',
      quality: 0.9
    });
    file.buffer = Buffer.from(outputBuffer);
    file.mimetype = 'image/jpeg';
    file.originalname = `${path.basename(file.originalname || 'upload', path.extname(file.originalname || ''))}.jpg`;
    file.size = file.buffer.length;
    return file;
  } catch (err) {
    throw new Error('HEIC conversion failed. Please try a JPEG or PNG photo.');
  }
}

async function uploadedAssetData(file, ownerId, purpose) {
  // UploadedAsset rows retain provenance and a content hash so reports, claims,
  // and migrations can reference files without trusting raw filenames.
  if (!file) return null;
  if (!file.buffer) throw new Error('Upload buffer was not available.');

  const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const stored = await putImage({
    buffer: file.buffer,
    originalName: file.originalname,
    contentType: file.mimetype || 'image/jpeg'
  });

  file.filename = stored.filename;
  file.storageProvider = stored.provider;
  file.storageKey = stored.storageKey;
  file.publicUrl = stored.publicUrl;

  return {
    ownerId,
    originalName: file.originalname || stored.filename,
    storedName: stored.filename,
    mimeType: file.mimetype || 'image/jpeg',
    contentType: file.mimetype || 'image/jpeg',
    sizeBytes: file.size || file.buffer.length,
    sha256,
    purpose,
    storageProvider: stored.provider,
    storageKey: stored.storageKey,
    publicUrl: stored.publicUrl
  };
}

module.exports = { upload, normalizeUploadedPhoto, isHeicFile, uploadedAssetData };

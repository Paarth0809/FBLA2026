const fs = require('fs');
const path = require('path');
const multer = require('multer');
const convertHeic = require('heic-convert');
const { v4: uuidv4 } = require('uuid');

const uploadsDir = path.join(__dirname, '../../uploads');
const HEIC_EXTENSIONS = new Set(['.heic', '.heif']);
const HEIC_MIME_TYPES = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']);

function isHeicFile(file) {
  if (!file) return false;
  const ext = path.extname(file.originalname || file.filename || '').toLowerCase();
  const mimetype = String(file.mimetype || '').toLowerCase();
  return HEIC_EXTENSIONS.has(ext) || HEIC_MIME_TYPES.has(mimetype);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mimetype = String(file.mimetype || '').toLowerCase();
    if (mimetype.startsWith('image/') || HEIC_EXTENSIONS.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed.'));
    }
  }
});

async function normalizeUploadedPhoto(file) {
  if (!file || !isHeicFile(file)) return file;

  const inputPath = file.path;
  const outputPath = path.join(path.dirname(inputPath), `${path.basename(inputPath, path.extname(inputPath))}.jpg`);
  try {
    const inputBuffer = await fs.promises.readFile(inputPath);
    const outputBuffer = await convertHeic({
      buffer: inputBuffer,
      format: 'JPEG',
      quality: 0.92
    });

    await fs.promises.writeFile(outputPath, Buffer.from(outputBuffer));
    await fs.promises.unlink(inputPath).catch(() => {});

    file.path = outputPath;
    file.filename = path.basename(outputPath);
    file.mimetype = 'image/jpeg';
    file.originalname = file.originalname.replace(/\.(heic|heif)$/i, '.jpg');
    file.size = outputBuffer.length;
    return file;
  } catch (err) {
    await fs.promises.unlink(inputPath).catch(() => {});
    throw new Error('That HEIC photo could not be converted. Try exporting it as JPG or PNG and upload it again.');
  }
}

module.exports = { upload, normalizeUploadedPhoto, isHeicFile };

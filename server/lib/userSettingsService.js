// userSettingsService.js — per-account UI preferences.

const { prisma } = require('./prisma');

const SUPPORTED_LANGUAGES = new Set([
  'en', 'es', 'zh', 'fr', 'de', 'vi', 'ar', 'ko', 'hi', 'gu',
  'tl', 'ru', 'ja', 'te', 'ta', 'ur', 'ne', 'mr', 'el'
]);

const DEFAULT_SETTINGS = {
  preferredLanguage: 'en',
  dyslexicFontEnabled: false
};

function normalizeSettings(input = {}) {
  const preferredLanguage = SUPPORTED_LANGUAGES.has(input.preferredLanguage)
    ? input.preferredLanguage
    : DEFAULT_SETTINGS.preferredLanguage;

  return {
    preferredLanguage,
    dyslexicFontEnabled: Boolean(input.dyslexicFontEnabled)
  };
}

async function getUserSettings(userId) {
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  return normalizeSettings(settings || DEFAULT_SETTINGS);
}

async function saveUserSettings(userId, patch = {}) {
  const existing = await getUserSettings(userId);
  const next = normalizeSettings({ ...existing, ...patch });

  const saved = await prisma.userSettings.upsert({
    where: { userId },
    create: {
      userId,
      preferredLanguage: next.preferredLanguage,
      dyslexicFontEnabled: next.dyslexicFontEnabled
    },
    update: {
      preferredLanguage: next.preferredLanguage,
      dyslexicFontEnabled: next.dyslexicFontEnabled
    }
  });

  return normalizeSettings(saved);
}

module.exports = {
  DEFAULT_SETTINGS,
  SUPPORTED_LANGUAGES,
  getUserSettings,
  saveUserSettings
};

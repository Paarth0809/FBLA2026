// Source-level checks for account portal translation coverage.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

const context = { window: {} };
vm.createContext(context);
vm.runInContext(read('public/js/translations.js'), context);

const translations = context.window.APP_TRANSLATIONS;
const portal = read('public/my-submissions.html');
const nav = read('public/js/nav.js');
const gatorbot = read('public/js/gatorbot.js');

const requiredPortalKeys = [
  'My Submissions',
  'Lost & Found',
  'Campus Map',
  'Track reports, claims, matches, alerts, and messages from one place.',
  'Settings',
  'Manage accessibility, language, and alert preferences for your account.',
  'Site Language',
  'Saved to your account and applied across the site.',
  'Reading Font',
  'Use dyslexia-friendly font',
  'Switches the site to the local OpenDyslexic font.',
  'Email Alerts',
  'Notification Email',
  'Notify me when:',
  'A potential match is detected',
  'My submission is approved/rejected',
  'I receive a chat message',
  'Save Settings',
  'Saving...',
  'Settings saved successfully!',
  'Failed to save settings.',
  'Signed in as',
  'Matches',
  'Messages',
  'Ask GatorBot',
  'Need help?',
  'Website assistant',
  'Open GatorBot assistant',
  'Close GatorBot assistant',
  'Suggested questions',
  'Ask about reports, claims, map pins...',
  'Send message',
  'Hi, I’m GatorBot. Ask me about searching, reports, claims, messages, submissions, or the campus map.'
];

for (const [lang, dictionary] of Object.entries(translations)) {
  for (const key of requiredPortalKeys) {
    assert(dictionary[key], `${lang} should include portal/settings key: ${key}`);
  }
}

assert(
  portal.includes("window.t(STATUS_HINT[item.status] || '')") &&
    portal.includes("window.t(CLAIM_HINT[claim.status] || '')"),
  'Student portal should translate dynamic status and claim hints when rendering rows.'
);

assert(
  portal.includes("window.t('Matches')") &&
    portal.includes("window.t('Messages')") &&
    !portal.includes("'Matches (' + total + ')'") &&
    !portal.includes("'Messages (' + merged.length + ')'"),
  'Dynamic tab count labels should use translated base labels.'
);

assert(
  portal.includes("window.t('Saving...')") &&
    portal.includes("window.t('Settings saved successfully!')") &&
    portal.includes("window.t('Failed to save settings.')") &&
    portal.includes("window.t('Save Settings')"),
  'Settings save states should use translation helpers.'
);

assert(
  nav.includes("t('Signed in as')"),
  'Authenticated nav footer should translate the Signed in as label.'
);

assert(
  nav.includes('window.getSupportedLanguages = (lang = getCurrentLanguage())') &&
    nav.includes('languageNames[lang] || languageNames.en'),
  'Supported language names should be exposed in the currently selected language.'
);

assert(
  portal.includes("document.addEventListener('languageChanged'") &&
    portal.includes('populateLanguageSettings(activeLanguage)'),
  'Student portal language selector should refresh its option labels after a language change.'
);

assert(
  gatorbot.includes("escapeHtml(t('Ask GatorBot'))") &&
    gatorbot.includes("escapeHtml(t('Need help?'))") &&
    gatorbot.includes("escapeHtml(t('Website assistant'))") &&
    gatorbot.includes("t('Open GatorBot assistant')") &&
    gatorbot.includes("t('Close GatorBot assistant')"),
  'GatorBot launcher and panel chrome should use translation helpers.'
);

assert(
  gatorbot.includes('function updateStaticLabels()') &&
    gatorbot.includes("document.addEventListener('languageChanged', updateStaticLabels)") &&
    gatorbot.includes("root.querySelector('.gatorbot-launcher-badge span:last-child').textContent = t('Ask GatorBot')"),
  'GatorBot should refresh launcher and panel labels when the site language changes.'
);

console.log('translation-coverage-source.test.js passed');

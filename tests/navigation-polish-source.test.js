const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function firstSidebar(source) {
  const match = source.match(/<aside class="student-sidebar[\s\S]*?<\/aside>/);
  return match ? match[0] : '';
}

function pageHeader(source) {
  const match = source.match(/<!-- Page header -->[\s\S]*?<section class="stats-row"/);
  return match ? match[0] : '';
}

const nav = read('public/js/nav.js');
const reportFound = read('public/report.html');
const reportMissing = read('public/report-missing.html');
const missingDetail = read('public/missing-item.html');
const submissions = read('public/my-submissions.html');
const claim = read('public/claim.html');
const admin = read('public/admin.html');
const gatorbot = read('server/lib/gatorbot.js');
const gatorbotWidget = read('public/js/gatorbot.js');
const knowledge = read('server/knowledge/gatorbot-knowledge.md');
const css = read('public/css/style.css');

assert(
  nav.includes('normalizePrimaryNavigation') && nav.includes('nav-report-menu'),
  'shared nav should normalize report links into a single Report Item menu'
);

assert(
  nav.includes('const showReportMenu = !isAdminUser();') &&
    nav.includes('${showReportMenu ? `') &&
    nav.includes('` : \'\'}') &&
    nav.includes('<a href="/map.html" class="${primaryNavLinkClasses(isMapActive)}">Campus Map</a>'),
  'shared nav should hide student report actions for admins while keeping Campus Map visible'
);

assert(
  nav.includes('/admin.html?tab=settings') && nav.includes('/my-submissions.html?tab=settings'),
  'settings links should split between admin and student destinations'
);

assert(
  reportFound.includes('report-mode-toggle') && reportFound.includes('/report-missing.html'),
  'found report page should expose a Found/Missing report toggle'
);

assert(
  reportMissing.includes('report-mode-toggle') && reportMissing.includes('/report.html'),
  'missing report page should expose a Found/Missing report toggle'
);

assert(
  missingDetail.includes('glhsFoundReportPrefill') && missingDetail.includes('data-found-from-missing'),
  'missing item detail should store safe found-report prefill data'
);

assert(
  reportFound.includes('missing-prefill-notice') && reportFound.includes('applyMissingItemPrefill'),
  'found report page should apply and disclose missing-item prefill data'
);

assert(
  firstSidebar(submissions).includes('Report Found Item') &&
    firstSidebar(submissions).includes('Report Missing Item') &&
    firstSidebar(submissions).includes('Browse Found Items') &&
    firstSidebar(submissions).includes('Browse Missing Items') &&
    firstSidebar(submissions).includes('href="/map.html"') &&
    firstSidebar(submissions).includes('Campus Map') &&
    firstSidebar(claim).includes('href="/map.html"') &&
    firstSidebar(claim).includes('Campus Map'),
  'student portal pages should expose Campus Map from the sidebar alongside report and browse links.'
);

assert(
  !pageHeader(submissions).includes('href="/report.html"') &&
    !pageHeader(submissions).includes('href="/report-missing.html"') &&
    !pageHeader(submissions).includes('href="/map.html"'),
  'My Submissions page header should not duplicate report or campus map sidebar actions.'
);

assert(
  admin.includes('<div class="eyebrow mb-2">Admin Portal</div>') &&
    admin.includes('class="stats-row"') &&
    admin.includes('class="stat-card"') &&
    admin.includes('href="/map.html"') &&
    admin.includes('Campus Map') &&
    !admin.includes('bg-inverse-surface fixed left-0 top-0 bottom-0') &&
    !admin.includes('class="admin-stat"'),
  'admin dashboard should use the light student-style portal shell and shared stat cards'
);

assert(
  !/\.admin-sidebar\s*\{[^}]*inverse/s.test(css) &&
    !/\.admin-sidebar\s*\{[^}]*#1c241f/s.test(css),
  'admin sidebar should not have a dark-only CSS override'
);

assert(
  admin.includes("onclick=\"foundAction('${item.id}','approve')\"") &&
    admin.includes("onclick=\"missingAction('${item.id}','approve')\"") &&
    admin.includes("onclick=\"claimAction('${claim.id}','approve')\""),
  'admin dashboard should preserve approval actions for found, missing, and claim rows'
);

assert(
  gatorbot.includes('reportItem') &&
    gatorbot.includes('studentSettings') &&
    gatorbot.includes('adminSettings') &&
    gatorbot.includes('adminPortal'),
  'GatorBot should expose canonical role-aware actions'
);

assert(
  knowledge.includes('Report Item') && knowledge.includes('admin settings'),
  'GatorBot knowledge should explain the new report menu and settings split'
);

assert(
  gatorbot.includes('scrubInternalRoutes') &&
    gatorbot.includes('Do not print raw internal routes') &&
    !gatorbot.includes('Core pages are designed to run locally for a judge demo.'),
  'GatorBot should avoid raw route text and local-demo wording in normal live-site answers'
);

assert(
  gatorbotWidget.includes('const hasActions = Array.isArray(data.actions) && data.actions.length > 0;') &&
    gatorbotWidget.includes('renderQuickReplies(hasActions ? [] : data.quickReplies || []);'),
  'GatorBot should hide bottom quick-reply chips when the answer already has action buttons.'
);

assert(
  submissions.includes("switchTab('notifications', this)") &&
    submissions.includes('id="notifications-tab-btn"') &&
    submissions.includes('aria-controls="tab-notifications"') &&
    submissions.includes('<span class="material-symbols-outlined">mail</span> Notifications') &&
    submissions.includes('id="notifications-content"'),
  'student portal should include a Notifications tab with an envelope icon and content mount.'
);

assert(
  submissions.includes("switchTab('messages', this)") &&
    /id="messages-tab-btn"[^>]*><span class="material-symbols-outlined">(person|account_circle|supervisor_account)<\/span> Messages/.test(submissions),
  'Messages tab should use a person-style icon so it is visually distinct from Notifications.'
);

assert(
  submissions.includes("api.get('/notifications/feed')") &&
    submissions.includes('function normalizeNotificationFeed') &&
    submissions.includes('Array.isArray(rawFeed)') &&
    submissions.includes('Array.isArray(rawFeed.feed)') &&
    submissions.includes('function renderNotifications') &&
    submissions.includes('No notifications yet') &&
    submissions.includes('System alerts for matches, approvals, and claims will appear here.'),
  'student portal should load, normalize, and render a notification feed separate from messages.'
);

assert(
  /\.gatorbot-quick:empty\s*\{[^}]*display:\s*none/s.test(css),
  'Empty GatorBot quick-reply containers should not leave awkward spacing.'
);

assert(
  nav.includes('lang-switcher-icon') &&
    nav.includes('background: rgba(0, 108, 73, 0.10);') &&
    nav.includes('color: var(--primary, #006c49);') &&
    !nav.includes('lang-switcher-icon {\\n      color: rgba(255, 255, 255'),
  'Language switcher globe icon should have a readable green treatment instead of low-contrast white.'
);

console.log('navigation-polish-source.test.js passed');

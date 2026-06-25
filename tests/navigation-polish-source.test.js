const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const nav = read('public/js/nav.js');
const reportFound = read('public/report.html');
const reportMissing = read('public/report-missing.html');
const missingDetail = read('public/missing-item.html');
const submissions = read('public/my-submissions.html');
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
  submissions.includes('/map.html') && submissions.includes('Campus Map'),
  'student portal should include a Campus Map quick action'
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
  /\.gatorbot-quick:empty\s*\{[^}]*display:\s*none/s.test(css),
  'Empty GatorBot quick-reply containers should not leave awkward spacing.'
);

console.log('navigation-polish-source.test.js passed');

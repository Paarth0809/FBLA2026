// Source-level tests for judge-demo report autofill and image presentation.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function firstStudentSidebar(source) {
  const match = source.match(/<aside class="student-sidebar[\s\S]*?<\/aside>/);
  return match ? match[0] : '';
}

function claimHeader(source) {
  const match = source.match(/<a href="#" id="back-link"[\s\S]*?<div id="auth-required"/);
  return match ? match[0] : '';
}

const foundReport = read('public/report.html');
const missingReport = read('public/report-missing.html');
const claimPage = read('public/claim.html');
const picker = read('public/js/report-map-picker.js');
const search = read('public/search.html');
const searchMissing = read('public/search-missing.html');
const itemDetail = read('public/item.html');
const missingDetail = read('public/missing-item.html');
const css = read('public/css/style.css');

for (const [name, source] of [
  ['found report', foundReport],
  ['missing report', missingReport]
]) {
  assert(source.includes('Demo prefill'), `${name} should label the autofill area as a quiet demo prefill utility.`);
  assert(source.includes('Prefill necklace'), `${name} should expose a concise necklace autofill button.`);
  assert(!source.includes('Need the judge demo preset?'), `${name} should avoid corny judge-demo question copy.`);
  assert(!source.includes('auto_fix_high'), `${name} demo fill button should stay plain without a decorative icon.`);
  assert(source.includes('async function attachDemoPhoto()'), `${name} should attach the demo photo through a shared helper.`);
  assert(source.includes('new DataTransfer()'), `${name} should use DataTransfer so the real file input receives a File.`);
  assert(source.includes("photoInput.dispatchEvent(new Event('change', { bubbles: true }))"), `${name} should reuse the existing photo preview flow after attaching the file.`);
  assert(source.includes('dispatchFieldEvents(field)'), `${name} should dispatch validation events for programmatic field updates.`);
  assert(!/demo[^<\n]{0,80}submit\(/i.test(source), `${name} demo fill must not submit the form automatically.`);
  assert(!/setTimeout\(\(\)\s*=>\s*window\.location\.href\s*=\s*['"]\/my-submissions\.html['"],\s*2200\)/.test(source), `${name} should not hold users on the form with a delayed success redirect.`);
}

assert(
  foundReport.includes("const DEMO_NECKLACE_PHOTO = '/images/demo/necklace-found-table.jpg';"),
  'Found report demo fill should use the wooden-table necklace photo.'
);
assert(
  foundReport.includes("new File([blob], 'necklace-found-table.jpg'"),
  'Found report demo fill should name the attached found necklace photo clearly.'
);
assert(
  missingReport.includes("const DEMO_NECKLACE_PHOTO = '/images/demo/necklace-missing-white.jpg';"),
  'Missing report demo fill should use the white-background necklace photo.'
);
assert(
  missingReport.includes("new File([blob], 'necklace-missing-white.jpg'"),
  'Missing report demo fill should name the attached missing necklace photo clearly.'
);
assert(
  missingReport.includes("const DEMO_NECKLACE_MISSING_DATE = '2026-06-29';") &&
    missingReport.includes("setDemoField('lastSeenDate', DEMO_NECKLACE_MISSING_DATE)") &&
    !missingReport.includes("setDemoField('lastSeenDate', todayIsoDate())"),
  'Missing report demo prefill should stay pinned to June 29, 2026 for prelims setup.'
);
assert(
  !missingReport.includes("const DEMO_NECKLACE_PHOTO = '/images/demo/necklace-found-table.jpg';") &&
    !foundReport.includes("const DEMO_NECKLACE_PHOTO = '/images/demo/necklace-missing-white.jpg';"),
  'Found and missing demo prefills should not share the same necklace image.'
);
assert(
  foundReport.includes("window.location.assign('/my-submissions.html?tab=found&submitted=found')"),
  'Found report should redirect immediately to the Found submissions tab after the save completes.'
);
assert(
  missingReport.includes("window.location.assign('/my-submissions.html?tab=missing&submitted=missing')"),
  'Missing report should redirect immediately to the Missing submissions tab after the save completes.'
);

assert(claimPage.includes('Demo prefill'), 'Claim page should include the quiet demo prefill utility.');
assert(claimPage.includes('Prefill claim'), 'Claim page should expose a concise claim prefill button.');
assert(claimPage.includes('student-form-card'), 'Claim page should use the shared student form card surface.');
assert(claimPage.includes('max-w-3xl'), 'Claim page should use the same centered student portal content rhythm as settings/forms.');
assert(claimPage.includes('id="form-container" class="hidden max-w-3xl"'), 'Claim page info alert should share the same max width as the claim form.');
assert(claimPage.includes('class="w-full bg-white border border-outline-variant'), 'Claim form card should fill the aligned claim content wrapper.');
assert(!claimPage.includes('claim-layout-grid'), 'Claim page should not show a separate two-column claim info layout.');
assert(!claimPage.includes('claim-info-card'), 'Claim page should not show the extra claiming-item side card.');
assert(!claimPage.includes('id="item-name-display" class="text-on-surface">…</strong>'), 'Claim page header should not default to an ellipsis item name.');
assert(firstStudentSidebar(claimPage).includes('href="/map.html"') && firstStudentSidebar(claimPage).includes('Campus Map'), 'Claim page should expose Campus Map from the student sidebar.');
assert(!claimHeader(claimPage).includes('href="/my-submissions.html"') && !claimHeader(claimPage).includes('href="/search.html"') && !claimHeader(claimPage).includes('href="/map.html"'), 'Claim page header should not duplicate sidebar navigation buttons.');
assert(claimPage.includes('function fillDemoClaim()'), 'Claim page should define a demo claim prefill handler.');
assert(claimPage.includes('setDemoClaimField('), 'Claim page demo prefill should use a helper for field updates.');
assert(claimPage.includes("field.dispatchEvent(new Event('input', { bubbles: true }))"), 'Claim page demo prefill should dispatch input events.');
assert(claimPage.includes("field.dispatchEvent(new Event('change', { bubbles: true }))"), 'Claim page demo prefill should dispatch change events.');
assert(!/fillDemoClaim[\s\S]{0,900}\.submit\(/.test(claimPage), 'Claim page demo prefill must not submit the claim automatically.');
assert(claimPage.includes('claim-success-card'), 'Claim page should show an intentional success card after submission.');
assert(claimPage.includes('View My Claims'), 'Claim success state should link back to the claims/submissions area.');
assert(claimPage.includes('result.claim?.itemName'), 'Claim success state should use the submitted claim response to restore item context.');
assert(!claimPage.includes("document.getElementById('claim-form').style.display = 'none';"), 'Claim page should not leave an empty card by only hiding the form after submission.');
assert(/id="item-name-display"[^>]*data-i18n-skip/.test(claimPage), 'Claim item name should opt out of translation resets so loaded item names are not replaced with "this item".');
assert(claimPage.includes("params.get('itemId')"), 'Claim page should accept itemId query parameters from alternate claim links.');
assert(claimPage.includes("params.get('itemType')"), 'Claim page should accept itemType query parameters from alternate claim links.');
assert(/toLowerCase\(\)/.test(claimPage), 'Claim page should normalize claim item type casing before loading item details.');

assert(
  foundReport.includes("window.reportMapPicker?.selectRoom({ floorId: 'floor-1', roomNumber: '1129' })"),
  'Found report demo fill should select Floor 1 Room 1129 through the map picker helper.'
);
assert(
  !missingReport.includes('window.reportMapPicker?.selectRoom'),
  'Missing report demo fill should not use map pin helpers because that form has no map picker.'
);

assert(
  picker.includes('window.reportMapPicker') &&
    picker.includes('selectRoom({ floorId, roomNumber })') &&
    picker.includes('return false;') &&
    picker.includes('updateSelection(match'),
  'Report map picker should expose a selectRoom helper that reuses picker selection state and reports success/failure.'
);

assert(
  fs.existsSync(path.join(ROOT, 'public/images/demo/airpods-found-case.jpg')) &&
    fs.existsSync(path.join(ROOT, 'public/images/demo/airpods-missing-open.jpg')) &&
    fs.existsSync(path.join(ROOT, 'public/images/demo/necklace-found-table.jpg')) &&
    fs.existsSync(path.join(ROOT, 'public/images/demo/necklace-missing-white.jpg')),
  'Distinct AirPods and necklace demo images should be tracked under public/images/demo.'
);

assert(
  /\.photo-preview\s+img\s*\{[^}]*aspect-ratio:\s*4\s*\/\s*3[^}]*object-fit:\s*contain/s.test(css),
  'Form photo preview should have stable dimensions and contain tall images.'
);
assert(
  /\.demo-fill-card\s*\{[^}]*background:\s*#fff/s.test(css) &&
    !/\.demo-fill-card\s*\{[^}]*linear-gradient/s.test(css),
  'Demo fill card should use quiet utility styling instead of a flashy gradient banner.'
);
assert(
  /\.item-card-img\.portrait-photo\s+img\s*\{[^}]*object-fit:\s*contain/s.test(css) &&
    /\.detail-img\.portrait-photo\s+img\s*\{[^}]*object-fit:\s*contain/s.test(css),
  'Tall listing/detail photos should use a safer contained fit.'
);
assert(
  search.includes('markAdaptiveImage(this)') &&
    searchMissing.includes('markAdaptiveImage(this)') &&
    itemDetail.includes('markAdaptiveImage(this)') &&
    missingDetail.includes('markAdaptiveImage(this)'),
  'Search and detail pages should classify image orientation after load.'
);

console.log('demo-autofill-source.test.js passed');

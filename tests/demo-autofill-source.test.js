// Source-level tests for judge-demo report autofill and image presentation.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

const foundReport = read('public/report.html');
const missingReport = read('public/report-missing.html');
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
  assert(source.includes('Prefill AirPods'), `${name} should expose a concise AirPods autofill button.`);
  assert(!source.includes('Need the judge demo preset?'), `${name} should avoid corny judge-demo question copy.`);
  assert(!source.includes('auto_fix_high'), `${name} demo fill button should stay plain without a decorative icon.`);
  assert(source.includes("const DEMO_AIRPODS_PHOTO = '/images/demo/airpods-found.jpg';"), `${name} should use the bundled AirPods demo image.`);
  assert(source.includes('async function attachDemoPhoto()'), `${name} should attach the demo photo through a shared helper.`);
  assert(source.includes('new DataTransfer()'), `${name} should use DataTransfer so the real file input receives a File.`);
  assert(source.includes("photoInput.dispatchEvent(new Event('change', { bubbles: true }))"), `${name} should reuse the existing photo preview flow after attaching the file.`);
  assert(source.includes('dispatchFieldEvents(field)'), `${name} should dispatch validation events for programmatic field updates.`);
  assert(!/demo[^<\n]{0,80}submit\(/i.test(source), `${name} demo fill must not submit the form automatically.`);
}

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
  fs.existsSync(path.join(ROOT, 'public/images/demo/airpods-found.jpg')),
  'Bundled AirPods demo image should be tracked under public/images/demo.'
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

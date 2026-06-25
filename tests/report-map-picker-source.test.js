// Source-level report picker tests guard form behavior that depends on browser-only SVG geometry.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

const pickerSource = read('public/js/report-map-picker.js');
const reportHtml = read('public/report.html');

assert(
  pickerSource.includes('CLEAN_FLOOR_SOURCES'),
  'Report map picker should define all clean floor sources, not one hard-coded Floor 1 JSON.'
);
for (const expected of [
  '/maps/clean/basement-clean.json',
  '/maps/clean/floor-1-clean.json',
  '/maps/clean/floor-2-clean.json',
  '/maps/clean/floor-3-clean.json'
]) {
  assert(pickerSource.includes(expected), `Report map picker missing clean source ${expected}`);
}
assert(
  pickerSource.includes('activeFloorId'),
  'Report map picker should track the active floor id for hidden form values.'
);
assert(
  !pickerSource.includes("document.getElementById('mapFloorId').value = room ? 'floor-1' : '';"),
  'Report map picker must not write floor-1 for every selected room.'
);
assert(
  reportHtml.includes('report-floor-select'),
  'Report form should expose a floor selector for the mini map picker.'
);
assert(
  reportHtml.includes('report-map-selected-chip'),
  'Report map picker should have a dedicated selected-room chip instead of relying only on the written location field.'
);
for (const expectedControl of [
  'report-map-zoom-in',
  'report-map-zoom-out',
  'report-map-fit'
]) {
  assert(reportHtml.includes(expectedControl), `Report map picker missing ${expectedControl} zoom control.`);
}
assert(
  pickerSource.includes('suppressLocationInputTracking'),
  'Programmatic location autofill should not mark the location field as manually edited.'
);
assert(
  pickerSource.includes('shouldAutofillLocation'),
  'Report map picker should decide whether to autofill instead of overwriting custom user location text.'
);
assert(
  pickerSource.includes("dispatchEvent(new Event('input'"),
  'Programmatic location autofill should dispatch input so global validation clears stale error state.'
);
assert(
  pickerSource.includes('fitExcludeIds') && pickerSource.includes('basement-hallway-1') && pickerSource.includes('basement-space-1-1'),
  'Basement mini-map fit should exclude tiny detached outlier shapes that pull the picker off-center.'
);
assert(
  pickerSource.includes('zoomBy') && pickerSource.includes('resetViewToFit'),
  'Report map picker should support zooming and fitting the SVG viewBox.'
);

console.log('report-map-picker-source.test.js passed');

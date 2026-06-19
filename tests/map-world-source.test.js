const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function readProjectFile(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

const worldSource = readProjectFile('public/js/campus-map-world.js');
const mapHtml = readProjectFile('public/map.html');
const css = readProjectFile('public/css/style.css');

assert(
  worldSource.includes('wallShadeForSegment'),
  'CampusMapWorld should shade wall segments by their direction.'
);
assert(
  worldSource.includes('createWallEdgeLines'),
  'CampusMapWorld should draw vertical wall edge lines.'
);
assert(
  worldSource.includes('materialStates'),
  'Room wall meshes should store stateful material variants instead of one flat material.'
);
assert(
  worldSource.includes('normalizeWheelZoomFactor'),
  'CampusMapWorld should normalize wheel/trackpad zoom deltas.'
);
assert(
  worldSource.includes('zoomBy(factor, anchorScreenPoint'),
  'zoomBy should accept a screen anchor, not a precomputed world point.'
);
assert(
  !/rect\.left\s*\+\s*rect\.width\s*\/\s*2/.test(worldSource),
  'zoomBy must not compare pointer-before to viewport-center-after.'
);
assert(
  worldSource.includes('syncViewCube'),
  'CampusMapWorld should synchronize the ViewCube with camera rotation.'
);
assert(
  mapHtml.includes('campus-view-cube-core') && mapHtml.includes('campus-view-cube-stage'),
  'map.html should use a real CSS 3D ViewCube structure.'
);
assert(
  css.includes('transform-style: preserve-3d') && css.includes('translateZ'),
  'ViewCube CSS should use a real 3D cube transform.'
);
assert(
  worldSource.includes('addFloorBoundarySeams'),
  'CampusMapWorld should render low floor boundary seams instead of a heavy enclosing shell.'
);
assert(
  worldSource.includes('outerOutlines'),
  'CampusMapWorld should keep clean DXF WALLS as flat outerOutlines, not raised walls.'
);
assert(
  worldSource.includes('addOuterOutlines'),
  'CampusMapWorld should render outerOutlines with a dedicated flat seam renderer.'
);
assert(
  !worldSource.includes('(floor.walls || []).forEach((entry) => this.addWallFeature(entry, floor));'),
  'Floor-level outer WALLS must not be passed directly into addWallFeature().'
);
assert(
  worldSource.includes('new THREE.PlaneGeometry(width, depth)'),
  'CampusMapWorld should use a flat world plane instead of a thick boxed world base.'
);
const hoverLiftMatch = worldSource.match(/hoverLiftRoom:\s*(\d+)/);
assert(hoverLiftMatch, 'CampusMapWorld should declare a room hover lift value.');
assert(
  Number(hoverLiftMatch[1]) === 12,
  'Room hover lift should use the old stable lift-only target of 12.'
);
assert(
  !worldSource.includes('active && !isHallway ? 1.012 : 1'),
  'Room hover should not scale room groups because scaling the raycast target can flicker.'
);

console.log('map-world-source.test.js passed');

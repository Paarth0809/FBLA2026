// Source-level map tests protect rendering contracts that are hard to assert in a headless WebGL scene.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function readProjectFile(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

const worldSource = readProjectFile('public/js/campus-map-world.js');
const mapControllerSource = readProjectFile('public/js/campus-map.js');
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
  Number(hoverLiftMatch[1]) === 22,
  'Room hover lift should restore a stronger visible rise.'
);
assert(
  /selectedLiftRoom:\s*30/.test(worldSource) &&
    /hoverLiftHallway:\s*8/.test(worldSource) &&
    /selectedLiftHallway:\s*13/.test(worldSource),
  'Selected room lift should remain above hover lift, with hallway lift scaled proportionally.'
);
assert(
  worldSource.includes('const scale = active ? (isHallway ? 1.004 : 1.014) : 1;'),
  'Room hover should restore a subtle visual scale pop.'
);
assert(
  worldSource.includes('this.activeFloorGroup.add(hitTarget);') &&
    worldSource.includes('this.roomHitTargets.push(hitTarget);'),
  'Room raycast hit targets should stay separate from scaled visual room groups.'
);
assert(
  worldSource.includes('createRoomHitTargetGeometry(room.polygon, slabDepth)') &&
    !worldSource.includes('const hitTarget = new THREE.Mesh(polygonTopGeometry(room.polygon), this.hitTargetMaterial);'),
  'Room hover hit targets should use full-height room volumes, not flat top planes.'
);
assert(
  worldSource.includes('hitTarget.userData.linkedRoomGroup = group') &&
    worldSource.includes('group.userData.hitTarget = hitTarget') &&
    worldSource.includes('group.userData.hitTarget.position.y = group.userData.baseY + group.userData.currentY'),
  'Room hit targets should follow room lift while staying separate from visual room scaling.'
);
assert(
  /\.campus-map-world-label\.room-label\s*\{[^}]*pointer-events:\s*none/s.test(css),
  'Room hover labels should not capture pointer events from the map canvas.'
);
assert(
  /\.campus-map-world-label\s*\{[^}]*pointer-events:\s*none/s.test(css),
  'All campus map world labels should be passive by default.'
);
assert(
  /\.campus-map-world-label\.stair-label\s*\{[^}]*pointer-events:\s*none/s.test(css),
  'Stair hover labels should not capture pointer events from the map canvas.'
);
assert(
  !worldSource.includes("label.addEventListener('click'") &&
    !css.includes('.campus-map-world-label:hover'),
  'Floating campus map labels should not have click handlers or hover interaction styles.'
);
assert(
  worldSource.includes('preferStableHoveredRoomHit') &&
    worldSource.includes('const stableRoomHit = this.preferStableHoveredRoomHit(hits);'),
  'pickEntity should keep the current hovered room stable when its hit target is still under the pointer.'
);
assert(
  !mapHtml.includes('campus-map-toggles') &&
    !mapHtml.includes('toggle-pins') &&
    !mapHtml.includes('Show example pins'),
  'Campus map side panel should not show layer/debug checkboxes or example-pin controls.'
);
assert(
  !worldSource.includes('floor.pins.forEach((entry) => this.addPin(entry, floor));'),
  'CampusMapWorld should not render hardcoded example pins from floor data.'
);
assert(
  !mapControllerSource.includes('floor.pins.find') &&
    !mapControllerSource.includes('match.pin'),
  'Campus map search/details should not expose hardcoded example pins.'
);
assert(
  worldSource.includes("this.canvas.classList.add('is-dragging')") &&
    worldSource.includes("this.canvas.classList.remove('is-dragging')"),
  'CampusMapWorld should expose an is-dragging class while panning.'
);
assert(
  /\.campus-map-canvas\.is-dragging[\s\S]*cursor:\s*grabbing/.test(css),
  'Map dragging cursor should override hover cursor while panning.'
);
assert(
  /const DRAG_PAN_THRESHOLD\s*=\s*8/.test(worldSource) &&
    worldSource.includes('Math.abs(dx) + Math.abs(dy) <= DRAG_PAN_THRESHOLD'),
  'Map panning should require a larger drag threshold than the old 3px hover jitter threshold.'
);
assert(
  worldSource.includes('if (!this.drag.moved) {') &&
    worldSource.includes('if (Math.abs(dx) + Math.abs(dy) <= DRAG_PAN_THRESHOLD) return;') &&
    worldSource.includes('this.drag.x = event.clientX;') &&
    worldSource.includes('this.drag.y = event.clientY;'),
  'Map camera should not pan until movement crosses the drag threshold.'
);
assert(
  /\.campus-map-canvas\s*\{[^}]*cursor:\s*default/s.test(css) &&
    !/\.campus-map-canvas\s*\{[^}]*cursor:\s*grab/s.test(css),
  'Map canvas should not show a grab cursor during ordinary room hover.'
);
assert(
  worldSource.includes('if (wasDragging) return;') &&
    worldSource.includes('const wasDragging = this.drag.moved;'),
  'Pointer-up should not raycast/select after a moved drag.'
);
assert(
  !worldSource.includes('pinHitTargets') &&
    !worldSource.includes('pin-click-target') &&
    !worldSource.includes('clickTargetHeight'),
  'Pins should be visual-only markers with no canvas click target collection or mesh.'
);
assert(
  !worldSource.includes('pinGroups') &&
    !worldSource.includes('addPin(') &&
    !worldSource.includes('addLivePinsForFloor') &&
    !worldSource.includes('PIN_STEM_HEIGHT') &&
    !worldSource.includes("type: 'pin'") &&
    !worldSource.includes('campus-map-world-label pin-label'),
  'CampusMapWorld should not create or track 3D approved-item marker objects.'
);
assert(
  worldSource.includes('projectWorldPoint(point)') &&
    worldSource.includes('const projected = new THREE.Vector3(point.x, point.y ?? 0, point.z);') &&
    worldSource.includes('this.onFrame();'),
  'CampusMapWorld should expose passive DOM marker projection without creating marker meshes.'
);
assert(
  worldSource.includes('pickHoverEntity()') &&
    worldSource.includes('pickClickEntity()') &&
    worldSource.includes('if (this.focusMode?.roomId) return null;') &&
    worldSource.includes('return this.pickEntityFromTargets(this.interactive.concat(this.roomHitTargets), true);'),
  'CampusMapWorld should ignore pins on canvas clicks and disable canvas selection while in room focus.'
);
assert(
  !worldSource.includes('focusedPinTargets') &&
    !worldSource.includes('return this.pickEntityFromTargets(focusedPinTargets, false);') &&
    !worldSource.includes('if (pinHit) return pinHit;\n    return this.pickEntityFromTargets(this.interactive.concat(this.roomHitTargets), true);'),
  'Room-focus click picking should not raycast pins or fall back to adjacent rooms or stairs.'
);
assert(
  !worldSource.includes('selectPin(') &&
    !mapControllerSource.includes('world.selectPin') &&
    mapControllerSource.includes('if (match.livePin?.mapRoomId) world.selectRoom(match.livePin.mapRoomId);'),
  'Found-item search should select the linked room instead of a 3D marker.'
);
assert(
  mapControllerSource.includes('function renderPassiveMarkers()') &&
    mapControllerSource.includes("marker.className = 'campus-map-passive-marker'") &&
    mapControllerSource.includes('world.projectWorldPoint({') &&
    mapControllerSource.includes('onFrame: () => renderPassiveMarkers()'),
  'Approved item markers should be passive DOM overlays projected from map coordinates.'
);
assert(
  /\.campus-map-passive-marker\s*\{[^}]*pointer-events:\s*none/s.test(css),
  'Passive item markers must not capture pointer events from the canvas.'
);
assert(
  mapControllerSource.includes('function roomHoverSummary(room)') &&
    mapControllerSource.includes('function selectedRoomDetails(entity, preview = false)') &&
    mapControllerSource.includes('preview ? roomHoverSummary(entity.room) : roomItemSection(entity.room)') &&
    !/if \(!state\.selectedKey\) updateDetails\(entity, true\);[\s\S]{0,700}roomItemSection\(entity\.room\)/.test(mapControllerSource),
  'Hover previews should use lightweight room summaries instead of rendering item cards/photos.'
);
assert(
  /\.campus-map-details\s*\{[^}]*min-height:[^}]*overflow-y:\s*auto/s.test(css),
  'Campus map details panel should have stable height and internal scrolling.'
);
assert(
  worldSource.includes('const hit = this.pickClickEntity();') &&
    worldSource.includes('const hit = this.pickHoverEntity();'),
  'Pointer handlers should use click picking for clicks and hover picking for hover updates.'
);
assert(
  !mapControllerSource.includes('Tap a room or approved pin') &&
    mapControllerSource.includes('Tap a room to view approved items here') &&
    !mapHtml.includes('Select a room or pin') &&
    !mapHtml.includes('found-item pins inside') &&
    !mapHtml.includes('pinned items') &&
    !mapHtml.includes('found-item pins appear'),
  'Campus map instructions should not imply approved item pins are visible or clickable.'
);
assert(
  !worldSource.includes('new THREE.CylinderGeometry(6, 10, 42, 24)') &&
    !worldSource.includes('new THREE.SphereGeometry(19, 32, 18)') &&
    !worldSource.includes('group.position.set(x, 26, z)') &&
    !worldSource.includes('targetY: 26, currentY: 26') &&
    !worldSource.includes('new THREE.CylinderGeometry(1.8, 2.2, PIN_STEM_HEIGHT, 14)') &&
    !worldSource.includes('new THREE.SphereGeometry(7.2, 22, 14)'),
  'CampusMapWorld should not create old or new 3D marker geometry.'
);
assert(
  worldSource.includes('group.getWorldPosition(center);') &&
    !worldSource.includes('group?.position?.clone?.()'),
  'Entity camera targeting should use world position for selectable map objects.'
);
assert(
  worldSource.includes('const roomLabelIsActive = isRoomLabel && key === selectedKey;') &&
    worldSource.includes('const stairLabelIsActive = isStairLabel && key === selectedKey;') &&
    worldSource.includes('(isRoomLabel && !roomLabelIsActive)') &&
    worldSource.includes('(isStairLabel && !stairLabelIsActive)') &&
    !worldSource.includes('isPinLabel'),
  'Room and stair floating labels should not appear from hover alone, and pin labels should not exist.'
);
assert(
  worldSource.includes("this.canvas.addEventListener('lostpointercapture'") &&
    worldSource.includes('clearDragState') &&
    worldSource.includes("this.canvas.classList.remove('is-dragging')"),
  'Pointer cancel, leave, and lost pointer capture should clear dragging state.'
);

console.log('map-world-source.test.js passed');

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const converter = require('../scripts/convert-clean-dxf-to-map.js');

const floorCases = [
  {
    floorId: 'basement',
    source: 'basement-clean.dxf',
    expectedLabels: 36,
    minRooms: 55,
    minHallways: 13,
    minStairs: 6,
    expectedRooms: ['0133', '0147']
  },
  {
    floorId: 'floor-1',
    source: 'gatorfloor1academic.dxf',
    expectedLabels: 55,
    minRooms: 60,
    minHallways: 20,
    minStairs: 11,
    expectedRooms: ['1133', 'Front Office']
  },
  {
    floorId: 'floor-2',
    source: 'floor-2-clean.dxf',
    expectedLabels: 44,
    minRooms: 54,
    minHallways: 8,
    minStairs: 10,
    expectedRooms: ['2201', '2133'],
    expectsAutoClosed: true
  },
  {
    floorId: 'floor-3',
    source: 'floor-3-clean.dxf',
    expectedLabels: 40,
    minRooms: 47,
    minHallways: 8,
    minStairs: 8,
    expectedRooms: ['3133', '3155']
  }
];

function run() {
  for (const testCase of floorCases) {
    const source = path.join(ROOT, 'cad/campus-map-workspace/sources', testCase.source);
    assert.ok(fs.existsSync(source), `expected ${testCase.source} in the CAD workspace sources`);

    const payload = converter.convertDxfToFloor({
      floorId: testCase.floorId,
      source,
      sourceFloor: { rooms: [] }
    });

    assert.equal(payload.floorId, testCase.floorId);
    assert.equal(payload.labels.length, testCase.expectedLabels, `${testCase.floorId} should parse typed room labels`);
    assert.ok(payload.rooms.length >= testCase.minRooms, `${testCase.floorId} should parse room polygons`);
    assert.ok(payload.hallways.length >= testCase.minHallways, `${testCase.floorId} should parse hallway polygons`);
    assert.ok(payload.stairs.length >= testCase.minStairs, `${testCase.floorId} should parse stair footprints`);
    assert.equal(payload.walls.length, 0, `${testCase.floorId} outer DXF WALLS outlines should not be raised walls`);
    assert.ok(payload.outerOutlines.length >= 1, `${testCase.floorId} outer outlines should be retained`);
    assert.ok(payload.outerOutlines.every((entry) => entry.renderAs === 'outline' && entry.height === 0), `${testCase.floorId} outer outlines should be flat outline metadata`);

    for (const roomNumber of testCase.expectedRooms) {
      assert.ok(payload.rooms.some((room) => room.roomNumber === roomNumber), `${testCase.floorId} missing room ${roomNumber}`);
    }

    assert.ok(payload.labels.every((label) => label.roomId), `${testCase.floorId} typed room labels should be attached to rooms`);
    assert.ok(!payload.rooms.some((room) => room.layer === 'REFERENCE_UNDERLAY'), `${testCase.floorId} reference underlay must not render as a room`);

    if (testCase.expectsAutoClosed) {
      assert.ok(payload.warnings.some((warning) => warning.type === 'auto-closed-polyline'), 'Floor 2 should report auto-closed usable open polylines');
      assert.ok(payload.warnings.some((warning) => warning.type === 'skipped-open-line'), 'Floor 2 should report skipped raw LINE entities');
    }
  }

  const floor1Source = path.join(ROOT, 'cad/campus-map-workspace/sources/gatorfloor1academic.dxf');
  const payload = converter.convertDxfToFloor({ floorId: 'floor-1', source: floor1Source, sourceFloor: { rooms: [] } });
  const labeledRooms = payload.rooms.filter((room) => room.roomNumber && !room.roomNumber.startsWith('space-'));
  assert.ok(labeledRooms.length >= 50, 'typed room labels should create named room entries where the CAD room has a primary label');
  assert.ok(payload.warnings.some((warning) => warning.type === 'small-room-artifact'), 'tiny CAD artifacts should be reported');
}

run();
console.log('map converter tests passed');

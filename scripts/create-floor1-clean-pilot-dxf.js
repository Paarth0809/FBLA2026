#!/usr/bin/env node

/**
 * Creates the first clean Floor 1 pilot DXF from the current curated map data.
 *
 * This is not a replacement for AutoCAD cleanup. It is a semantic starting
 * drawing: rooms, hallways, stairs, and labels are placed on the same clean
 * layers AutoCAD will use, so the drawing can be opened and refined without
 * starting from raw scan linework.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'cad', 'campus-map-workspace', 'clean', 'floor-1-pilot-clean.dxf');

const LAYER_COLORS = {
  REFERENCE_STROKES: 8,
  REFERENCE_BASE: 9,
  ROOMS: 3,
  HALLWAYS: 4,
  WALLS: 7,
  DOORS: 2,
  STAIRS: 6,
  ROOM_LABELS: 1,
  PLACE_LABELS: 5,
  PINS: 30
};

function loadCampusMapData() {
  const file = path.join(ROOT, 'public', 'js', 'campus-map-data.js');
  const source = fs.readFileSync(file, 'utf8')
    .replace('export const CAMPUS_MAP_FLOORS =', 'const CAMPUS_MAP_FLOORS =')
    .replace(/export function /g, 'function ');
  const sandbox = {};
  vm.runInNewContext(`${source}\nglobalThis.__floors = CAMPUS_MAP_FLOORS;`, sandbox, { filename: file });
  return sandbox.__floors;
}

function pair(code, value) {
  return `${code}\n${value}\n`;
}

function sanitize(value) {
  return String(value).replace(/[{}]/g, '').trim();
}

function metadataComment(meta) {
  return pair(999, `CAMPUS_MAP_META ${JSON.stringify(meta)}`);
}

function layerTable() {
  let text = '';
  text += pair(0, 'SECTION');
  text += pair(2, 'TABLES');
  text += pair(0, 'TABLE');
  text += pair(2, 'LAYER');
  text += pair(70, Object.keys(LAYER_COLORS).length);
  for (const [name, color] of Object.entries(LAYER_COLORS)) {
    text += pair(0, 'LAYER');
    text += pair(2, name);
    text += pair(70, 0);
    text += pair(62, color);
    text += pair(6, 'CONTINUOUS');
  }
  text += pair(0, 'ENDTAB');
  text += pair(0, 'ENDSEC');
  return text;
}

function polyline(layer, points, options = {}) {
  const usable = points
    .filter((point) => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]))
    .map(([x, z]) => [Number(x.toFixed(3)), Number(z.toFixed(3))]);
  if (usable.length < 2) return '';

  let text = '';
  if (options.meta) text += metadataComment(options.meta);
  text += pair(0, 'LWPOLYLINE');
  text += pair(100, 'AcDbEntity');
  text += pair(8, layer);
  text += pair(100, 'AcDbPolyline');
  text += pair(90, usable.length);
  text += pair(70, options.closed === false ? 0 : 1);
  for (const [x, z] of usable) {
    text += pair(10, x);
    text += pair(20, z);
  }
  return text;
}

function textEntity(layer, value, position, options = {}) {
  const [x, z] = position;
  let text = '';
  if (options.meta) text += metadataComment(options.meta);
  text += pair(0, 'TEXT');
  text += pair(100, 'AcDbEntity');
  text += pair(8, layer);
  text += pair(100, 'AcDbText');
  text += pair(10, Number(x.toFixed(3)));
  text += pair(20, Number(z.toFixed(3)));
  text += pair(40, options.height || 22);
  text += pair(1, sanitize(value));
  text += pair(50, options.rotation || 0);
  return text;
}

function polygonCenter(points) {
  let x = 0;
  let z = 0;
  points.forEach((point) => {
    x += point[0];
    z += point[1];
  });
  return [x / points.length, z / points.length];
}

function segmentPolygon(a, b, width) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.hypot(dx, dz) || 1;
  const nx = -dz / length;
  const nz = dx / length;
  const half = width / 2;
  return [
    [a[0] + nx * half, a[1] + nz * half],
    [b[0] + nx * half, b[1] + nz * half],
    [b[0] - nx * half, b[1] - nz * half],
    [a[0] - nx * half, a[1] - nz * half]
  ];
}

function rotatedRect(position, size, rotation = 0) {
  const [x, z] = position;
  const [width, depth] = size;
  const halfW = width / 2;
  const halfD = depth / 2;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return [
    [-halfW, -halfD],
    [halfW, -halfD],
    [halfW, halfD],
    [-halfW, halfD]
  ].map(([px, pz]) => [
    x + px * cos - pz * sin,
    z + px * sin + pz * cos
  ]);
}

function buildDxf(floor) {
  let entities = '';

  floor.rooms.forEach((entry) => {
    entities += polyline('ROOMS', entry.polygon, {
      meta: {
        id: entry.id,
        label: entry.label,
        roomNumber: entry.plannedRoomNumber,
        kind: entry.kind,
        importance: entry.importance || 'normal'
      }
    });
    if (entry.plannedRoomNumber) {
      entities += textEntity('ROOM_LABELS', entry.plannedRoomNumber, polygonCenter(entry.polygon), {
        height: entry.importance === 'major' ? 30 : 20,
        meta: { roomId: entry.id, roomNumber: entry.plannedRoomNumber }
      });
    }
  });

  (floor.connectors || []).forEach((connector) => {
    for (let i = 0; i < connector.points.length - 1; i += 1) {
      const polygon = segmentPolygon(connector.points[i], connector.points[i + 1], connector.width || 64);
      entities += polyline('HALLWAYS', polygon, {
        meta: {
          id: `${connector.id}-segment-${i + 1}`,
          label: connector.label,
          kind: 'Hallway'
        }
      });
    }
  });

  (floor.stairs || []).forEach((entry) => {
    entities += polyline('STAIRS', rotatedRect(entry.position, entry.size, entry.rotation || 0), {
      meta: {
        id: entry.id,
        label: entry.label,
        kind: 'Stair',
        treads: entry.treads || 8
      }
    });
    entities += textEntity('PLACE_LABELS', entry.label, entry.position, {
      height: 18,
      meta: { id: `${entry.id}-label`, targetId: entry.id }
    });
  });

  (floor.pins || []).forEach((entry) => {
    const [x, z] = entry.position;
    const size = 20;
    entities += polyline('PINS', [[x - size, z], [x, z - size], [x + size, z], [x, z + size]], {
      meta: { id: entry.id, label: entry.label, type: entry.type }
    });
    entities += textEntity('PLACE_LABELS', entry.label, [x + 24, z - 8], {
      height: 18,
      meta: { id: `${entry.id}-label`, targetId: entry.id }
    });
  });

  let dxf = '';
  dxf += pair(0, 'SECTION');
  dxf += pair(2, 'HEADER');
  dxf += pair(9, '$ACADVER');
  dxf += pair(1, 'AC1027');
  dxf += pair(0, 'ENDSEC');
  dxf += layerTable();
  dxf += pair(0, 'SECTION');
  dxf += pair(2, 'ENTITIES');
  dxf += entities;
  dxf += pair(0, 'ENDSEC');
  dxf += pair(0, 'EOF');
  return dxf;
}

function main() {
  const floor = loadCampusMapData().find((entry) => entry.id === 'floor-1');
  if (!floor) throw new Error('Could not find floor-1 in campus map data.');

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, buildDxf(floor));
  console.log(`Generated ${path.relative(ROOT, OUT_FILE)}`);
}

main();

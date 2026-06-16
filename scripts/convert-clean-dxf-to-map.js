#!/usr/bin/env node

/**
 * Converts clean, layer-based campus map DXF files into website geometry JSON.
 *
 * The converter intentionally reads only the semantic CAD layers produced by
 * the cleanup workflow. Noisy reference underlays are ignored.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const CLEAN_ROOT = path.join(ROOT, 'cad', 'campus-map-workspace', 'clean');
const OUT_ROOT = path.join(ROOT, 'public', 'maps', 'clean');

const FLOOR_INPUTS = [
  {
    floorId: 'floor-1',
    source: path.join(CLEAN_ROOT, 'floor-1-pilot-clean.dxf'),
    output: path.join(OUT_ROOT, 'floor-1-clean.json')
  }
];

function loadCampusMapData() {
  const file = path.join(ROOT, 'public', 'js', 'campus-map-data.js');
  const source = fs.readFileSync(file, 'utf8')
    .replace('export const CAMPUS_MAP_FLOORS =', 'const CAMPUS_MAP_FLOORS =')
    .replace(/export function /g, 'function ');
  const sandbox = {};
  vm.runInNewContext(`${source}\nglobalThis.__floors = CAMPUS_MAP_FLOORS;`, sandbox, { filename: file });
  return sandbox.__floors;
}

function slug(value) {
  return String(value || 'entry')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'entry';
}

function groupPairs(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const pairs = [];
  for (let i = 0; i < lines.length - 1; i += 2) {
    pairs.push({ code: lines[i].trim(), value: lines[i + 1].trim() });
  }
  return pairs;
}

function parseMeta(value) {
  if (!value.startsWith('CAMPUS_MAP_META ')) return null;
  try {
    return JSON.parse(value.slice('CAMPUS_MAP_META '.length));
  } catch {
    return null;
  }
}

function parseEntities(text) {
  const pairs = groupPairs(text);
  const entities = [];
  let pendingMeta = null;
  let i = 0;

  while (i < pairs.length) {
    const pair = pairs[i];
    if (pair.code === '999') {
      pendingMeta = parseMeta(pair.value) || pendingMeta;
      i += 1;
      continue;
    }

    if (pair.code !== '0') {
      i += 1;
      continue;
    }

    const type = pair.value;
    i += 1;
    const group = [];
    while (i < pairs.length && pairs[i].code !== '0') {
      group.push(pairs[i]);
      i += 1;
    }

    if (type === 'LWPOLYLINE') {
      const layer = group.find((entry) => entry.code === '8')?.value || '0';
      const closed = (Number(group.find((entry) => entry.code === '70')?.value || 0) & 1) === 1;
      const points = [];
      let lastX = null;
      group.forEach((entry) => {
        if (entry.code === '10') lastX = Number(entry.value);
        if (entry.code === '20' && Number.isFinite(lastX)) {
          const y = Number(entry.value);
          if (Number.isFinite(y)) points.push([lastX, y]);
          lastX = null;
        }
      });
      entities.push({ type, layer, closed, points, meta: pendingMeta || {} });
      pendingMeta = null;
      continue;
    }

    if (type === 'TEXT' || type === 'MTEXT') {
      const layer = group.find((entry) => entry.code === '8')?.value || '0';
      const textValue = group.find((entry) => entry.code === '1')?.value || '';
      const x = Number(group.find((entry) => entry.code === '10')?.value);
      const y = Number(group.find((entry) => entry.code === '20')?.value);
      entities.push({
        type,
        layer,
        text: textValue.trim(),
        position: [Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0],
        meta: pendingMeta || {}
      });
      pendingMeta = null;
    }
  }

  return entities;
}

function polygonCenter(points) {
  let x = 0;
  let y = 0;
  points.forEach((point) => {
    x += point[0];
    y += point[1];
  });
  return [x / points.length, y / points.length];
}

function polygonArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum / 2);
}

function boundsFor(points) {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys)
  };
}

function pointInPolygon(point, polygon) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersects = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-9) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function closestLabel(polyline, labels) {
  const center = polygonCenter(polyline.points);
  const inside = labels.find((label) => pointInPolygon(label.position, polyline.points));
  if (inside) return inside;
  return labels
    .map((label) => ({ label, distance: Math.hypot(label.position[0] - center[0], label.position[1] - center[1]) }))
    .sort((a, b) => a.distance - b.distance)[0]?.label || null;
}

function convertFloor(config, sourceFloor) {
  if (!fs.existsSync(config.source)) {
    throw new Error(`Missing clean DXF: ${path.relative(ROOT, config.source)}`);
  }

  const sourceRoomsByNumber = new Map(
    (sourceFloor?.rooms || [])
      .filter((entry) => entry.plannedRoomNumber)
      .map((entry) => [entry.plannedRoomNumber, entry])
  );

  const entities = parseEntities(fs.readFileSync(config.source, 'utf8'));
  const roomLabels = entities.filter((entry) => entry.layer === 'ROOM_LABELS' && entry.text);

  const roomPolylines = entities
    .filter((entry) => entry.layer === 'ROOMS' && entry.closed && entry.points.length >= 3)
    .filter((entry) => polygonArea(entry.points) > 100);

  const rooms = roomPolylines.map((entry, index) => {
    const label = closestLabel(entry, roomLabels);
    const roomNumber = entry.meta.roomNumber || label?.text || `clean-${index + 1}`;
    const source = sourceRoomsByNumber.get(roomNumber);
    return {
      id: entry.meta.id || `${config.floorId}-${slug(roomNumber)}`,
      label: entry.meta.label || source?.label || `Room ${roomNumber}`,
      kind: entry.meta.kind || source?.kind || 'Classroom',
      roomNumber,
      plannedRoomNumber: roomNumber,
      polygon: entry.points,
      height: source?.height ?? 0.08,
      selectable: true,
      importance: entry.meta.importance || source?.importance || 'normal'
    };
  });

  const hallways = entities
    .filter((entry) => entry.layer === 'HALLWAYS' && entry.closed && entry.points.length >= 3)
    .map((entry, index) => ({
      id: entry.meta.id || `${config.floorId}-hallway-${index + 1}`,
      label: entry.meta.label || `Hallway ${index + 1}`,
      kind: 'Hallway',
      polygon: entry.points,
      height: 0.035,
      selectable: true
    }));

  const stairs = entities
    .filter((entry) => entry.layer === 'STAIRS' && entry.closed && entry.points.length >= 3)
    .map((entry, index) => {
      const bounds = boundsFor(entry.points);
      return {
        id: entry.meta.id || `${config.floorId}-stair-${index + 1}`,
        label: entry.meta.label || `Stair ${index + 1}`,
        polygon: entry.points,
        position: polygonCenter(entry.points),
        size: [bounds.maxX - bounds.minX, bounds.maxY - bounds.minY],
        rotation: 0,
        treads: entry.meta.treads || 8
      };
    });

  const labels = roomLabels.map((entry, index) => {
    const room = rooms.find((candidate) => candidate.roomNumber === entry.text);
    return {
      id: entry.meta.id || `${config.floorId}-label-${slug(entry.text)}-${index + 1}`,
      label: entry.text,
      roomId: entry.meta.roomId || room?.id || null,
      position: entry.position,
      minZoom: room?.importance === 'major' ? 0.28 : 0.54,
      importance: room?.importance || 'normal'
    };
  });

  return {
    floorId: config.floorId,
    source: path.relative(ROOT, config.source),
    generatedBy: 'scripts/convert-clean-dxf-to-map.js',
    rooms,
    hallways,
    walls: entities
      .filter((entry) => entry.layer === 'WALLS' && entry.points.length >= 2)
      .map((entry, index) => ({
        id: entry.meta.id || `${config.floorId}-wall-${index + 1}`,
        points: entry.points,
        closed: entry.closed,
        thickness: 8,
        height: 18
      })),
    stairs,
    labels
  };
}

function main() {
  const floors = loadCampusMapData();
  fs.mkdirSync(OUT_ROOT, { recursive: true });

  FLOOR_INPUTS.forEach((config) => {
    const floor = floors.find((entry) => entry.id === config.floorId);
    const payload = convertFloor(config, floor);
    fs.writeFileSync(config.output, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`Converted ${path.relative(ROOT, config.source)} -> ${path.relative(ROOT, config.output)}`);
  });
}

main();

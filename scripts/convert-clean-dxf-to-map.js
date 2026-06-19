#!/usr/bin/env node

/**
 * Converts clean, layer-based campus map DXF files into website geometry JSON.
 *
 * The cleaned CAD drawing is the semantic source of truth. Reference underlays
 * remain available for debugging in AutoCAD, but are intentionally excluded
 * from the runtime map payload.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOT = path.join(ROOT, 'cad', 'campus-map-workspace', 'sources');
const OUT_ROOT = path.join(ROOT, 'public', 'maps', 'clean');

const FLOOR_INPUTS = [
  {
    floorId: 'basement',
    source: path.join(SOURCE_ROOT, 'basement-clean.dxf'),
    output: path.join(OUT_ROOT, 'basement-clean.json'),
    targetMaxDimension: 1450
  },
  {
    floorId: 'floor-1',
    source: path.join(SOURCE_ROOT, 'gatorfloor1academic.dxf'),
    output: path.join(OUT_ROOT, 'floor-1-clean.json'),
    targetMaxDimension: 1450
  },
  {
    floorId: 'floor-2',
    source: path.join(SOURCE_ROOT, 'floor-2-clean.dxf'),
    output: path.join(OUT_ROOT, 'floor-2-clean.json'),
    targetMaxDimension: 1450
  },
  {
    floorId: 'floor-3',
    source: path.join(SOURCE_ROOT, 'floor-3-clean.dxf'),
    output: path.join(OUT_ROOT, 'floor-3-clean.json'),
    targetMaxDimension: 1450
  }
];

const LAYER_ALIASES = {
  rooms: new Set(['rooms']),
  labels: new Set(['labels room numbers', 'room labels', 'labels room', 'label text']),
  hallways: new Set(['hallways']),
  stairs: new Set(['stairs']),
  walls: new Set(['walls']),
  reference: new Set(['reference underlay', 'reference strokes', 'reference base'])
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

function slug(value) {
  return String(value || 'entry')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'entry';
}

function normalizeLayerName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function layerKind(layer) {
  const normalized = normalizeLayerName(layer);
  return Object.entries(LAYER_ALIASES).find(([, aliases]) => aliases.has(normalized))?.[0] || null;
}

function isLayer(entry, kind) {
  return layerKind(entry.layer) === kind;
}

function cleanText(value) {
  return String(value || '')
    .replace(/\^J/g, ' ')
    .replace(/\\P/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\\[A-Za-z0-9.;|~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
      entities.push({ type, layer, closed, points: simplifyPoints(points), meta: pendingMeta || {} });
      pendingMeta = null;
      continue;
    }

    if (type === 'LINE') {
      const layer = group.find((entry) => entry.code === '8')?.value || '0';
      const x1 = Number(group.find((entry) => entry.code === '10')?.value);
      const y1 = Number(group.find((entry) => entry.code === '20')?.value);
      const x2 = Number(group.find((entry) => entry.code === '11')?.value);
      const y2 = Number(group.find((entry) => entry.code === '21')?.value);
      const points = [
        [x1, y1],
        [x2, y2]
      ].filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
      entities.push({ type, layer, closed: false, points, meta: pendingMeta || {} });
      pendingMeta = null;
      continue;
    }

    if (type === 'TEXT' || type === 'MTEXT') {
      const layer = group.find((entry) => entry.code === '8')?.value || '0';
      const textValue = group
        .filter((entry) => entry.code === '1' || entry.code === '3')
        .map((entry) => entry.value)
        .join('');
      const x = Number(group.find((entry) => entry.code === '10')?.value);
      const y = Number(group.find((entry) => entry.code === '20')?.value);
      entities.push({
        type,
        layer,
        text: cleanText(textValue),
        position: [Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0],
        meta: pendingMeta || {}
      });
      pendingMeta = null;
    }
  }

  return entities;
}

function simplifyPoints(points) {
  const result = [];
  points.forEach((point) => {
    const previous = result[result.length - 1];
    if (!previous || Math.hypot(previous[0] - point[0], previous[1] - point[1]) > 1e-7) {
      result.push(point);
    }
  });

  if (result.length > 2) {
    const first = result[0];
    const last = result[result.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= 1e-7) result.pop();
  }

  return result;
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

function mergeBounds(bounds) {
  return bounds.reduce((acc, entry) => ({
    minX: Math.min(acc.minX, entry.minX),
    minY: Math.min(acc.minY, entry.minY),
    maxX: Math.max(acc.maxX, entry.maxX),
    maxY: Math.max(acc.maxY, entry.maxY)
  }), {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity
  });
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

function createTransform(rawBounds, targetMaxDimension = 1450) {
  const width = Math.max(1, rawBounds.maxX - rawBounds.minX);
  const height = Math.max(1, rawBounds.maxY - rawBounds.minY);
  const scale = targetMaxDimension / Math.max(width, height);
  const centerX = (rawBounds.minX + rawBounds.maxX) / 2;
  const centerY = (rawBounds.minY + rawBounds.maxY) / 2;
  return {
    scale,
    center: [centerX, centerY],
    point(point) {
      return [
        Number(((point[0] - centerX) * scale).toFixed(3)),
        Number(((centerY - point[1]) * scale).toFixed(3))
      ];
    }
  };
}

function classifyRoom(labelText) {
  const value = labelText.toLowerCase();
  if (value.includes('office')) return 'Office';
  if (value.includes('gym') || value.includes('auditorium') || value.includes('cafeteria')) return 'Major zone';
  if (/[a-z]/i.test(labelText) && !/^\d/.test(labelText)) return 'Named space';
  return 'Classroom';
}

function roomDisplayLabel(roomNumber, kind) {
  if (!roomNumber) return 'Campus space';
  if (kind === 'Named space' || kind === 'Office' || kind === 'Major zone') return roomNumber;
  return `Room ${roomNumber}`;
}

function labelsInside(polyline, labels) {
  return labels.filter((label) => pointInPolygon(label.position, polyline.points));
}

function closestPolylineForLabel(label, polylines) {
  const inside = polylines.find((entry) => pointInPolygon(label.position, entry.points));
  if (inside) return inside;
  return polylines
    .map((entry) => {
      const center = polygonCenter(entry.points);
      return { entry, distance: Math.hypot(label.position[0] - center[0], label.position[1] - center[1]) };
    })
    .sort((a, b) => a.distance - b.distance)[0]?.entry || null;
}

function toRenderablePolyline(entry, transform) {
  return {
    ...entry,
    rawPoints: entry.points,
    polygon: entry.points.map((point) => transform.point(point)),
    area: polygonArea(entry.points)
  };
}

function prepareSemanticPolyline(entry, kind, warnings) {
  if (!entry.points || entry.points.length < 3) {
    warnings.push({
      type: 'skipped-open-line',
      layer: entry.layer,
      kind,
      entityType: entry.type,
      pointCount: entry.points?.length || 0
    });
    return null;
  }

  if (entry.closed) return entry;

  if (entry.type === 'LWPOLYLINE') {
    warnings.push({
      type: 'auto-closed-polyline',
      layer: entry.layer,
      kind,
      entityType: entry.type,
      pointCount: entry.points.length
    });
    return { ...entry, closed: true, autoClosed: true };
  }

  warnings.push({
    type: 'skipped-open-line',
    layer: entry.layer,
    kind,
    entityType: entry.type,
    pointCount: entry.points.length
  });
  return null;
}

function semanticPolylinesFor(entities, kind, warnings) {
  return entities
    .filter((entry) => isLayer(entry, kind))
    .map((entry) => prepareSemanticPolyline(entry, kind, warnings))
    .filter(Boolean);
}

function convertDxfToFloor(config) {
  if (!fs.existsSync(config.source)) {
    throw new Error(`Missing clean DXF: ${path.relative(ROOT, config.source)}`);
  }

  const sourceFloor = config.sourceFloor || null;
  const sourceRoomsByNumber = new Map(
    (sourceFloor?.rooms || [])
      .filter((entry) => entry.plannedRoomNumber)
      .map((entry) => [entry.plannedRoomNumber, entry])
  );

  const entities = parseEntities(fs.readFileSync(config.source, 'utf8'));
  const warnings = [];

  const roomLabels = entities
    .filter((entry) => isLayer(entry, 'labels') && entry.text)
    .map((entry, index) => ({ ...entry, sortIndex: index }));

  const roomEntries = semanticPolylinesFor(entities, 'rooms', warnings);
  const hallwayEntries = semanticPolylinesFor(entities, 'hallways', warnings);
  const stairEntries = semanticPolylinesFor(entities, 'stairs', warnings);
  const outerOutlineEntries = semanticPolylinesFor(entities, 'walls', warnings);

  const semanticPolylines = [
    ...roomEntries,
    ...hallwayEntries,
    ...stairEntries,
    ...outerOutlineEntries
  ];

  const rawBounds = mergeBounds(semanticPolylines.map((entry) => boundsFor(entry.points)));
  const transform = createTransform(rawBounds, config.targetMaxDimension);

  const roomPolylines = roomEntries
    .map((entry, index) => ({ ...entry, cadIndex: index, area: polygonArea(entry.points) }));

  const renderableRoomPolylines = roomPolylines.filter((entry) => {
    const labels = labelsInside(entry, roomLabels);
    if (entry.area < 0.5) {
      warnings.push({
        type: 'small-room-artifact',
        layer: entry.layer,
        area: Number(entry.area.toFixed(4)),
        cadIndex: entry.cadIndex,
        labels: labels.map((label) => label.text)
      });
    }
    return entry.area > 0.05 || labels.length > 0;
  });

  const rooms = renderableRoomPolylines.map((entry, index) => {
    const labels = labelsInside(entry, roomLabels);
    const primaryLabel = labels[0] || null;
    const roomNumber = cleanText(entry.meta.roomNumber || primaryLabel?.text || `space-${index + 1}`);
    const source = sourceRoomsByNumber.get(roomNumber);
    const kind = entry.meta.kind || source?.kind || classifyRoom(roomNumber);
    const id = entry.meta.id || `${config.floorId}-${slug(roomNumber)}-${index + 1}`;
    return {
      id,
      label: entry.meta.label || source?.label || roomDisplayLabel(roomNumber, kind),
      kind,
      roomNumber,
      plannedRoomNumber: roomNumber,
      polygon: entry.points.map((point) => transform.point(point)),
      rawPolygon: entry.points,
      area: Number(entry.area.toFixed(4)),
      worldArea: Number(polygonArea(entry.points.map((point) => transform.point(point))).toFixed(2)),
      layer: entry.layer,
      autoClosed: Boolean(entry.autoClosed),
      height: source?.height ?? (kind === 'Major zone' ? 0.14 : 0.09),
      selectable: true,
      importance: entry.meta.importance || source?.importance || (kind === 'Major zone' ? 'major' : 'normal')
    };
  });

  const roomByRawPolyline = new Map();
  renderableRoomPolylines.forEach((entry, index) => {
    roomByRawPolyline.set(entry, rooms[index]);
  });

  const hallways = hallwayEntries
    .map((entry, index) => ({ ...entry, cadIndex: index, area: polygonArea(entry.points) }))
    .filter((entry) => {
      if (entry.area <= 0.05) {
        warnings.push({ type: 'small-hallway-artifact', layer: entry.layer, area: Number(entry.area.toFixed(4)), cadIndex: entry.cadIndex });
        return false;
      }
      return true;
    })
    .map((entry, index) => ({
      id: entry.meta.id || `${config.floorId}-hallway-${index + 1}`,
      label: entry.meta.label || `Hallway ${index + 1}`,
      kind: 'Hallway',
      polygon: entry.points.map((point) => transform.point(point)),
      rawPolygon: entry.points,
      area: Number(entry.area.toFixed(4)),
      height: 0.045,
      selectable: true,
      autoClosed: Boolean(entry.autoClosed)
    }));

  const stairs = stairEntries
    .map((entry, index) => {
      const polygon = entry.points.map((point) => transform.point(point));
      const bounds = boundsFor(polygon);
      return {
        id: entry.meta.id || `${config.floorId}-stair-${index + 1}`,
        label: entry.meta.label || `Stair ${index + 1}`,
        polygon,
        rawPolygon: entry.points,
        position: polygonCenter(polygon),
        size: [bounds.maxX - bounds.minX, bounds.maxY - bounds.minY],
        rotation: 0,
        treads: entry.meta.treads || 8,
        autoClosed: Boolean(entry.autoClosed)
      };
    });

  const outerOutlines = outerOutlineEntries
    .map((entry, index) => ({
      id: entry.meta.id || `${config.floorId}-outer-outline-${index + 1}`,
      polygon: entry.points.map((point) => transform.point(point)),
      rawPolygon: entry.points,
      closed: true,
      sourceLayer: entry.layer,
      renderAs: 'outline',
      thickness: 0,
      height: 0,
      area: Number(polygonArea(entry.points).toFixed(4)),
      autoClosed: Boolean(entry.autoClosed)
    }));

  const labels = roomLabels.map((entry, index) => {
    const polyline = closestPolylineForLabel(entry, renderableRoomPolylines);
    const room = polyline ? roomByRawPolyline.get(polyline) : null;
    return {
      id: entry.meta.id || `${config.floorId}-label-${slug(entry.text)}-${index + 1}`,
      label: entry.text,
      roomId: entry.meta.roomId || room?.id || null,
      position: transform.point(entry.position),
      rawPosition: entry.position,
      minZoom: room?.importance === 'major' ? 0.28 : 0.64,
      importance: room?.importance || 'normal'
    };
  });

  const transformedPoints = [
    ...rooms.flatMap((entry) => entry.polygon),
    ...hallways.flatMap((entry) => entry.polygon),
    ...stairs.flatMap((entry) => entry.polygon),
    ...outerOutlines.flatMap((entry) => entry.polygon)
  ];
  const worldBounds = mergeBounds([boundsFor(transformedPoints)]);
  const padding = 90;
  const fallbackFloorShape = [
    [worldBounds.minX - padding, worldBounds.minY - padding],
    [worldBounds.maxX + padding, worldBounds.minY - padding],
    [worldBounds.maxX + padding, worldBounds.maxY + padding],
    [worldBounds.minX - padding, worldBounds.maxY + padding]
  ];

  return {
    floorId: config.floorId,
    source: path.relative(ROOT, config.source),
    generatedBy: 'scripts/convert-clean-dxf-to-map.js',
    coordinateSystem: {
      rawBounds,
      worldBounds,
      scale: transform.scale,
      center: transform.center,
      yAxis: 'cad-y-inverted-to-world-z'
    },
    floorShapes: outerOutlines.length ? outerOutlines.map((entry, index) => ({
      id: `${config.floorId}-cad-plate-${index + 1}`,
      label: index === 0 ? 'Academic floor plate' : `Floor plate ${index + 1}`,
      polygon: entry.polygon
    })) : [{ id: `${config.floorId}-cad-plate`, label: 'Academic floor plate', polygon: fallbackFloorShape }],
    rooms,
    hallways,
    outerOutlines,
    walls: [],
    stairs,
    labels,
    warnings
  };
}

function main() {
  const floors = loadCampusMapData();
  fs.mkdirSync(OUT_ROOT, { recursive: true });

  FLOOR_INPUTS.forEach((config) => {
    const floor = floors.find((entry) => entry.id === config.floorId);
    const payload = convertDxfToFloor({ ...config, sourceFloor: floor });
    fs.writeFileSync(config.output, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`Converted ${path.relative(ROOT, config.source)} -> ${path.relative(ROOT, config.output)}`);
    console.log(`  rooms=${payload.rooms.length} hallways=${payload.hallways.length} stairs=${payload.stairs.length} labels=${payload.labels.length} warnings=${payload.warnings.length}`);
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  convertDxfToFloor,
  parseEntities,
  pointInPolygon,
  polygonArea
};

#!/usr/bin/env node

/**
 * Generates the local CAD workspace for the campus map reconstruction.
 *
 * Inputs are the vectorized SVG floor references already committed under
 * public/maps/. Outputs are AutoCAD-friendly DXF underlays, geometry JSON used
 * by the Three.js map, and a README that documents the manual cleanup workflow.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_MAPS = path.join(ROOT, 'public', 'maps');
const CAD_ROOT = path.join(ROOT, 'cad', 'campus-map-workspace');
const CAD_IMPORTS = path.join(CAD_ROOT, 'imports');
const CAD_AUTOCAD = path.join(CAD_ROOT, 'autocad');
const CAD_MANIFESTS = path.join(CAD_ROOT, 'manifests');
const GEOMETRY_OUT = path.join(PUBLIC_MAPS, 'geometry');

const FLOORS = [
  {
    id: 'basement',
    label: 'Basement',
    sourcePage: 'page-01',
    strokeSvg: 'source/page-01-stroke-lines.svg',
    baseSvg: 'floors/page-01-base-no-labels.svg',
    dxfName: 'basement-reference.dxf'
  },
  {
    id: 'floor-1-main',
    label: 'Floor 1 main',
    sourcePage: 'page-05',
    strokeSvg: 'source/page-05-stroke-lines.svg',
    baseSvg: 'floors/page-05-base-no-labels.svg',
    dxfName: 'floor-1-main-reference.dxf'
  },
  {
    id: 'floor-1-front-wing',
    label: 'Floor 1 front wing',
    sourcePage: 'page-04',
    strokeSvg: 'source/page-04-stroke-lines.svg',
    baseSvg: 'floors/page-04-base-no-labels.svg',
    dxfName: 'floor-1-front-wing-reference.dxf'
  },
  {
    id: 'floor-2',
    label: 'Floor 2',
    sourcePage: 'page-03',
    strokeSvg: 'source/page-03-stroke-lines.svg',
    baseSvg: 'floors/page-03-base-no-labels.svg',
    dxfName: 'floor-2-reference.dxf'
  },
  {
    id: 'floor-3',
    label: 'Floor 3',
    sourcePage: 'page-02',
    strokeSvg: 'source/page-02-stroke-lines.svg',
    baseSvg: 'floors/page-02-base-no-labels.svg',
    dxfName: 'floor-3-reference.dxf'
  }
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function parseViewBox(svgText) {
  const viewBox = svgText.match(/viewBox=["']([^"']+)["']/i)?.[1]
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (viewBox?.length === 4 && viewBox.every(Number.isFinite)) {
    return { minX: viewBox[0], minY: viewBox[1], width: viewBox[2], height: viewBox[3] };
  }

  const width = Number(svgText.match(/\swidth=["']([0-9.]+)/i)?.[1]);
  const height = Number(svgText.match(/\sheight=["']([0-9.]+)/i)?.[1]);
  return {
    minX: 0,
    minY: 0,
    width: Number.isFinite(width) ? width : 1000,
    height: Number.isFinite(height) ? height : 1000
  };
}

function extractPaths(svgText) {
  return [...svgText.matchAll(/<path\b[^>]*\sd=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1])
    .filter(Boolean);
}

function tokenizePath(pathData) {
  return pathData.match(/[MmLlHhVvCcSsQqTtZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
}

function parsePath(pathData) {
  const tokens = tokenizePath(pathData);
  const paths = [];
  let index = 0;
  let command = null;
  let current = [0, 0];
  let start = [0, 0];
  let subpath = [];

  const isCommand = (token) => /^[A-Za-z]$/.test(token);
  const readNumber = () => {
    const value = Number(tokens[index]);
    index += 1;
    return value;
  };
  const readPoint = (relative) => {
    const x = readNumber();
    const y = readNumber();
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return relative ? [current[0] + x, current[1] + y] : [x, y];
  };
  const pushPoint = (point) => {
    if (!point) return;
    const last = subpath[subpath.length - 1];
    if (!last || Math.hypot(last[0] - point[0], last[1] - point[1]) > 0.001) {
      subpath.push(point);
    }
    current = point;
  };
  const finishSubpath = (closed) => {
    if (subpath.length > 1) {
      const first = subpath[0];
      const last = subpath[subpath.length - 1];
      const alreadyClosed = Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.001;
      paths.push({
        points: alreadyClosed ? subpath.slice(0, -1) : subpath.slice(),
        closed: closed || alreadyClosed
      });
    }
    subpath = [];
  };

  while (index < tokens.length) {
    if (isCommand(tokens[index])) {
      command = tokens[index];
      index += 1;
    }
    if (!command) break;

    const relative = command === command.toLowerCase();
    const op = command.toUpperCase();

    if (op === 'M') {
      if (subpath.length) finishSubpath(false);
      const point = readPoint(relative);
      if (!point) break;
      current = point;
      start = point;
      subpath = [point];
      command = relative ? 'l' : 'L';
      continue;
    }

    if (op === 'L') {
      while (index < tokens.length && !isCommand(tokens[index])) {
        pushPoint(readPoint(relative));
      }
      continue;
    }

    if (op === 'H') {
      while (index < tokens.length && !isCommand(tokens[index])) {
        const x = readNumber();
        pushPoint([relative ? current[0] + x : x, current[1]]);
      }
      continue;
    }

    if (op === 'V') {
      while (index < tokens.length && !isCommand(tokens[index])) {
        const y = readNumber();
        pushPoint([current[0], relative ? current[1] + y : y]);
      }
      continue;
    }

    if (op === 'C') {
      while (index < tokens.length && !isCommand(tokens[index])) {
        // Keep the final curve endpoint as a straight approximation for CAD reference.
        readPoint(relative);
        readPoint(relative);
        pushPoint(readPoint(relative));
      }
      continue;
    }

    if (op === 'S' || op === 'Q') {
      while (index < tokens.length && !isCommand(tokens[index])) {
        readPoint(relative);
        pushPoint(readPoint(relative));
      }
      continue;
    }

    if (op === 'T') {
      while (index < tokens.length && !isCommand(tokens[index])) {
        pushPoint(readPoint(relative));
      }
      continue;
    }

    if (op === 'Z') {
      if (subpath.length) {
        const last = subpath[subpath.length - 1];
        if (Math.hypot(last[0] - start[0], last[1] - start[1]) > 0.001) subpath.push(start);
        finishSubpath(true);
      }
      command = null;
      continue;
    }

    while (index < tokens.length && !isCommand(tokens[index])) index += 1;
  }

  if (subpath.length) finishSubpath(false);
  return paths.filter((entry) => entry.points.length >= 2);
}

function polygonArea(points) {
  if (points.length < 3) return 0;
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

function simplifyPoints(points, tolerance = 0.2) {
  const deduped = [];
  for (const point of points) {
    const last = deduped[deduped.length - 1];
    if (!last || Math.hypot(last[0] - point[0], last[1] - point[1]) > tolerance) {
      deduped.push([Number(point[0].toFixed(2)), Number(point[1].toFixed(2))]);
    }
  }

  if (deduped.length > 2) {
    const first = deduped[0];
    const last = deduped[deduped.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= tolerance) deduped.pop();
  }
  return deduped;
}

function parseSvgGeometry(svgFile) {
  const svgText = readText(svgFile);
  const viewBox = parseViewBox(svgText);
  const subpaths = [];
  extractPaths(svgText).forEach((pathData, pathIndex) => {
    parsePath(pathData).forEach((entry, subIndex) => {
      const points = simplifyPoints(entry.points);
      if (points.length < 2) return;
      const area = entry.closed ? polygonArea(points) : 0;
      subpaths.push({
        id: `path-${String(pathIndex + 1).padStart(3, '0')}-${String(subIndex + 1).padStart(2, '0')}`,
        closed: entry.closed,
        area: Number(area.toFixed(2)),
        bounds: boundsFor(points),
        points
      });
    });
  });
  return { viewBox, subpaths };
}

function dxfHeader(layers) {
  const out = [
    '0', 'SECTION', '2', 'HEADER',
    '9', '$ACADVER', '1', 'AC1015',
    '0', 'ENDSEC',
    '0', 'SECTION', '2', 'TABLES',
    '0', 'TABLE', '2', 'LAYER', '70', String(layers.length)
  ];
  layers.forEach((layer) => {
    out.push('0', 'LAYER', '2', layer.name, '70', '0', '62', String(layer.color), '6', 'CONTINUOUS');
  });
  out.push('0', 'ENDTAB', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES');
  return out;
}

function addPolyline(out, layerName, points, closed = false) {
  if (points.length < 2) return;
  out.push('0', 'LWPOLYLINE', '8', layerName, '90', String(points.length), '70', closed ? '1' : '0');
  points.forEach(([x, y]) => {
    out.push('10', String(Number(x.toFixed(3))), '20', String(Number((-y).toFixed(3))));
  });
}

function writeDxf(file, strokeGeometry, baseGeometry) {
  const out = dxfHeader([
    { name: 'REFERENCE_STROKES', color: 8 },
    { name: 'REFERENCE_BASE', color: 252 },
    { name: 'ROOMS', color: 3 },
    { name: 'HALLWAYS', color: 4 },
    { name: 'WALLS', color: 2 },
    { name: 'DOORS', color: 6 },
    { name: 'STAIRS', color: 5 },
    { name: 'ROOM_LABELS', color: 7 },
    { name: 'PLACE_LABELS', color: 30 },
    { name: 'PINS', color: 1 }
  ]);

  strokeGeometry.subpaths.forEach((entry) => addPolyline(out, 'REFERENCE_STROKES', entry.points, entry.closed));
  baseGeometry.subpaths.forEach((entry) => addPolyline(out, 'REFERENCE_BASE', entry.points, entry.closed));
  out.push('0', 'ENDSEC', '0', 'EOF');
  fs.writeFileSync(file, `${out.join('\n')}\n`);
}

function writeAutocadScript() {
  const content = [
    '; Green Level Lost & Found campus map cleanup layers',
    '; Run with the AutoCAD SCRIPT command after opening a generated reference DXF.',
    '-LAYER',
    'M',
    'REFERENCE',
    'C',
    '8',
    'REFERENCE',
    'M',
    'ROOMS',
    'C',
    '3',
    'ROOMS',
    'M',
    'HALLWAYS',
    'C',
    '4',
    'HALLWAYS',
    'M',
    'WALLS',
    'C',
    '2',
    'WALLS',
    'M',
    'DOORS',
    'C',
    '6',
    'DOORS',
    'M',
    'STAIRS',
    'C',
    '5',
    'STAIRS',
    'M',
    'ROOM_LABELS',
    'C',
    '7',
    'ROOM_LABELS',
    'M',
    'PLACE_LABELS',
    'C',
    '30',
    'PLACE_LABELS',
    'M',
    'PINS',
    'C',
    '1',
    'PINS',
    '',
    'ZOOM',
    'E',
    ''
  ].join('\n');
  fs.writeFileSync(path.join(CAD_AUTOCAD, 'setup-campus-map-layers.scr'), content);
}

function writeReadme(manifest) {
  const rows = manifest.floors
    .map((floor) => `| ${floor.label} | \`${floor.dxf}\` | \`${floor.geometry}\` | ${floor.referencePathCount} / ${floor.closedBasePathCount} |`)
    .join('\n');

  const content = `# Campus Map CAD Workspace

This folder is generated by \`npm run map:cad\`.

The DXF files in \`imports/\` are AutoCAD-ready reference drawings generated from the vectorized SVG floor plans. They are **not** the final map geometry. Use them as locked reference layers while tracing clean closed room and hallway polylines.

## Generated Floors

| Floor | AutoCAD Reference | Website CAD Detail JSON | Stroke / Closed Base Paths |
| --- | --- | --- | --- |
${rows}

## AutoCAD Cleanup Workflow

1. Open AutoCAD 2027 for Mac.
2. Open a DXF from \`imports/\`.
3. Run \`SCRIPT\` and choose \`autocad/setup-campus-map-layers.scr\`.
4. Lock or visually dim \`REFERENCE_STROKES\` and \`REFERENCE_BASE\`.
5. Trace each room as one closed polyline on \`ROOMS\`.
6. Trace hallways as closed polylines on \`HALLWAYS\`.
7. Trace stair blocks and treads on \`STAIRS\`.
8. Add room numbers as typed text on \`ROOM_LABELS\`.
9. Validate each room/hallway with Properties or \`HATCH\`; hatch should not leak outside the intended area.
10. Save the cleaned drawing as a DWG and export a cleaned DXF.

## Website Pipeline

The generated JSON files under \`public/maps/geometry/\` are used by the current Three.js map as raised CAD-detail geometry. After manual AutoCAD cleanup, replace the generated reference JSON with exported clean room/hall/stair geometry.

## Privacy Note

Keep this workflow local. Do not upload detailed school plans to third-party vectorization or CAD services unless the school explicitly approves it.
`;

  fs.writeFileSync(path.join(CAD_ROOT, 'README.md'), content);
}

function writeManifest(manifest) {
  fs.writeFileSync(path.join(CAD_MANIFESTS, 'workspace-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function writeGeometryJson(file, floor, baseGeometry) {
  const closed = baseGeometry.subpaths
    .filter((entry) => entry.closed && entry.points.length >= 3 && entry.area >= 8)
    .map((entry) => ({
      id: `${floor.id}-${entry.id}`,
      sourcePathId: entry.id,
      area: entry.area,
      bounds: entry.bounds,
      points: entry.points
    }));

  const payload = {
    id: floor.id,
    label: floor.label,
    sourcePage: floor.sourcePage,
    generatedAt: new Date().toISOString(),
    viewBox: baseGeometry.viewBox,
    polygons: closed
  };
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

function main() {
  ensureDir(CAD_IMPORTS);
  ensureDir(CAD_AUTOCAD);
  ensureDir(CAD_MANIFESTS);
  ensureDir(GEOMETRY_OUT);

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: 'existing vectorized SVG floor plans',
    floors: []
  };

  FLOORS.forEach((floor) => {
    const strokePath = path.join(PUBLIC_MAPS, floor.strokeSvg);
    const basePath = path.join(PUBLIC_MAPS, floor.baseSvg);
    if (!fs.existsSync(strokePath)) throw new Error(`Missing stroke SVG: ${strokePath}`);
    if (!fs.existsSync(basePath)) throw new Error(`Missing base SVG: ${basePath}`);

    const strokeGeometry = parseSvgGeometry(strokePath);
    const baseGeometry = parseSvgGeometry(basePath);
    const dxfPath = path.join(CAD_IMPORTS, floor.dxfName);
    const geometryName = `${floor.id}-cad-detail.json`;
    const geometryPath = path.join(GEOMETRY_OUT, geometryName);

    writeDxf(dxfPath, strokeGeometry, baseGeometry);
    const geometry = writeGeometryJson(geometryPath, floor, baseGeometry);

    manifest.floors.push({
      id: floor.id,
      label: floor.label,
      dxf: path.relative(CAD_ROOT, dxfPath),
      geometry: path.relative(ROOT, geometryPath),
      strokeSvg: floor.strokeSvg,
      baseSvg: floor.baseSvg,
      viewBox: baseGeometry.viewBox,
      referencePathCount: strokeGeometry.subpaths.length,
      closedBasePathCount: geometry.polygons.length
    });
  });

  writeAutocadScript();
  writeManifest(manifest);
  writeReadme(manifest);
  console.log(`Generated ${manifest.floors.length} CAD reference drawings in ${path.relative(ROOT, CAD_ROOT)}`);
}

main();

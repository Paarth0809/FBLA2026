// Campus map world renderer: turns cleaned AutoCAD/DXF geometry into an
// interactive Three.js miniature with WebGPU when available and WebGL fallback
// for judge-day reliability.
import * as THREE from '/vendor/three/build/three.webgpu.js';
import { WebGLRenderer } from '/vendor/three/build/three.module.js';
import { gsap } from '/vendor/gsap/index.js';

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEBUG = new URLSearchParams(window.location.search).has('mapDebug');
const DEBUG_DEPTH = new URLSearchParams(window.location.search).has('mapDepthDebug');
const WEBGPU_INIT_TIMEOUT_MS = 1800;
const DRAG_PAN_THRESHOLD = 8;

const CAMERA_PRESETS = {
  // Camera presets are expressed as target-relative offsets so view changes can
  // animate smoothly without rebuilding the scene or swapping controls.
  iso: { x: -760, y: 640, z: 980, zoomBoost: 1 },
  top: { x: 0, y: 1260, z: 0.01, zoomBoost: 1.08 },
  roomFocus: { x: 78, y: 1240, z: 172, zoomBoost: 1.08 },
  left: { x: -1180, y: 470, z: 0.01, zoomBoost: 0.92 },
  right: { x: 1180, y: 470, z: 0.01, zoomBoost: 0.92 },
  front: { x: 0.01, y: 470, z: 1180, zoomBoost: 0.92 },
  back: { x: 0.01, y: 470, z: -1180, zoomBoost: 0.92 }
};

const DEPTH_PRESET = {
  // Depth values are intentionally centralized: the same CAD polygons can read
  // as floors, hallways, walls, or selected rooms by changing visual language
  // instead of mutating the source geometry.
  floorPlate: 4,
  hallway: 24,
  room: 84,
  major: 128,
  wall: 92,
  roomFloor: 9,
  hallwayFloor: 7,
  roomWall: 78,
  majorWall: 112,
  hallwayWall: 24,
  roomWallThickness: 3.8,
  hallwayWallThickness: 2.4,
  stairBase: 18,
  hoverLiftRoom: 22,
  hoverLiftHallway: 8,
  selectedLiftRoom: 30,
  selectedLiftHallway: 13,
  hoverLiftStair: 20,
  rimHeight: 2.2,
  rimThickness: 2.2,
  hallwayRimHeight: 1.6,
  hallwayRimThickness: 1.4,
  outerSeamHeight: 3,
  outerSeamThickness: 1.8
};

const COLORS = {
  // Pale blue architectural palette inspired by the VECTR reference while
  // retaining Green Level's emerald accents for active room states.
  floor: 0xe4f3fc,
  floorEdge: 0xaed0e4,
  hallway: 0xd9f1fb,
  hallwayEdge: 0x91bfd9,
  room: 0xf1f5f8,
  roomHover: 0xffffff,
  roomSelected: 0xe3fff6,
  wall: 0xc6d7e2,
  wallTop: 0xf4f8fb,
  connector: 0x8fdcff,
  stair: 0xf2f9ff,
  stairTread: 0x93b8d2,
  ink: 0x16251d,
  blueprint: 0x19364b,
  route: 0x8fdcff,
  routeHot: 0xff7d78
};

const WALL_LIGHT_DIRECTION = { x: -0.66, z: 0.75 };

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function epsilon(value) {
  return Math.abs(value) < 1e-10 ? 0 : value;
}

// CSS matrix conversion adapted from the ISC-licensed three-viewcube approach.
function getCameraCSSMatrix(matrix) {
  const elements = matrix.elements;
  return `matrix3d(${epsilon(elements[0])},${epsilon(-elements[1])},${epsilon(elements[2])},0,${epsilon(elements[4])},${epsilon(-elements[5])},${epsilon(elements[6])},0,${epsilon(elements[8])},${epsilon(-elements[9])},${epsilon(elements[10])},0,0,0,0,1)`;
}

function getViewCubeTransform(cameraRig) {
  const yaw = Math.atan2(cameraRig.x, cameraRig.z) * THREE.MathUtils.RAD2DEG;
  const horizontal = Math.hypot(cameraRig.x, cameraRig.z);
  const pitchFromTop = Math.atan2(horizontal, Math.max(1, cameraRig.y)) * THREE.MathUtils.RAD2DEG;
  const cubePitch = -clamp(68 - pitchFromTop * 0.5, 30, 68);
  return `rotateX(${cubePitch.toFixed(2)}deg) rotateY(${(-yaw).toFixed(2)}deg)`;
}

function normalizeWheelZoomFactor(event) {
  // Trackpads can emit huge pixel deltas. Bounding the exponential factor keeps
  // pinch/scroll zoom anchored and prevents the map from launching away.
  const modeMultiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
  const delta = clamp(event.deltaY * modeMultiplier, -180, 180);
  return clamp(Math.exp(-delta * 0.0019), 0.78, 1.28);
}

function polygonCenter(polygon) {
  const sum = polygon.reduce((acc, [x, z]) => {
    acc.x += x;
    acc.z += z;
    return acc;
  }, { x: 0, z: 0 });
  return { x: sum.x / polygon.length, z: sum.z / polygon.length };
}

function polygonBounds(polygon) {
  return polygon.reduce((bounds, [x, z]) => ({
    minX: Math.min(bounds.minX, x),
    maxX: Math.max(bounds.maxX, x),
    minZ: Math.min(bounds.minZ, z),
    maxZ: Math.max(bounds.maxZ, z)
  }), {
    minX: Infinity,
    maxX: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity
  });
}

function polygonSignedArea(polygon) {
  let area = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const [x1, z1] = polygon[i];
    const [x2, z2] = polygon[(i + 1) % polygon.length];
    area += x1 * z2 - x2 * z1;
  }
  return area / 2;
}

function polygonTopGeometry(polygon) {
  const points = polygon.map(([x, z]) => new THREE.Vector2(x, z));
  const triangles = THREE.ShapeUtils.triangulateShape(points, []);
  const vertices = [];
  const normals = [];
  const uvs = [];

  points.forEach((point) => {
    vertices.push(point.x, 0, point.y);
    normals.push(0, 1, 0);
    uvs.push(point.x * 0.001, point.y * 0.001);
  });

  const indices = [];
  triangles.forEach((tri) => {
    indices.push(tri[0], tri[1], tri[2]);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function extrudedPolygonGeometry(polygon, options = {}) {
  const {
    depth = 18,
    bevelSize = 2,
    bevelThickness = 1.8,
    bevelSegments = 2
  } = options;

  const clean = polygon
    .filter(([x, z]) => Number.isFinite(x) && Number.isFinite(z))
    .map(([x, z]) => [x, z]);
  if (clean.length < 3) return polygonTopGeometry(clean);

  const bounds = polygonBounds(clean);
  const smallestSide = Math.max(1, Math.min(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ));
  const resolvedBevel = Math.max(0, Math.min(bevelSize, smallestSide * 0.08));
  const resolvedThickness = Math.max(0, Math.min(bevelThickness, resolvedBevel * 0.9));
  const points = clean.map(([x, z]) => new THREE.Vector2(x, z));
  const ordered = polygonSignedArea(clean) < 0 ? points.reverse() : points;

  const shape = new THREE.Shape();
  shape.moveTo(ordered[0].x, ordered[0].y);
  for (let i = 1; i < ordered.length; i += 1) {
    shape.lineTo(ordered[i].x, ordered[i].y);
  }
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    bevelEnabled: resolvedBevel > 0,
    bevelSize: resolvedBevel,
    bevelThickness: resolvedThickness,
    bevelSegments,
    bevelOffset: 0,
    curveSegments: 1
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, depth, 0);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createRoomHitTargetGeometry(polygon, height) {
  return extrudedPolygonGeometry(polygon, {
    depth: Math.max(1, height),
    bevelSize: 0,
    bevelThickness: 0,
    bevelSegments: 0
  });
}

function createOutlineSegments(polygon, y, color = 0x9ab8c9, opacity = 0.34) {
  const positions = [];
  polygon.forEach((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    positions.push(point[0], y, point[1], next[0], y, next[1]);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false
  });
  const line = new THREE.LineSegments(geometry, material);
  line.renderOrder = 20;
  return line;
}

function createPolygonShadowMesh(polygon, material, offset = { x: 10, z: 14 }, y = 0.4) {
  const shadow = new THREE.Mesh(polygonTopGeometry(polygon), material);
  shadow.position.set(offset.x, y, offset.z);
  shadow.renderOrder = -1;
  shadow.receiveShadow = false;
  shadow.frustumCulled = false;
  return shadow;
}

function createWallBetween(a, b, thickness, height, material, y = 0) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.max(1, Math.hypot(dx, dz));
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, height, thickness), material);
  mesh.position.set((a[0] + b[0]) / 2, y + height / 2, (a[1] + b[1]) / 2);
  mesh.rotation.y = -Math.atan2(dz, dx);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

function wallShadeForSegment(a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.max(1, Math.hypot(dx, dz));
  const normalX = -dz / length;
  const normalZ = dx / length;
  return clamp(normalX * WALL_LIGHT_DIRECTION.x + normalZ * WALL_LIGHT_DIRECTION.z, -1, 1);
}

function createWallEdgeLines(a, b, height, y, color = 0x7aa5bc, opacity = 0.32) {
  const positions = [
    a[0], y, a[1], a[0], y + height, a[1],
    b[0], y, b[1], b[0], y + height, b[1]
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.renderOrder = 24;
  return lines;
}

function createPerimeterRails(polygon, options) {
  const group = new THREE.Group();
  const {
    y,
    height,
    thickness,
    material,
    colorLine,
    lineOpacity
  } = options;

  polygon.forEach((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    const rail = createWallBetween(point, next, thickness, height, material, y);
    rail.renderOrder = 18;
    rail.castShadow = true;
    group.add(rail);
  });

  const highlight = createOutlineSegments(polygon, y + height + 0.25, colorLine, lineOpacity);
  highlight.renderOrder = 22;
  group.add(highlight);
  return group;
}

function createLowBoundarySeam(polygon, material) {
  return createPerimeterRails(polygon, {
    y: -8,
    height: DEPTH_PRESET.outerSeamHeight,
    thickness: DEPTH_PRESET.outerSeamThickness,
    material,
    colorLine: 0x87b7d1,
    lineOpacity: 0.28
  });
}

function makeMaterial(options) {
  return new THREE.MeshPhysicalMaterial({
    roughness: 0.58,
    metalness: 0.0,
    clearcoat: 0.28,
    clearcoatRoughness: 0.68,
    ...options
  });
}

function buildStudioEnvironment() {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#f6fcff');
  sky.addColorStop(0.28, '#e4f2fb');
  sky.addColorStop(0.48, '#ffffff');
  sky.addColorStop(0.62, '#d7eefc');
  sky.addColorStop(1, '#bdd6e8');
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  context.globalCompositeOperation = 'screen';
  context.fillStyle = 'rgba(255,255,255,0.52)';
  context.fillRect(0, height * 0.45, width, 18);
  context.fillStyle = 'rgba(143,220,255,0.34)';
  context.fillRect(0, height * 0.25, width, 8);
  context.fillStyle = 'rgba(255,255,255,0.42)';
  context.fillRect(0, height * 0.66, width, 7);
  context.globalCompositeOperation = 'source-over';

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createTextLabel(text, className) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className;
  el.textContent = text;
  el.setAttribute('aria-label', text);
  return el;
}

function createPassiveLabel(text, className) {
  const el = document.createElement('span');
  el.className = className;
  el.textContent = text;
  el.setAttribute('aria-hidden', 'true');
  return el;
}

function timeoutAfter(ms, message) {
  return new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error(message)), ms);
  });
}

function parseSvgViewBox(svgText) {
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

function extractSvgPathData(svgText) {
  return [...svgText.matchAll(/<path\b[^>]*\sd=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1])
    .filter(Boolean);
}

function mapSvgToWorld(svgX, svgY, viewBox, frame) {
  const xNorm = (svgX - viewBox.minX) / viewBox.width;
  const yNorm = (svgY - viewBox.minY) / viewBox.height;
  return [
    frame.x + xNorm * frame.width,
    frame.z + yNorm * frame.depth
  ];
}

function parsePathToSegments(pathData, viewBox, frame, elevation) {
  const tokens = pathData.match(/[MmLlZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  const positions = [];
  let index = 0;
  let command = null;
  let current = [0, 0];
  let start = [0, 0];

  const isCommand = (token) => /^[A-Za-z]$/.test(token);
  const readPoint = (relative) => {
    const x = Number(tokens[index]);
    const y = Number(tokens[index + 1]);
    index += 2;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return relative ? [current[0] + x, current[1] + y] : [x, y];
  };
  const addSegment = (from, to) => {
    const [x1, z1] = mapSvgToWorld(from[0], from[1], viewBox, frame);
    const [x2, z2] = mapSvgToWorld(to[0], to[1], viewBox, frame);
    positions.push(x1, elevation, z1, x2, elevation, z2);
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
      const point = readPoint(relative);
      if (!point) break;
      current = point;
      start = point;
      command = relative ? 'l' : 'L';
      while (index < tokens.length && !isCommand(tokens[index])) {
        const next = readPoint(relative);
        if (!next) break;
        addSegment(current, next);
        current = next;
      }
    } else if (op === 'L') {
      while (index < tokens.length && !isCommand(tokens[index])) {
        const next = readPoint(relative);
        if (!next) break;
        addSegment(current, next);
        current = next;
      }
    } else if (op === 'Z') {
      addSegment(current, start);
      current = start;
      command = null;
    } else {
      while (index < tokens.length && !isCommand(tokens[index])) index += 1;
    }
  }

  return positions;
}

export class CampusMapWorld {
  constructor(options) {
    this.canvas = options.canvas;
    this.labelLayer = options.labelLayer;
    this.blueprintLayer = options.blueprintLayer;
    this.onSelect = options.onSelect || (() => {});
    this.onHover = options.onHover || (() => {});
    this.onReady = options.onReady || (() => {});
    this.onFocusChange = options.onFocusChange || (() => {});
    this.onFrame = options.onFrame || (() => {});
    this.viewCube = options.viewCube || document.getElementById('campus-view-cube');
    this.viewCubeCore = options.viewCubeCore || document.getElementById('campus-view-cube-core');

    this.scene = new THREE.Scene();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2(100, 100);
    this.target = new THREE.Vector3();
    this.cameraTarget = new THREE.Vector3();
    this.drag = null;
    this.activeFloor = null;
    this.activeFloorGroup = null;
    this.hovered = null;
    this.selected = null;
    this.labels = new Map();
    this.interactive = [];
    this.roomHitTargets = [];
    this.roomGroups = new Map();
    this.stairGroups = new Map();
    this.walls = [];
    this.detailCache = new Map();
    this.detailLoadToken = 0;
    this.depthEnabled = true;
    this.blueprintVisible = DEBUG;
    this.disposed = false;
    this.rendererReady = null;
    this.rendererInitialized = false;
    this.renderer = null;
    this.rendererLabel = navigator.gpu ? 'Three.js WebGPU renderer' : 'Three.js WebGL renderer';
    this.cameraTween = null;
    this.lastFrameTime = performance.now();
    this.cameraRig = { x: -760, y: 640, z: 980 };
    this.focusMode = null;
    this.lastHoverSeenAt = 0;
    this.hoverGraceMs = 90;

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1200, 1800);
    this.camera.zoom = 1;

    this.materials = {
      worldBase: makeMaterial({ color: 0xe2f3fd, roughness: 0.88, clearcoat: 0.1 }),
      worldSeam: makeMaterial({ color: 0xb3d3e6, roughness: 0.72, clearcoat: 0.16 }),
      floor: makeMaterial({
        color: 0xd2e9f7,
        roughness: 0.84,
        clearcoat: 0.14,
        transparent: true,
        opacity: 0.54
      }),
      floorEdge: makeMaterial({ color: 0x95bed6, roughness: 0.68, clearcoat: 0.18 }),
      hallway: makeMaterial({ color: 0xd5eef9, roughness: 0.54, clearcoat: 0.36 }),
      hallwaySide: makeMaterial({ color: 0x86aec4, roughness: 0.68, clearcoat: 0.16 }),
      hallwayHover: makeMaterial({ color: 0xecfbff, roughness: 0.38, clearcoat: 0.58 }),
      hallwayFloor: makeMaterial({ color: 0xe3f4fb, roughness: 0.54, clearcoat: 0.36 }),
      hallwayWall: makeMaterial({ color: 0xaecfe1, roughness: 0.6, clearcoat: 0.2 }),
      hallwayWallHover: makeMaterial({ color: 0xccecff, roughness: 0.48, clearcoat: 0.3 }),
      hallwayWallTop: makeMaterial({ color: 0xeaf6fb, roughness: 0.48, clearcoat: 0.32 }),
      hallwayWallLight: makeMaterial({ color: 0xd8edf7, roughness: 0.52, clearcoat: 0.28 }),
      hallwayWallMid: makeMaterial({ color: 0xb4d0e0, roughness: 0.62, clearcoat: 0.2 }),
      hallwayWallShade: makeMaterial({ color: 0x7fa5bb, roughness: 0.76, clearcoat: 0.1 }),
      hallwayWallInner: makeMaterial({ color: 0x98b9cc, roughness: 0.7, clearcoat: 0.12 }),
      hallwayWallHoverTop: makeMaterial({ color: 0xffffff, roughness: 0.35, clearcoat: 0.54 }),
      hallwayWallHoverLight: makeMaterial({ color: 0xebf9ff, roughness: 0.42, clearcoat: 0.44 }),
      hallwayWallHoverMid: makeMaterial({ color: 0xd0eafa, roughness: 0.5, clearcoat: 0.34 }),
      hallwayWallHoverShade: makeMaterial({ color: 0xa3cce3, roughness: 0.64, clearcoat: 0.2 }),
      hallwayFloorDim: makeMaterial({ color: 0xd6e7ef, roughness: 0.64, clearcoat: 0.12, transparent: true, opacity: 0.5 }),
      hallwayWallDim: makeMaterial({ color: 0xaac0ca, roughness: 0.72, clearcoat: 0.08, transparent: true, opacity: 0.42 }),
      room: makeMaterial({ color: 0xf1f5f8, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.42 }),
      roomSide: makeMaterial({ color: 0x91adbd, roughness: 0.68, clearcoat: 0.14 }),
      roomHover: makeMaterial({ color: COLORS.roomHover, roughness: 0.28, clearcoat: 0.82, clearcoatRoughness: 0.28 }),
      roomHoverSide: makeMaterial({ color: 0xaed2e6, roughness: 0.54, clearcoat: 0.26 }),
      roomFloor: makeMaterial({ color: 0xf2f6f8, roughness: 0.46, clearcoat: 0.48, clearcoatRoughness: 0.4 }),
      roomFloorHover: makeMaterial({ color: 0xfbfdff, roughness: 0.34, clearcoat: 0.62, clearcoatRoughness: 0.32 }),
      roomWall: makeMaterial({ color: 0xb6c9d5, roughness: 0.62, clearcoat: 0.18 }),
      roomWallHover: makeMaterial({ color: 0xcbe5f4, roughness: 0.46, clearcoat: 0.34 }),
      roomWallTop: makeMaterial({ color: 0xf0f5f8, roughness: 0.5, clearcoat: 0.34 }),
      roomWallLight: makeMaterial({ color: 0xe0ebf2, roughness: 0.52, clearcoat: 0.3 }),
      roomWallMid: makeMaterial({ color: 0xb9ccd8, roughness: 0.64, clearcoat: 0.18 }),
      roomWallShade: makeMaterial({ color: 0x829bad, roughness: 0.8, clearcoat: 0.08 }),
      roomWallInner: makeMaterial({ color: 0xa0b5c2, roughness: 0.72, clearcoat: 0.1 }),
      roomWallHoverTop: makeMaterial({ color: 0xffffff, roughness: 0.28, clearcoat: 0.72 }),
      roomWallHoverLight: makeMaterial({ color: 0xf3fbff, roughness: 0.34, clearcoat: 0.58 }),
      roomWallHoverMid: makeMaterial({ color: 0xd9effb, roughness: 0.46, clearcoat: 0.42 }),
      roomWallHoverShade: makeMaterial({ color: 0xb2d3e7, roughness: 0.62, clearcoat: 0.24 }),
      roomFloorDim: makeMaterial({ color: 0xe7eef2, roughness: 0.7, clearcoat: 0.08, transparent: true, opacity: 0.46 }),
      roomWallDim: makeMaterial({ color: 0xa8bbc7, roughness: 0.78, clearcoat: 0.08, transparent: true, opacity: 0.38 }),
      roomSelected: makeMaterial({
        color: COLORS.roomSelected,
        roughness: 0.26,
        clearcoat: 0.88,
        clearcoatRoughness: 0.24,
        emissive: new THREE.Color(0x6ffbbe),
        emissiveIntensity: 0.055
      }),
      roomSelectedSide: makeMaterial({
        color: 0x67c7ae,
        roughness: 0.38,
        clearcoat: 0.48,
        emissive: new THREE.Color(0x6ffbbe),
        emissiveIntensity: 0.035
      }),
      roomFloorSelected: makeMaterial({
        color: 0xe9fff8,
        roughness: 0.24,
        clearcoat: 0.86,
        clearcoatRoughness: 0.25,
        emissive: new THREE.Color(0x6ffbbe),
        emissiveIntensity: 0.04
      }),
      roomWallSelected: makeMaterial({
        color: 0x83d7c4,
        roughness: 0.34,
        clearcoat: 0.44,
        emissive: new THREE.Color(0x6ffbbe),
        emissiveIntensity: 0.025
      }),
      roomWallSelectedTop: makeMaterial({
        color: 0xf3fffb,
        roughness: 0.24,
        clearcoat: 0.72,
        emissive: new THREE.Color(0x6ffbbe),
        emissiveIntensity: 0.035
      }),
      roomWallSelectedLight: makeMaterial({
        color: 0xc8f4e9,
        roughness: 0.32,
        clearcoat: 0.56,
        emissive: new THREE.Color(0x6ffbbe),
        emissiveIntensity: 0.035
      }),
      roomWallSelectedShade: makeMaterial({
        color: 0x6ec7b3,
        roughness: 0.46,
        clearcoat: 0.36,
        emissive: new THREE.Color(0x6ffbbe),
        emissiveIntensity: 0.025
      }),
      roomRail: makeMaterial({ color: 0xd9ebf6, roughness: 0.42, clearcoat: 0.56 }),
      hallwayRail: makeMaterial({ color: 0x9bc6de, roughness: 0.52, clearcoat: 0.36 }),
      wall: makeMaterial({ color: 0xb7ccd8, roughness: 0.48, clearcoat: 0.36 }),
      wallTall: makeMaterial({ color: 0xe9f5fc, roughness: 0.42, clearcoat: 0.52 }),
      connector: makeMaterial({ color: COLORS.connector, roughness: 0.36, clearcoat: 0.62 }),
      cadDetail: makeMaterial({
        color: 0x6f94aa,
        roughness: 0.58,
        metalness: 0.02
      }),
      stair: makeMaterial({ color: COLORS.stair, roughness: 0.36, clearcoat: 0.62 }),
      stairTread: makeMaterial({ color: COLORS.stairTread, roughness: 0.46, clearcoat: 0.34 }),
      route: makeMaterial({
        color: COLORS.route,
        roughness: 0.35,
        emissive: new THREE.Color(0x56d9ff),
        emissiveIntensity: 0.28,
        transparent: true,
        opacity: 0.72
      }),
      shadow: new THREE.MeshBasicMaterial({
        color: 0x4d7892,
        transparent: true,
        opacity: 0.36,
        depthWrite: false
      })
    };
    this.hitTargetMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide
    });
    this.hitTargetMaterial.colorWrite = false;

    this.setupScene();
    this.bindEvents();
    this.rendererReady = this.initializeRenderer();
    this.animate();
  }

  configureRenderer(renderer) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    if (renderer.shadowMap) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
  }

  async initializeRenderer() {
    const shouldTryWebGPU = Boolean(navigator.gpu && THREE.WebGPURenderer);

    if (shouldTryWebGPU) {
      const webgpuRenderer = new THREE.WebGPURenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: true
      });
      this.configureRenderer(webgpuRenderer);

      try {
        await Promise.race([
          webgpuRenderer.init(),
          timeoutAfter(WEBGPU_INIT_TIMEOUT_MS, 'WebGPU renderer init timed out')
        ]);
        if (this.disposed) {
          webgpuRenderer.dispose();
          return;
        }
        this.renderer = webgpuRenderer;
        this.rendererInitialized = true;
        this.rendererLabel = 'Three.js WebGPU renderer';
        this.resize();
        this.render();
        return;
      } catch (error) {
        if (DEBUG) console.warn(error);
        try {
          webgpuRenderer.dispose();
        } catch {
          // Ignore cleanup errors and continue to the judge-safe renderer.
        }
      }
    }

    const webglRenderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true
    });
    this.configureRenderer(webglRenderer);
    this.renderer = webglRenderer;
    this.rendererInitialized = true;
    this.rendererLabel = shouldTryWebGPU ? 'Three.js WebGL fallback renderer' : 'Three.js WebGL renderer';
    this.resize();
    this.render();
  }

  setupScene() {
    const environment = buildStudioEnvironment();
    this.scene.environment = environment;
    this.scene.background = new THREE.Color(0xeaf6ff);
    this.scene.fog = new THREE.Fog(0xeaf6ff, 2500, 5400);

    const ambient = new THREE.HemisphereLight(0xffffff, 0xa6c3d7, 1.55);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 3.15);
    key.position.set(-680, 980, 760);
    key.castShadow = true;
    if (key.shadow) {
      key.shadow.mapSize.width = 2048;
      key.shadow.mapSize.height = 2048;
      key.shadow.camera.near = 60;
      key.shadow.camera.far = 2600;
      key.shadow.camera.left = -1400;
      key.shadow.camera.right = 1400;
      key.shadow.camera.top = 1400;
      key.shadow.camera.bottom = -1400;
      key.shadow.bias = -0.0002;
    }
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x8fdcff, 1.7);
    rim.position.set(760, 600, -700);
    this.scene.add(rim);

    const blueFill = new THREE.DirectionalLight(0xcbeeff, 0.36);
    blueFill.position.set(120, 280, 720);
    this.scene.add(blueFill);

    const greenFill = new THREE.DirectionalLight(0x6ffbbe, 0.2);
    greenFill.position.set(40, 260, 650);
    this.scene.add(greenFill);
  }

  bindEvents() {
    this.resizeHandler = () => this.resize();
    window.addEventListener('resize', this.resizeHandler);

    this.canvas.addEventListener('pointerdown', (event) => this.handlePointerDown(event));
    this.canvas.addEventListener('pointermove', (event) => this.handlePointerMove(event));
    this.canvas.addEventListener('pointerup', (event) => this.handlePointerUp(event));
    this.canvas.addEventListener('pointercancel', (event) => this.handlePointerCancel(event));
    this.canvas.addEventListener('pointerleave', (event) => this.handlePointerLeave(event));
    this.canvas.addEventListener('lostpointercapture', (event) => this.handleLostPointerCapture(event));
    this.canvas.addEventListener('wheel', (event) => this.handleWheel(event), { passive: false });
    this.canvas.addEventListener('dblclick', (event) => {
      event.preventDefault();
      this.cancelCameraTween();
      this.zoomBy(1.22, { clientX: event.clientX, clientY: event.clientY });
    });
  }

  wallMaterialsForSegment(a, b, isHallway, state = 'base') {
    const shade = wallShadeForSegment(a, b);
    const isLit = shade > 0.2;
    const isShaded = shade < -0.2;

    if (state === 'dim') {
      const material = isHallway ? this.materials.hallwayWallDim : this.materials.roomWallDim;
      return [material, material, material, material, material, material];
    }

    if (state === 'selected') {
      const top = this.materials.roomWallSelectedTop;
      const light = this.materials.roomWallSelectedLight;
      const mid = this.materials.roomWallSelected;
      const shadeMat = this.materials.roomWallSelectedShade;
      const sideA = isLit ? light : isShaded ? shadeMat : mid;
      const sideB = isLit ? shadeMat : isShaded ? light : this.materials.roomSelectedSide;
      return [mid, mid, top, sideB, sideA, sideB];
    }

    const prefix = isHallway ? 'hallwayWall' : 'roomWall';
    const hover = state === 'hover' ? 'Hover' : '';
    const top = this.materials[`${prefix}${hover}Top`] || this.materials[`${prefix}Top`];
    const light = this.materials[`${prefix}${hover}Light`] || this.materials[`${prefix}Light`];
    const mid = this.materials[`${prefix}${hover}Mid`] || this.materials[`${prefix}Mid`];
    const shadeMat = this.materials[`${prefix}${hover}Shade`] || this.materials[`${prefix}Shade`];
    const inner = this.materials[`${prefix}Inner`] || mid;
    const sideA = isLit ? light : isShaded ? shadeMat : mid;
    const sideB = isLit ? shadeMat : isShaded ? light : inner;
    const end = shade > 0 ? mid : inner;
    return [end, end, top, inner, sideA, sideB];
  }

  async resolveFloorGeometry(floor, token) {
    if (!floor.cleanGeometry) return floor;

    try {
      const clean = await this.getCleanGeometrySource(floor.cleanGeometry);
      if (token !== this.detailLoadToken || this.activeFloor?.id !== floor.id) return null;
      return this.normalizeCleanFloor(floor, clean);
    } catch (error) {
      if (DEBUG) console.warn(error);
      return floor;
    }
  }

  async setFloor(floor) {
    await this.rendererReady;
    this.detailLoadToken += 1;
    const detailToken = this.detailLoadToken;
    this.activeFloor = floor;
    this.selected = null;
    this.hovered = null;
    this.focusMode = null;
    this.onFocusChange({ active: false, room: null, floor });
    this.interactive = [];
    this.roomHitTargets = [];
    this.lastHoverSeenAt = 0;
    this.roomGroups.clear();
    this.stairGroups.clear();
    this.walls = [];
    this.clearLabels();

    if (this.activeFloorGroup) {
      this.scene.remove(this.activeFloorGroup);
      this.disposeObject(this.activeFloorGroup);
    }

    this.activeFloorGroup = new THREE.Group();
    this.activeFloorGroup.name = `floor-${floor.id}`;
    this.scene.add(this.activeFloorGroup);

    const renderFloor = await this.resolveFloorGeometry(floor, detailToken);
    if (!renderFloor) return;
    this.activeFloor = renderFloor;

    this.buildFloor(renderFloor);
    this.buildBlueprintLayer(renderFloor);
    this.buildCadDetailGeometry(renderFloor, detailToken);
    this.buildDetailLines(renderFloor, detailToken);
    this.fitFloor(false, { explore: true });
    this.onReady({ floor: renderFloor, renderer: this.rendererLabel });
  }

  buildFloor(floor) {
    this.addWorldBase(floor);
    this.addFloorBoundarySeams(floor);

    if (DEBUG) {
      floor.floorShapes.forEach((shape, index) => {
        const debugMaterial = this.materials.floor.clone();
        debugMaterial.transparent = true;
        debugMaterial.opacity = 0.16;
        const mesh = new THREE.Mesh(extrudedPolygonGeometry(shape.polygon, {
          depth: 2,
          bevelSize: 0,
          bevelThickness: 0,
          bevelSegments: 0
        }), debugMaterial);
        mesh.position.y = -10 - index * 0.006;
        mesh.receiveShadow = false;
        mesh.castShadow = false;
        mesh.userData.isDebugFoundation = true;
        this.activeFloorGroup.add(mesh);
        this.activeFloorGroup.add(createOutlineSegments(shape.polygon, -6.5, 0x8fb0c2, 0.22));
      });
    }

    (floor.connectors || []).forEach((connector) => {
      const group = new THREE.Group();
      group.name = connector.id;
      for (let i = 0; i < connector.points.length - 1; i += 1) {
        const a = connector.points[i];
        const b = connector.points[i + 1];
        const mesh = createWallBetween(a, b, connector.width || 62, 5, this.materials.connector, 0.004);
        mesh.userData.isConnector = true;
        group.add(mesh);
      }
      this.activeFloorGroup.add(group);
    });

    floor.rooms.forEach((entry) => this.addRoom(entry, floor));
    this.addOuterOutlines(floor);
    (floor.walls || [])
      .filter((entry) => entry.renderAs !== 'outline' && (entry.height ?? 0) > 0)
      .forEach((entry) => this.addWallFeature(entry, floor));
    (floor.routeSegments || []).forEach((entry) => this.addRouteSegment(entry));
    (floor.stairs || []).forEach((entry) => this.addStair(entry, floor));
    (floor.roomNumberLabels || []).forEach((entry) => this.addRoomNumberLabel(entry, floor));
    if (DEBUG_DEPTH) this.addDepthDebugHelpers(floor);
  }

  addDepthDebugHelpers(floor) {
    const bounds = floor.bounds;
    if (!bounds) return;
    const width = Math.max(600, bounds.maxX - bounds.minX);
    const depth = Math.max(500, bounds.maxZ - bounds.minZ);
    const helper = new THREE.GridHelper(Math.max(width, depth), 18, 0x4f8ca8, 0xb7d9ea);
    helper.position.set((bounds.minX + bounds.maxX) / 2, 2, (bounds.minZ + bounds.maxZ) / 2);
    helper.material.transparent = true;
    helper.material.opacity = 0.32;
    helper.renderOrder = 40;
    this.activeFloorGroup.add(helper);
    console.info('[mapDepthDebug]', {
      floor: floor.id,
      renderer: this.rendererLabel,
      depths: DEPTH_PRESET,
      camera: { tiltX: -680, tiltZ: 1040, height: 520 }
    });
  }

  addWorldBase(floor) {
    const bounds = floor.bounds;
    if (!bounds) return;
    const padding = 180;
    const width = Math.max(600, bounds.maxX - bounds.minX + padding * 2);
    const depth = Math.max(500, bounds.maxZ - bounds.minZ + padding * 2);
    const base = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), this.materials.worldBase);
    base.rotation.x = -Math.PI / 2;
    base.position.set(
      (bounds.minX + bounds.maxX) / 2,
      -18,
      (bounds.minZ + bounds.maxZ) / 2
    );
    base.name = `${floor.id}-explore-base`;
    base.receiveShadow = true;
    this.activeFloorGroup.add(base);
  }

  addFloorBoundarySeams(floor) {
    const bounds = floor.bounds;
    if (!bounds) return;
    const fallbackPolygon = [
      [bounds.minX, bounds.minZ],
      [bounds.maxX, bounds.minZ],
      [bounds.maxX, bounds.maxZ],
      [bounds.minX, bounds.maxZ]
    ];
    const shapes = floor.floorShapes?.length ? floor.floorShapes : [{ polygon: fallbackPolygon }];

    shapes.forEach((shape, index) => {
      if (!Array.isArray(shape.polygon) || shape.polygon.length < 3) return;
      const seam = createLowBoundarySeam(shape.polygon, this.materials.worldSeam);
      seam.name = `${floor.id}-low-boundary-seam-${index}`;
      seam.children.forEach((child) => {
        child.castShadow = false;
        child.receiveShadow = true;
        child.renderOrder = 4;
      });
      this.activeFloorGroup.add(seam);
    });
  }

  addOuterOutlines(floor) {
    const outlines = floor.outerOutlines || [];
    outlines.forEach((outline, index) => {
      if (!Array.isArray(outline.polygon) || outline.polygon.length < 3) return;
      const group = new THREE.Group();
      group.name = outline.id || `${floor.id}-outer-outline-${index}`;
      group.userData = { type: 'outer-outline', outline, floor };

      const seam = createOutlineSegments(outline.polygon, -5.8, 0x6fa3bf, 0.36);
      seam.name = `${group.name}-seam`;
      seam.renderOrder = 13;
      seam.userData.isOuterOutline = true;
      group.add(seam);

      const glow = createOutlineSegments(outline.polygon, -5.45, 0xc8e5f3, 0.14);
      glow.name = `${group.name}-soft-glow`;
      glow.renderOrder = 12;
      glow.userData.isOuterOutline = true;
      group.add(glow);

      this.activeFloorGroup.add(group);
    });
  }

  addRoom(room, floor) {
    const group = new THREE.Group();
    group.name = room.id;
    group.userData = { type: 'room', room, floor, targetY: 0, currentY: 0 };
    const isHallway = room.kind === 'Hallway';
    const isMajor = room.kind === 'Major zone';
    const floorThickness = isHallway ? DEPTH_PRESET.hallwayFloor : DEPTH_PRESET.roomFloor;
    const wallHeight = isHallway ? DEPTH_PRESET.hallwayWall : isMajor ? DEPTH_PRESET.majorWall : DEPTH_PRESET.roomWall;
    const wallThickness = isHallway ? DEPTH_PRESET.hallwayWallThickness : DEPTH_PRESET.roomWallThickness;
    const slabDepth = floorThickness + wallHeight;
    const bevelSize = isHallway ? 0.9 : isMajor ? 1.9 : 1.5;
    const shadowOpacity = isHallway ? 0.12 : isMajor ? 0.28 : 0.22;
    const baseY = isHallway ? -1.2 : 4.8;
    const floorTopY = baseY + floorThickness;
    const wallTopY = floorTopY + wallHeight;
    const materialSet = isHallway ? {
      floor: [this.materials.hallwayFloor, this.materials.hallwaySide],
      floorHover: [this.materials.hallwayHover, this.materials.hallwaySide],
      floorSelected: [this.materials.roomSelected, this.materials.roomSelectedSide],
      floorDim: [this.materials.hallwayFloorDim, this.materials.hallwayWallDim],
      wall: this.materials.hallwayWall,
      wallHover: this.materials.hallwayWallHover,
      wallSelected: this.materials.roomWallSelected,
      wallDim: this.materials.hallwayWallDim
    } : {
      floor: [this.materials.roomFloor, this.materials.roomSide],
      floorHover: [this.materials.roomFloorHover, this.materials.roomHoverSide],
      floorSelected: [this.materials.roomFloorSelected, this.materials.roomSelectedSide],
      floorDim: [this.materials.roomFloorDim, this.materials.roomWallDim],
      wall: this.materials.roomWall,
      wallHover: this.materials.roomWallHover,
      wallSelected: this.materials.roomWallSelected,
      wallDim: this.materials.roomWallDim
    };
    group.userData.materialSet = materialSet;
    group.userData.slabDepth = slabDepth;
    group.userData.baseY = baseY;
    group.userData.floorTopY = floorTopY;
    group.userData.wallTopY = wallTopY;
    [
      { x: isHallway ? 5 : 10, z: isHallway ? 6 : 12, y: isHallway ? 0.18 : 0.75, opacity: shadowOpacity },
      { x: isHallway ? 10 : 19, z: isHallway ? 13 : 25, y: isHallway ? 0.08 : 0.36, opacity: shadowOpacity * 0.52 },
      { x: isHallway ? -4 : -7, z: isHallway ? 7 : 15, y: isHallway ? 0.05 : 0.22, opacity: shadowOpacity * 0.28 }
    ].forEach((layer) => {
      const shadow = createPolygonShadowMesh(room.polygon, this.materials.shadow, {
        x: layer.x,
        z: layer.z
      }, layer.y);
      shadow.material = this.materials.shadow.clone();
      shadow.material.opacity = layer.opacity;
      this.activeFloorGroup.add(shadow);
    });

    let floorMesh;
    try {
      floorMesh = new THREE.Mesh(extrudedPolygonGeometry(room.polygon, {
        depth: floorThickness,
        bevelSize,
        bevelThickness: isHallway ? 0.45 : 0.8,
        bevelSegments: isHallway ? 1 : 2
      }), materialSet.floor);
    } catch (error) {
      if (DEBUG) console.warn(`Falling back to flat map mesh for ${room.id}`, error);
      floorMesh = new THREE.Mesh(polygonTopGeometry(room.polygon), isHallway ? this.materials.hallwayFloor : this.materials.roomFloor);
      floorMesh.position.y = floorThickness;
    }

    floorMesh.position.y = baseY;
    floorMesh.userData.entity = { type: 'room', room, floor, group };
    floorMesh.userData.mapRole = 'room-floor';
    floorMesh.receiveShadow = true;
    floorMesh.castShadow = true;
    group.add(floorMesh);

    const walls = [];
    const edgeLines = [];
    room.polygon.forEach((point, index) => {
      const next = room.polygon[(index + 1) % room.polygon.length];
      const materialStates = {
        base: this.wallMaterialsForSegment(point, next, isHallway, 'base'),
        hover: this.wallMaterialsForSegment(point, next, isHallway, 'hover'),
        selected: this.wallMaterialsForSegment(point, next, isHallway, 'selected'),
        dim: this.wallMaterialsForSegment(point, next, isHallway, 'dim')
      };
      const wall = createWallBetween(point, next, wallThickness, wallHeight, materialStates.base, floorTopY);
      wall.userData.entity = { type: 'room', room, floor, group };
      wall.userData.mapRole = 'room-wall';
      wall.userData.materialStates = materialStates;
      wall.castShadow = true;
      wall.receiveShadow = true;
      wall.renderOrder = isHallway ? 10 : 12;
      walls.push(wall);
      group.add(wall);

      const edge = createWallEdgeLines(
        point,
        next,
        wallHeight,
        floorTopY,
        isHallway ? 0x6e9fbb : 0x6f91a5,
        isHallway ? 0.28 : 0.46
      );
      edge.userData.entity = { type: 'room', room, floor, group };
      edge.userData.mapRole = 'room-wall-edge';
      edgeLines.push(edge);
      group.add(edge);
    });

    const rim = createOutlineSegments(
      room.polygon,
      floorTopY + 0.82,
      isHallway ? 0x6e9fbb : 0x7a95a5,
      isHallway ? 0.38 : 0.52
    );
    rim.userData.entity = { type: 'room', room, floor, group };
    group.add(rim);

    const floorInset = createOutlineSegments(
      room.polygon,
      floorTopY + 0.25,
      isHallway ? 0xa6cde0 : 0xaebec8,
      isHallway ? 0.22 : 0.34
    );
    floorInset.userData.entity = { type: 'room', room, floor, group };
    group.add(floorInset);

    const wallCap = createOutlineSegments(
      room.polygon,
      wallTopY + 0.16,
      isHallway ? 0xa8c8da : 0xc2d0d9,
      isHallway ? 0.12 : 0.16
    );
    wallCap.userData.entity = { type: 'room', room, floor, group };
    group.add(wallCap);

    const center = polygonCenter(room.polygon);
    const label = createTextLabel(room.label, `campus-map-world-label room-label${isHallway ? ' hallway-label' : ''}`);
    label.hidden = true;
    this.labelLayer.append(label);
    this.labels.set(`room:${room.id}`, { el: label, world: new THREE.Vector3(center.x, wallTopY + 18, center.z), entity: { type: 'room', room, floor, group } });

    group.userData.visual = {
      floor: floorMesh,
      walls,
      edgeLines,
      rim,
      floorInset,
      wallCap
    };
    this.activeFloorGroup.add(group);
    this.roomGroups.set(room.id, group);

    const hitTarget = new THREE.Mesh(createRoomHitTargetGeometry(room.polygon, slabDepth), this.hitTargetMaterial);
    hitTarget.name = `${room.id}-hit-target`;
    hitTarget.position.y = baseY;
    hitTarget.userData.entity = { type: 'room', room, floor, group };
    hitTarget.userData.mapRole = 'room-hit-target';
    hitTarget.userData.linkedRoomGroup = group;
    hitTarget.renderOrder = 500;
    group.userData.hitTarget = hitTarget;
    this.activeFloorGroup.add(hitTarget);
    this.roomHitTargets.push(hitTarget);
  }

  addWallFeature(wall, floor) {
    if (!Array.isArray(wall.polygon) || wall.polygon.length < 3) return;
    const group = new THREE.Group();
    group.name = wall.id;
    group.userData = { type: 'wall', wall, floor };

    const height = Math.max(DEPTH_PRESET.wall * 0.72, Math.min(DEPTH_PRESET.wall * 1.35, wall.height ? wall.height * 2.5 : DEPTH_PRESET.wall));
    let mesh;
    try {
      mesh = new THREE.Mesh(extrudedPolygonGeometry(wall.polygon, {
        depth: height,
        bevelSize: 3.5,
        bevelThickness: 1.6,
        bevelSegments: 2
      }), this.materials.wallTall);
    } catch (error) {
      if (DEBUG) console.warn(`Could not build wall feature ${wall.id}`, error);
      return;
    }
    mesh.position.y = 11;
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    group.add(mesh);
    group.add(createOutlineSegments(wall.polygon, mesh.position.y + height + 0.7, 0x7899aa, 0.58));

    this.activeFloorGroup.add(group);
    this.walls.push(group);
  }

  addRouteSegment(segment) {
    if (!Array.isArray(segment.points) || segment.points.length < 2) return;
    const group = new THREE.Group();
    group.name = segment.id || 'route-segment';
    const width = segment.width || 14;
    const height = segment.height || 3.5;

    for (let index = 0; index < segment.points.length - 1; index += 1) {
      const point = segment.points[index];
      const next = segment.points[index + 1];
      if (!Array.isArray(point) || !Array.isArray(next)) continue;
      const ribbon = createWallBetween(point, next, width, height, this.materials.route, 1.6);
      ribbon.renderOrder = 12;
      group.add(ribbon);
    }

    if (group.children.length) this.activeFloorGroup.add(group);
  }

  addStair(stair, floor) {
    const [x, z] = stair.position;
    const [width, depth] = stair.size;
    const group = new THREE.Group();
    group.name = stair.id;
    group.position.set(x, 15, z);
    group.rotation.y = stair.rotation || 0;
    group.userData = { type: 'stair', stair, floor, targetY: 15, currentY: 15 };

    const base = new THREE.Mesh(new THREE.BoxGeometry(width, DEPTH_PRESET.stairBase, depth), this.materials.stair);
    base.position.y = DEPTH_PRESET.stairBase / 2;
    base.userData.entity = { type: 'stair', stair, floor, group };
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const treadCount = Math.max(4, stair.treads || 8);
    const treadDepth = depth / treadCount;
    for (let i = 0; i < treadCount; i += 1) {
      const tread = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.9, 3.4, Math.max(4, treadDepth * 0.48)),
        this.materials.stairTread
      );
      tread.position.set(0, DEPTH_PRESET.stairBase + 1.6 + i * 0.55, -depth / 2 + treadDepth * (i + 0.5));
      tread.userData.entity = { type: 'stair', stair, floor, group };
      tread.castShadow = true;
      group.add(tread);
    }

    const railA = new THREE.Mesh(new THREE.BoxGeometry(5, 18, depth * 0.9), this.materials.wall);
    railA.position.set(-width * 0.43, DEPTH_PRESET.stairBase + 7, 0);
    railA.userData.entity = { type: 'stair', stair, floor, group };
    railA.castShadow = true;
    group.add(railA);

    const railB = new THREE.Mesh(new THREE.BoxGeometry(5, 18, depth * 0.9), this.materials.wall);
    railB.position.x = width * 0.43;
    railB.position.y = DEPTH_PRESET.stairBase + 7;
    railB.userData.entity = { type: 'stair', stair, floor, group };
    railB.castShadow = true;
    group.add(railB);

    const label = createTextLabel(stair.label, 'campus-map-world-label stair-label');
    label.hidden = true;
    this.labelLayer.append(label);
    this.labels.set(`stair:${stair.id}`, { el: label, world: group.position, entity: { type: 'stair', stair, floor, group } });

    this.activeFloorGroup.add(group);
    this.stairGroups.set(stair.id, group);
    this.interactive.push(...group.children);
  }

  addRoomNumberLabel(entry, floor) {
    const roomGroup = entry.roomId ? this.roomGroups.get(entry.roomId) : null;
    const room = roomGroup?.userData?.room;
    let center = entry.position ? { x: entry.position[0], z: entry.position[1] } : null;
    if (!center && room?.polygon) center = polygonCenter(room.polygon);
    if (!center) return;

    const label = createPassiveLabel(entry.label, 'campus-map-world-label room-number-label');
    this.labelLayer.append(label);
    const defaultMinZoom = 1.24;
    this.labels.set(`room-number:${entry.id}`, {
      el: label,
      world: new THREE.Vector3(center.x, (roomGroup?.userData?.baseY || 0) + (roomGroup?.userData?.slabDepth || DEPTH_PRESET.room) + 20, center.z),
      entity: { type: 'room-number', label: entry, floor, room, group: roomGroup },
      minZoom: Math.max(entry.minZoom ?? defaultMinZoom, defaultMinZoom),
      roomId: entry.roomId,
      importance: entry.importance || 'normal'
    });
  }

  async getDetailSource(src) {
    if (this.detailCache.has(src)) return this.detailCache.get(src);
    const response = await fetch(src);
    if (!response.ok) throw new Error(`Could not load map linework: ${src}`);
    const svgText = await response.text();
    const parsed = {
      viewBox: parseSvgViewBox(svgText),
      paths: extractSvgPathData(svgText)
    };
    this.detailCache.set(src, parsed);
    return parsed;
  }

  async getCadGeometrySource(src) {
    if (this.detailCache.has(src)) return this.detailCache.get(src);
    const response = await fetch(src);
    if (!response.ok) throw new Error(`Could not load CAD map geometry: ${src}`);
    const payload = await response.json();
    this.detailCache.set(src, payload);
    return payload;
  }

  async getCleanGeometrySource(src) {
    if (this.detailCache.has(src)) return this.detailCache.get(src);
    const response = await fetch(src);
    if (!response.ok) throw new Error(`Could not load clean map geometry: ${src}`);
    const payload = await response.json();
    this.detailCache.set(src, payload);
    return payload;
  }

  normalizeCleanFloor(floor, clean) {
    if (!clean || clean.floorId !== floor.id) return floor;

    const hallwayRooms = (clean.hallways || []).map((entry) => ({
      id: entry.id,
      label: entry.label,
      kind: 'Hallway',
      polygon: entry.polygon,
      height: entry.height ?? 0.045,
      selectable: entry.selectable !== false,
      plannedRoomNumber: null,
      importance: 'hallway'
    }));

    const rooms = (clean.rooms || []).map((entry) => ({
      id: entry.id,
      label: entry.label,
      kind: entry.kind || 'Classroom',
      polygon: entry.polygon,
      height: entry.height ?? 0.08,
      selectable: entry.selectable !== false,
      plannedRoomNumber: entry.plannedRoomNumber || entry.roomNumber || null,
      importance: entry.importance || 'normal'
    }));

    const stairs = (clean.stairs || []).map((entry) => ({
      id: entry.id,
      label: entry.label,
      position: entry.position,
      size: entry.size,
      rotation: entry.rotation || 0,
      treads: entry.treads || 8
    })).filter((entry) => (
      Array.isArray(entry.position) &&
      Array.isArray(entry.size) &&
      entry.position.length === 2 &&
      entry.size.length === 2
    ));

    const labels = (clean.labels || []).map((entry) => {
      const defaultMinZoom = entry.importance === 'major' ? 0.86 : 1.24;
      return {
        id: entry.id,
        label: entry.label,
        roomId: entry.roomId,
        position: entry.position,
        minZoom: Math.max(entry.minZoom ?? defaultMinZoom, defaultMinZoom),
        importance: entry.importance || 'normal'
      };
    });

    const hasExplicitOuterOutlines = Array.isArray(clean.outerOutlines);
    const outerOutlineSource = hasExplicitOuterOutlines ? clean.outerOutlines : (clean.walls || []);
    const outerOutlines = outerOutlineSource.map((entry) => ({
      id: entry.id,
      polygon: entry.polygon,
      closed: entry.closed !== false,
      sourceLayer: entry.sourceLayer || entry.layer || 'WALLS',
      renderAs: 'outline',
      thickness: 0,
      height: 0,
      area: entry.area
    })).filter((entry) => Array.isArray(entry.polygon) && entry.polygon.length >= 3);

    const walls = (hasExplicitOuterOutlines ? (clean.walls || []) : []).map((entry) => ({
      id: entry.id,
      polygon: entry.polygon,
      closed: entry.closed,
      thickness: entry.thickness || 7,
      height: entry.height || 28,
      area: entry.area
    })).filter((entry) => Array.isArray(entry.polygon) && entry.polygon.length >= 3);

    const cleanBounds = clean.coordinateSystem?.worldBounds || floor.bounds;
    const bounds = cleanBounds?.minX !== undefined ? {
      minX: cleanBounds.minX,
      maxX: cleanBounds.maxX,
      minZ: cleanBounds.minY ?? cleanBounds.minZ,
      maxZ: cleanBounds.maxY ?? cleanBounds.maxZ
    } : floor.bounds;

    const initialCamera = {
      x: ((bounds.minX || 0) + (bounds.maxX || 0)) / 2,
      z: ((bounds.minZ || 0) + (bounds.maxZ || 0)) / 2,
      zoom: 0.54
    };

    return {
      ...floor,
      bounds,
      initialCamera,
      floorShapes: floor.floorShapes?.length ? floor.floorShapes : clean.floorShapes,
      rooms: [...hallwayRooms, ...rooms],
      outerOutlines,
      walls,
      stairs: stairs.length ? stairs : floor.stairs,
      roomNumberLabels: labels.length ? labels : floor.roomNumberLabels,
      connectors: [],
      detailLines: DEBUG ? floor.detailLines : [],
      cleanSource: clean.source || floor.cleanGeometry
    };
  }

  addCadPolylineWalls(group, polygon, layer, viewBox) {
    if (!Array.isArray(polygon.points) || polygon.points.length < 2) return;

    const mapped = polygon.points
      .map(([x, y]) => mapSvgToWorld(x, y, viewBox, layer.frame))
      .filter(([x, z]) => Number.isFinite(x) && Number.isFinite(z));
    if (mapped.length < 2) return;

    const thickness = layer.cadThickness ?? 4.5;
    const height = layer.cadHeight ?? 9;
    const y = 0.03;
    const count = polygon.closed ? mapped.length : mapped.length - 1;

    for (let index = 0; index < count; index += 1) {
      const point = mapped[index];
      const next = mapped[(index + 1) % mapped.length];
      if (!next) continue;
      const length = Math.hypot(next[0] - point[0], next[1] - point[1]);
      if (length < 2.5) continue;
      const wall = createWallBetween(point, next, thickness, height, this.materials.cadDetail, y);
      wall.name = `${polygon.id || 'cad'}-segment-${index}`;
      wall.renderOrder = 5;
      wall.userData.isCadDetail = true;
      group.add(wall);
      this.walls.push(wall);
    }
  }

  async buildCadDetailGeometry(floor, token) {
    const layers = (floor.detailLines || []).filter((layer) => layer.cadGeometry);
    if (!layers.length) return;

    const group = new THREE.Group();
    group.name = `${floor.id}-raised-cad-detail`;

    for (const layer of layers) {
      try {
        const source = await this.getCadGeometrySource(layer.cadGeometry);
        if (token !== this.detailLoadToken || this.activeFloor?.id !== floor.id) {
          this.disposeObject(group);
          return;
        }

        const layerGroup = new THREE.Group();
        layerGroup.name = `${layer.id}-raised-geometry`;
        const viewBox = source.viewBox || parseSvgViewBox('');
        (source.polygons || []).forEach((polygon) => {
          this.addCadPolylineWalls(layerGroup, polygon, layer, viewBox);
        });

        if (layerGroup.children.length) group.add(layerGroup);
      } catch (error) {
        if (DEBUG) console.warn(error);
      }
    }

    if (token !== this.detailLoadToken || this.activeFloor?.id !== floor.id) {
      this.disposeObject(group);
      return;
    }
    if (group.children.length) this.activeFloorGroup.add(group);
    this.render();
  }

  async buildDetailLines(floor, token) {
    const layers = floor.detailLines || [];
    if (!layers.length) return;

    const group = new THREE.Group();
    group.name = `${floor.id}-engraved-linework`;

    for (const layer of layers) {
      try {
        const source = await this.getDetailSource(layer.src);
        if (token !== this.detailLoadToken || this.activeFloor?.id !== floor.id) {
          this.disposeObject(group);
          return;
        }

        const positions = [];
        source.paths.forEach((pathData) => {
          positions.push(...parsePathToSegments(pathData, source.viewBox, layer.frame, layer.elevation ?? 23));
        });
        if (!positions.length) continue;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.computeBoundingSphere();
        const material = new THREE.LineBasicMaterial({
          color: new THREE.Color(layer.color || '#21372c'),
          transparent: true,
          opacity: layer.opacity ?? 0.36,
          depthWrite: false
        });
        const lines = new THREE.LineSegments(geometry, material);
        lines.name = layer.id;
        lines.renderOrder = 8;
        group.add(lines);
      } catch (error) {
        if (DEBUG) console.warn(error);
      }
    }

    if (token !== this.detailLoadToken || this.activeFloor?.id !== floor.id) {
      this.disposeObject(group);
      return;
    }
    this.activeFloorGroup.add(group);
    this.render();
  }

  buildBlueprintLayer(floor) {
    if (!this.blueprintLayer) return;
    this.blueprintLayer.replaceChildren();
    const sources = [floor.blueprint?.src, floor.blueprint?.secondarySrc].filter(Boolean);
    sources.forEach((src, index) => {
      const img = document.createElement('img');
      img.src = src;
      img.alt = `${floor.label} blueprint reference ${index + 1}`;
      img.className = 'campus-map-blueprint-image';
      this.blueprintLayer.append(img);
    });
    this.blueprintLayer.hidden = !this.blueprintVisible;
  }

  resize() {
    if (!this.renderer) return;
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    this.renderer.setSize(width, height, false);
    const aspect = width / height;
    const vertical = 900;
    this.camera.left = -vertical * aspect / 2;
    this.camera.right = vertical * aspect / 2;
    this.camera.top = vertical / 2;
    this.camera.bottom = -vertical / 2;
    this.camera.updateProjectionMatrix();
    this.updateCamera();
    this.updateLabels();
  }

  fitFloor(animated = true, options = {}) {
    if (!this.activeFloor) return;
    const { initialCamera } = this.activeFloor;
    const bounds = this.activeFloor.bounds;
    let zoom = initialCamera.zoom || 0.75;
    if (bounds) {
      const rect = this.canvas.getBoundingClientRect();
      const aspect = Math.max(0.5, rect.width / Math.max(1, rect.height));
      const width = Math.max(1, bounds.maxX - bounds.minX);
      const height = Math.max(1, bounds.maxZ - bounds.minZ);
      const fitZoom = Math.min(1.08, Math.max(0.3, Math.min((900 * aspect) / (width * 1.28), 900 / (height * 1.28))));
      zoom = options.explore && rect.width >= 760 ?
        clamp(Math.max(initialCamera.zoom || 0.72, fitZoom * 1.92), 0.58, 1.08) :
        fitZoom;
    }

    const next = {
      x: initialCamera.x,
      z: initialCamera.z,
      zoom
    };
    if (this.cameraTween) this.cameraTween.kill();
    if (!animated || REDUCED_MOTION) {
      this.target.set(next.x, 0, next.z);
      this.cameraTarget.copy(this.target);
      this.camera.zoom = next.zoom;
      this.camera.updateProjectionMatrix();
      this.updateCamera();
      this.updateLabels();
      this.render();
      return;
    }

    const values = {
      x: this.target.x,
      z: this.target.z,
      zoom: this.camera.zoom
    };

    this.cameraTween = gsap.to(values, {
      x: next.x,
      z: next.z,
      zoom: next.zoom,
      duration: 0.9,
      ease: 'power3.out',
      onUpdate: () => {
        this.target.set(values.x, 0, values.z);
        this.cameraTarget.copy(this.target);
        this.camera.zoom = values.zoom;
        this.camera.updateProjectionMatrix();
        this.updateCamera();
        this.updateLabels();
      }
    });
  }

  flyToEntity(entity) {
    if (!entity || REDUCED_MOTION) return;
    const group = entity.group;
    if (!group) return;
    const center = new THREE.Vector3();
    group.getWorldPosition(center);
    if (entity.type === 'room' && entity.room?.polygon) {
      const roomCenter = polygonCenter(entity.room.polygon);
      center.set(roomCenter.x, 0, roomCenter.z);
    }
    if (this.cameraTween) this.cameraTween.kill();
    const targetZoom = clamp(Math.max(this.camera.zoom, 1.14), 0.5, 1.68);
    const values = {
      x: this.target.x,
      z: this.target.z,
      zoom: this.camera.zoom
    };

    this.cameraTween = gsap.to(values, {
      x: center.x,
      z: center.z,
      zoom: targetZoom,
      duration: 0.78,
      ease: 'power3.out',
      onUpdate: () => {
        this.target.set(values.x, 0, values.z);
        this.cameraTarget.copy(this.target);
        this.camera.zoom = values.zoom;
        this.camera.updateProjectionMatrix();
        this.updateCamera();
        this.updateLabels();
      }
    });
  }

  enterRoomFocus(entity) {
    if (!entity || entity.type !== 'room' || !entity.room?.polygon) return;
    const bounds = polygonBounds(entity.room.polygon);
    const center = polygonCenter(entity.room.polygon);
    const rect = this.canvas.getBoundingClientRect();
    const aspect = Math.max(0.6, rect.width / Math.max(1, rect.height));
    const width = Math.max(80, bounds.maxX - bounds.minX);
    const depth = Math.max(80, bounds.maxZ - bounds.minZ);
    const fitZoom = clamp(Math.min((900 * aspect) / (width * 1.82), 900 / (depth * 1.82)), 1.18, 2.65);
    const previous = this.focusMode?.previous || {
      x: this.target.x,
      z: this.target.z,
      zoom: this.camera.zoom,
      rigX: this.cameraRig.x,
      rigY: this.cameraRig.y,
      rigZ: this.cameraRig.z
    };

    this.focusMode = {
      roomId: entity.room.id,
      previous
    };
    this.onFocusChange({ active: true, room: entity.room, floor: entity.floor });
    this.animateCameraTo({
      x: center.x,
      z: center.z,
      zoom: fitZoom,
      rigX: CAMERA_PRESETS.roomFocus.x,
      rigY: CAMERA_PRESETS.roomFocus.y,
      rigZ: CAMERA_PRESETS.roomFocus.z
    }, 0.86);
  }

  exitRoomFocus(options = {}) {
    if (!this.focusMode) return;
    const previous = this.focusMode.previous;
    this.focusMode = null;
    this.onFocusChange({ active: false, room: null, floor: this.activeFloor });
    if (options.restore === false || !previous) {
      this.updateLabels();
      return;
    }
    this.animateCameraTo(previous, 0.76);
  }

  updateCamera() {
    this.camera.position.set(
      this.cameraTarget.x + this.cameraRig.x,
      this.cameraRig.y,
      this.cameraTarget.z + this.cameraRig.z
    );
    this.camera.lookAt(this.cameraTarget.x, 0, this.cameraTarget.z);
    this.syncViewCube();
  }

  syncViewCube() {
    if (!this.viewCubeCore || !this.camera) return;
    this.viewCubeCore.style.transform = getViewCubeTransform(this.cameraRig);
  }

  setCameraPreset(name = 'iso', options = {}) {
    const preset = CAMERA_PRESETS[name] || CAMERA_PRESETS.iso;
    if (this.viewCube) this.viewCube.dataset.view = CAMERA_PRESETS[name] ? name : 'iso';
    const nextZoom = options.keepZoom ? this.camera.zoom : clamp(this.camera.zoom * (preset.zoomBoost || 1), 0.38, 2.65);
    this.animateCameraTo({
      x: this.target.x,
      z: this.target.z,
      zoom: nextZoom,
      rigX: preset.x,
      rigY: preset.y,
      rigZ: preset.z
    }, options.duration ?? 0.72);
  }

  animateCameraTo(next, duration = 0.78) {
    if (this.cameraTween) this.cameraTween.kill();
    if (REDUCED_MOTION || duration === 0) {
      this.target.set(next.x, 0, next.z);
      this.cameraTarget.copy(this.target);
      this.camera.zoom = next.zoom;
      this.cameraRig.x = next.rigX ?? this.cameraRig.x;
      this.cameraRig.y = next.rigY ?? this.cameraRig.y;
      this.cameraRig.z = next.rigZ ?? this.cameraRig.z;
      this.camera.updateProjectionMatrix();
      this.updateCamera();
      this.updateLabels();
      this.render();
      return;
    }

    const values = {
      x: this.target.x,
      z: this.target.z,
      zoom: this.camera.zoom,
      rigX: this.cameraRig.x,
      rigY: this.cameraRig.y,
      rigZ: this.cameraRig.z
    };

    this.cameraTween = gsap.to(values, {
      x: next.x,
      z: next.z,
      zoom: next.zoom,
      rigX: next.rigX ?? this.cameraRig.x,
      rigY: next.rigY ?? this.cameraRig.y,
      rigZ: next.rigZ ?? this.cameraRig.z,
      duration,
      ease: 'power3.out',
      onUpdate: () => {
        this.target.set(values.x, 0, values.z);
        this.cameraTarget.copy(this.target);
        this.camera.zoom = values.zoom;
        this.cameraRig.x = values.rigX;
        this.cameraRig.y = values.rigY;
        this.cameraRig.z = values.rigZ;
        this.camera.updateProjectionMatrix();
        this.updateCamera();
        this.updateLabels();
      },
      onComplete: () => {
        this.cameraTween = null;
      }
    });
  }

  cancelCameraTween() {
    if (!this.cameraTween) return;
    this.cameraTween.kill();
    this.cameraTween = null;
  }

  zoomBy(factor, anchorScreenPoint = null) {
    const oldZoom = this.camera.zoom;
    const nextZoom = clamp(oldZoom * factor, 0.38, 2.45);
    if (nextZoom === oldZoom) return;

    if (anchorScreenPoint) {
      const before = this.screenToWorld(anchorScreenPoint.clientX, anchorScreenPoint.clientY);
      this.camera.zoom = nextZoom;
      this.camera.updateProjectionMatrix();
      this.updateCamera();
      const after = this.screenToWorld(anchorScreenPoint.clientX, anchorScreenPoint.clientY);
      if (before && after) {
        this.target.x += before.x - after.x;
        this.target.z += before.z - after.z;
        this.cameraTarget.copy(this.target);
      }
    } else {
      this.camera.zoom = nextZoom;
      this.camera.updateProjectionMatrix();
    }

    this.updateCamera();
    this.updateLabels();
  }

  handleWheel(event) {
    event.preventDefault();
    this.cancelCameraTween();
    const factor = normalizeWheelZoomFactor(event);
    this.zoomBy(factor, { clientX: event.clientX, clientY: event.clientY });
  }

  handlePointerDown(event) {
    this.cancelCameraTween();
    this.canvas.setPointerCapture(event.pointerId);
    this.updatePointer(event);
    this.drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false
    };
  }

  handlePointerMove(event) {
    this.updatePointer(event);
    if (this.drag && this.drag.pointerId === event.pointerId) {
      const dx = event.clientX - this.drag.x;
      const dy = event.clientY - this.drag.y;
      if (!this.drag.moved) {
        if (Math.abs(dx) + Math.abs(dy) <= DRAG_PAN_THRESHOLD) return;
        this.drag.moved = true;
        this.canvas.classList.add('is-dragging');
        this.clearHover();
        this.drag.x = event.clientX;
        this.drag.y = event.clientY;
        return;
      }

      const rect = this.canvas.getBoundingClientRect();
      const viewWidth = (this.camera.right - this.camera.left) / this.camera.zoom;
      const viewHeight = (this.camera.top - this.camera.bottom) / this.camera.zoom;
      this.target.x -= (dx / Math.max(1, rect.width)) * viewWidth;
      this.target.z -= (dy / Math.max(1, rect.height)) * viewHeight;
      this.cameraTarget.copy(this.target);
      this.drag.x = event.clientX;
      this.drag.y = event.clientY;
      this.updateCamera();
      this.updateLabels();
      return;
    }

    const hit = this.pickHoverEntity();
    this.applyHoverHit(hit);
  }

  handlePointerUp(event) {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    const wasDragging = this.drag.moved;
    this.drag = null;
    this.canvas.classList.remove('is-dragging');
    try {
      this.canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
    if (wasDragging) return;
    const hit = this.pickClickEntity();
    if (hit) this.selectEntity(hit);
  }

  handlePointerCancel(event) {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    this.clearDragState({ clearHover: true });
  }

  handleLostPointerCapture(event) {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    this.clearDragState({ clearHover: true });
  }

  clearDragState({ clearHover = false } = {}) {
    this.drag = null;
    this.canvas.classList.remove('is-dragging');
    if (clearHover) this.clearHover();
  }

  updatePointer(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  }

  screenToWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1)
    );
    this.raycaster.setFromCamera(pointer, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const point = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, point);
  }

  projectWorldPoint(point) {
    if (!this.canvas || !this.camera || !point) return null;
    const rect = this.canvas.getBoundingClientRect();
    const projected = new THREE.Vector3(point.x, point.y ?? 0, point.z);
    projected.project(this.camera);
    return {
      x: (projected.x * 0.5 + 0.5) * rect.width,
      y: (-projected.y * 0.5 + 0.5) * rect.height,
      inView: projected.z >= -1 && projected.z <= 1
    };
  }

  pickHoverEntity() {
    const targets = this.interactive.concat(this.roomHitTargets);
    return this.pickEntityFromTargets(targets, true);
  }

  pickClickEntity() {
    if (this.focusMode?.roomId) return null;
    return this.pickEntityFromTargets(this.interactive.concat(this.roomHitTargets), true);
  }

  pickEntity() {
    return this.pickHoverEntity();
  }

  pickEntityFromTargets(targets, preferStableRoom = true) {
    if (!targets.length) return null;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(targets, false);
    if (preferStableRoom) {
      const stableRoomHit = this.preferStableHoveredRoomHit(hits);
      if (stableRoomHit) return stableRoomHit.object.userData.entity;
    }
    const hit = hits.find((entry) => entry.object.userData.entity);
    return hit?.object.userData.entity || null;
  }

  preferStableHoveredRoomHit(hits) {
    if (!this.hovered || this.hovered.type !== 'room') return null;
    const validHits = hits.filter((entry) => entry.object.userData.entity);
    const firstEntity = validHits[0]?.object.userData.entity;
    if (firstEntity?.type !== 'room') return null;
    const hoveredKey = this.entityKey(this.hovered);
    return validHits.find((entry) => this.entityKey(entry.object.userData.entity) === hoveredKey) || null;
  }

  applyHoverHit(entity) {
    if (entity) {
      this.lastHoverSeenAt = performance.now();
      this.setHovered(entity);
      return;
    }

    if (this.hovered && performance.now() - this.lastHoverSeenAt < this.hoverGraceMs) {
      return;
    }

    this.setHovered(null);
  }

  setHovered(entity) {
    const nextKey = entity ? this.entityKey(entity) : null;
    const oldKey = this.hovered ? this.entityKey(this.hovered) : null;
    if (nextKey === oldKey) return;
    this.hovered = entity;
    this.canvas.classList.toggle('has-map-hover', Boolean(entity));
    this.onHover(entity);
    this.updateLabels();
  }

  clearHover() {
    this.lastHoverSeenAt = 0;
    this.setHovered(null);
  }

  handlePointerLeave(event) {
    if (this.drag) this.clearDragState();
    this.clearHover();
  }

  selectEntity(entity) {
    this.selected = entity;
    this.onSelect(entity);
    if (entity?.type === 'room') {
      this.enterRoomFocus(entity);
    } else {
      this.flyToEntity(entity);
    }
    this.updateLabels();
  }

  selectRoom(roomId) {
    const group = this.roomGroups.get(roomId);
    if (!group || !this.activeFloor) return;
    this.selectEntity({ type: 'room', room: group.userData.room, floor: this.activeFloor, group });
  }

  selectStair(stairId) {
    const group = this.stairGroups.get(stairId);
    if (!group || !this.activeFloor) return;
    this.selectEntity({ type: 'stair', stair: group.userData.stair, floor: this.activeFloor, group });
  }

  entityKey(entity) {
    if (!entity) return '';
    if (entity.type === 'stair') return `stair:${entity.stair.id}`;
    if (entity.type === 'room-number') return `room-number:${entity.label.id}`;
    return `room:${entity.room.id}`;
  }

  setDepthEnabled(enabled) {
    this.depthEnabled = enabled;
    this.walls.forEach((wall) => {
      wall.visible = enabled;
    });
    this.roomGroups.forEach((group) => {
      group.userData.visual?.walls?.forEach((wall) => {
        wall.visible = enabled;
      });
      group.userData.visual?.edgeLines?.forEach((line) => {
        line.visible = enabled;
      });
      if (group.userData.visual?.floorInset) group.userData.visual.floorInset.visible = enabled;
      if (group.userData.visual?.wallCap) group.userData.visual.wallCap.visible = enabled;
    });
    this.stairGroups.forEach((group) => {
      group.visible = enabled;
    });
  }

  setBlueprintVisible(visible) {
    this.blueprintVisible = visible;
    if (this.blueprintLayer) this.blueprintLayer.hidden = !visible;
  }

  updateLabels() {
    if (!this.canvas || !this.labelLayer) return;
    const rect = this.canvas.getBoundingClientRect();
    const hoveredKey = this.hovered ? this.entityKey(this.hovered) : null;
    const selectedKey = this.selected ? this.entityKey(this.selected) : null;
    const activeRoomId = this.focusMode?.roomId ||
      (this.selected?.type === 'room' ? this.selected.room.id : null) ||
      (this.hovered?.type === 'room' ? this.hovered.room.id : null);

    this.labels.forEach((record, key) => {
      const pos = record.world.clone();
      if (record.entity.type === 'stair') {
        pos.copy(record.entity.group.position);
        pos.y += 42;
      }
      pos.project(this.camera);
      const inView = pos.z >= -1 && pos.z <= 1;
      const x = (pos.x * 0.5 + 0.5) * rect.width;
      const y = (-pos.y * 0.5 + 0.5) * rect.height;
      record.el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`;
      const linkedRoomKey = record.roomId ? `room:${record.roomId}` : null;
      const isActive = key === hoveredKey ||
        key === selectedKey ||
        Boolean(linkedRoomKey && (linkedRoomKey === hoveredKey || linkedRoomKey === selectedKey));
      const zoomVisible = this.camera.zoom >= (record.minZoom ?? 0);
      const isRoomNumber = key.startsWith('room-number:');
      const isRoomLabel = key.startsWith('room:');
      const isStairLabel = key.startsWith('stair:');
      const roomLabelIsActive = isRoomLabel && key === selectedKey;
      const stairLabelIsActive = isStairLabel && key === selectedKey;
      const suppressDuplicateRoomNumber = Boolean(
        isRoomNumber &&
        activeRoomId &&
        record.roomId === activeRoomId &&
        (linkedRoomKey === hoveredKey || linkedRoomKey === selectedKey || this.focusMode?.roomId === activeRoomId)
      );
      record.el.classList.toggle('is-active', isActive);
      record.el.hidden = !inView ||
        suppressDuplicateRoomNumber ||
        (isRoomNumber && !zoomVisible && !isActive) ||
        (isRoomLabel && !roomLabelIsActive) ||
        (isStairLabel && !stairLabelIsActive);
    });
  }

  animate() {
    if (this.disposed) return;
    requestAnimationFrame(() => this.animate());
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) / 1000));
    this.lastFrameTime = now;

    this.roomGroups.forEach((group) => {
      const key = `room:${group.userData.room.id}`;
      const selected = key === this.entityKey(this.selected);
      const hovered = key === this.entityKey(this.hovered);
      const active = hovered || selected;
      const dimmed = Boolean(this.focusMode?.roomId && this.focusMode.roomId !== group.userData.room.id);
      const isHallway = group.userData.room.kind === 'Hallway';
      let targetY = 0;
      if (this.depthEnabled && !dimmed) {
        if (selected) {
          targetY = isHallway ? DEPTH_PRESET.selectedLiftHallway : DEPTH_PRESET.selectedLiftRoom;
        } else if (hovered) {
          targetY = isHallway ? DEPTH_PRESET.hoverLiftHallway : DEPTH_PRESET.hoverLiftRoom;
        }
      }
      group.userData.currentY += (targetY - group.userData.currentY) * (REDUCED_MOTION ? 1 : Math.min(1, dt * 9));
      group.position.y = group.userData.currentY;
      const top = group.children[0];
      const materialSet = group.userData.materialSet;
      if (group.userData.visual && materialSet) {
        const visual = group.userData.visual;
        visual.floor.material = dimmed ? materialSet.floorDim : active ?
          (selected ? materialSet.floorSelected : materialSet.floorHover) :
          materialSet.floor;
        visual.walls.forEach((wall) => {
          const states = wall.userData.materialStates;
          if (states) {
            wall.material = dimmed ? states.dim : active ?
              (selected ? states.selected : states.hover) :
              states.base;
          } else {
            wall.material = dimmed ? materialSet.wallDim : active ?
              (selected ? materialSet.wallSelected : materialSet.wallHover) :
              materialSet.wall;
          }
        });
      } else if (top) {
        const materialSet = group.userData.materialSet;
        top.material = active ?
          (key === this.entityKey(this.selected) ? materialSet.selected : materialSet.hover) :
          materialSet.base;
      }
      const scale = active ? (isHallway ? 1.004 : 1.014) : 1;
      group.scale.lerp(new THREE.Vector3(scale, scale, scale), REDUCED_MOTION ? 1 : Math.min(1, dt * 7));
      if (group.userData.hitTarget) {
        group.userData.hitTarget.position.y = group.userData.baseY + group.userData.currentY;
      }
    });

    this.stairGroups.forEach((group) => {
      const key = `stair:${group.userData.stair.id}`;
      const active = key === this.entityKey(this.hovered) || key === this.entityKey(this.selected);
      const targetY = active && this.depthEnabled ? DEPTH_PRESET.hoverLiftStair : 15;
      group.userData.currentY += (targetY - group.userData.currentY) * (REDUCED_MOTION ? 1 : Math.min(1, dt * 9));
      group.position.y = group.userData.currentY;
      const scale = active ? 1.035 : 1;
      group.scale.lerp(new THREE.Vector3(scale, scale, scale), REDUCED_MOTION ? 1 : Math.min(1, dt * 8));
    });

    this.updateLabels();
    this.onFrame();
    this.render();
  }

  render() {
    if (!this.rendererInitialized || !this.renderer) return;
    this.renderer.render(this.scene, this.camera);
  }

  clearLabels() {
    this.labels.forEach((record) => record.el.remove());
    this.labels.clear();
    if (this.blueprintLayer) this.blueprintLayer.replaceChildren();
  }

  disposeObject(object) {
    const sharedMaterials = new Set(Object.values(this.materials));
    object.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((material) => {
            if (!sharedMaterials.has(material)) material.dispose();
          });
        } else if (!sharedMaterials.has(child.material)) {
          child.material.dispose();
        }
      }
    });
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener('resize', this.resizeHandler);
    this.clearLabels();
    this.renderer?.dispose();
  }
}

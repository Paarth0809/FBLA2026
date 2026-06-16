import * as THREE from '/vendor/three/build/three.module.js';

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEBUG = new URLSearchParams(window.location.search).has('mapDebug');

const COLORS = {
  floor: 0xf7fbf7,
  floorEdge: 0xc9d9ce,
  hallway: 0xe7f4ea,
  room: 0xffffff,
  roomHover: 0xe8fff3,
  roomSelected: 0xdcfce9,
  wall: 0x9fb5a8,
  wallTop: 0xe4ede6,
  connector: 0x10b981,
  pin: 0x006c49,
  pinSelected: 0xd4af37,
  stair: 0xdfece3,
  stairTread: 0x6c7f72,
  ink: 0x16251d,
  blueprint: 0x1b2a22
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function polygonCenter(polygon) {
  const sum = polygon.reduce((acc, [x, z]) => {
    acc.x += x;
    acc.z += z;
    return acc;
  }, { x: 0, z: 0 });
  return { x: sum.x / polygon.length, z: sum.z / polygon.length };
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

function makeMaterial(options) {
  return new THREE.MeshStandardMaterial({
    roughness: 0.74,
    metalness: 0.0,
    ...options
  });
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

    this.clock = new THREE.Clock();
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
    this.roomGroups = new Map();
    this.pinGroups = new Map();
    this.stairGroups = new Map();
    this.walls = [];
    this.detailCache = new Map();
    this.detailLoadToken = 0;
    this.pinsVisible = true;
    this.depthEnabled = true;
    this.blueprintVisible = DEBUG;
    this.disposed = false;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1200, 1800);
    this.camera.zoom = 1;

    this.materials = {
      floor: makeMaterial({ color: COLORS.floor, roughness: 0.92, side: THREE.DoubleSide }),
      floorEdge: makeMaterial({ color: COLORS.floorEdge, roughness: 0.86 }),
      hallway: makeMaterial({ color: COLORS.hallway, roughness: 0.86, side: THREE.DoubleSide }),
      room: makeMaterial({ color: COLORS.room, roughness: 0.76, side: THREE.DoubleSide }),
      roomHover: makeMaterial({ color: COLORS.roomHover, roughness: 0.7, side: THREE.DoubleSide }),
      roomSelected: makeMaterial({ color: COLORS.roomSelected, roughness: 0.68, side: THREE.DoubleSide }),
      wall: makeMaterial({ color: COLORS.wall, roughness: 0.78 }),
      connector: makeMaterial({ color: COLORS.connector, roughness: 0.64, side: THREE.DoubleSide }),
      cadDetail: makeMaterial({
        color: 0x789084,
        roughness: 0.72,
        metalness: 0.02
      }),
      stair: makeMaterial({ color: COLORS.stair, roughness: 0.82 }),
      stairTread: makeMaterial({ color: COLORS.stairTread, roughness: 0.72 }),
      pin: makeMaterial({ color: COLORS.pin, roughness: 0.42, metalness: 0.05 }),
      pinSelected: makeMaterial({ color: COLORS.pinSelected, roughness: 0.36, metalness: 0.15 }),
      shadow: new THREE.MeshBasicMaterial({
        color: 0x06130d,
        transparent: true,
        opacity: 0.16,
        depthWrite: false
      })
    };

    this.setupScene();
    this.bindEvents();
    this.resize();
    this.animate();
  }

  setupScene() {
    this.scene.fog = new THREE.Fog(0xf4fbf4, 980, 2600);

    const ambient = new THREE.HemisphereLight(0xffffff, 0xc8d8c8, 2.4);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-420, 820, 520);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x6ffbbe, 0.85);
    rim.position.set(700, 520, -500);
    this.scene.add(rim);
  }

  bindEvents() {
    this.resizeHandler = () => this.resize();
    window.addEventListener('resize', this.resizeHandler);

    this.canvas.addEventListener('pointerdown', (event) => this.handlePointerDown(event));
    this.canvas.addEventListener('pointermove', (event) => this.handlePointerMove(event));
    this.canvas.addEventListener('pointerup', (event) => this.handlePointerUp(event));
    this.canvas.addEventListener('pointercancel', (event) => this.handlePointerUp(event));
    this.canvas.addEventListener('pointerleave', () => this.clearHover());
    this.canvas.addEventListener('wheel', (event) => this.handleWheel(event), { passive: false });
    this.canvas.addEventListener('dblclick', (event) => {
      event.preventDefault();
      this.zoomBy(1.22, this.screenToWorld(event.clientX, event.clientY));
    });
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
    this.detailLoadToken += 1;
    const detailToken = this.detailLoadToken;
    this.activeFloor = floor;
    this.selected = null;
    this.hovered = null;
    this.interactive = [];
    this.roomGroups.clear();
    this.pinGroups.clear();
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
    this.fitFloor(false);
    this.onReady({ floor: renderFloor, renderer: 'Three.js WebGL renderer' });
  }

  buildFloor(floor) {
    floor.floorShapes.forEach((shape, index) => {
      const material = shape.id.includes('connector') ? this.materials.hallway : this.materials.floor;
      const mesh = new THREE.Mesh(polygonTopGeometry(shape.polygon), material);
      mesh.position.y = -0.012 - index * 0.001;
      mesh.receiveShadow = true;
      this.activeFloorGroup.add(mesh);

      shape.polygon.forEach((point, i) => {
        const next = shape.polygon[(i + 1) % shape.polygon.length];
        const edge = createWallBetween(point, next, 13, 12, this.materials.floorEdge, -11);
        this.activeFloorGroup.add(edge);
      });
    });

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
    (floor.stairs || []).forEach((entry) => this.addStair(entry, floor));
    (floor.roomNumberLabels || []).forEach((entry) => this.addRoomNumberLabel(entry, floor));
    floor.pins.forEach((entry) => this.addPin(entry, floor));
  }

  addRoom(room, floor) {
    const group = new THREE.Group();
    group.name = room.id;
    group.userData = { type: 'room', room, floor, targetY: 0, currentY: 0 };

    const top = new THREE.Mesh(polygonTopGeometry(room.polygon), this.materials.room);
    top.position.y = 0.012;
    top.userData.entity = { type: 'room', room, floor, group };
    top.receiveShadow = true;
    group.add(top);

    room.polygon.forEach((point, index) => {
      const next = room.polygon[(index + 1) % room.polygon.length];
      const wall = createWallBetween(point, next, 8, room.kind === 'Hallway' ? 10 : 18, this.materials.wall, 0.016);
      wall.userData.entity = { type: 'room', room, floor, group };
      group.add(wall);
      this.walls.push(wall);
    });

    const center = polygonCenter(room.polygon);
    const label = createTextLabel(room.label, 'campus-map-world-label room-label');
    label.hidden = true;
    label.addEventListener('click', () => this.selectEntity({ type: 'room', room, floor, group }));
    this.labelLayer.append(label);
    this.labels.set(`room:${room.id}`, { el: label, world: new THREE.Vector3(center.x, 28, center.z), entity: { type: 'room', room, floor, group } });

    this.activeFloorGroup.add(group);
    this.roomGroups.set(room.id, group);
    this.interactive.push(top, ...group.children.filter((child) => child !== top));
  }

  addStair(stair, floor) {
    const [x, z] = stair.position;
    const [width, depth] = stair.size;
    const group = new THREE.Group();
    group.name = stair.id;
    group.position.set(x, 7, z);
    group.rotation.y = stair.rotation || 0;
    group.userData = { type: 'stair', stair, floor, targetY: 7, currentY: 7 };

    const base = new THREE.Mesh(new THREE.BoxGeometry(width, 5, depth), this.materials.stair);
    base.position.y = 0;
    base.userData.entity = { type: 'stair', stair, floor, group };
    group.add(base);

    const treadCount = Math.max(4, stair.treads || 8);
    const treadDepth = depth / treadCount;
    for (let i = 0; i < treadCount; i += 1) {
      const tread = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.86, 2.2, Math.max(4, treadDepth * 0.38)),
        this.materials.stairTread
      );
      tread.position.set(0, 4.1 + i * 0.28, -depth / 2 + treadDepth * (i + 0.5));
      tread.userData.entity = { type: 'stair', stair, floor, group };
      group.add(tread);
    }

    const railA = new THREE.Mesh(new THREE.BoxGeometry(4, 6, depth * 0.9), this.materials.wall);
    railA.position.set(-width * 0.43, 5, 0);
    railA.userData.entity = { type: 'stair', stair, floor, group };
    group.add(railA);

    const railB = new THREE.Mesh(new THREE.BoxGeometry(4, 6, depth * 0.9), this.materials.wall);
    railB.position.x = width * 0.43;
    railB.position.y = 5;
    railB.userData.entity = { type: 'stair', stair, floor, group };
    group.add(railB);

    const label = createTextLabel(stair.label, 'campus-map-world-label stair-label');
    label.hidden = true;
    label.addEventListener('click', () => this.selectEntity({ type: 'stair', stair, floor, group }));
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
    this.labels.set(`room-number:${entry.id}`, {
      el: label,
      world: new THREE.Vector3(center.x, 36, center.z),
      entity: { type: 'room-number', label: entry, floor, room, group: roomGroup },
      minZoom: entry.minZoom ?? 0.56,
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
      height: entry.height ?? 0.035,
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

    const labels = (clean.labels || []).map((entry) => ({
      id: entry.id,
      label: entry.label,
      roomId: entry.roomId,
      position: entry.position,
      minZoom: entry.minZoom ?? 0.54,
      importance: entry.importance || 'normal'
    }));

    return {
      ...floor,
      rooms: [...hallwayRooms, ...rooms],
      stairs: stairs.length ? stairs : floor.stairs,
      roomNumberLabels: labels.length ? labels : floor.roomNumberLabels,
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

  addPin(pin, floor) {
    const [x, z] = pin.position;
    const group = new THREE.Group();
    group.position.set(x, 26, z);
    group.name = pin.id;
    group.userData = { type: 'pin', pin, floor, targetY: 26, currentY: 26 };

    const shadow = new THREE.Mesh(new THREE.CircleGeometry(26, 32), this.materials.shadow);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -25.5;
    group.add(shadow);

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(6, 10, 42, 24), this.materials.pin);
    stem.position.y = -4;
    stem.userData.entity = { type: 'pin', pin, floor, group };
    group.add(stem);

    const head = new THREE.Mesh(new THREE.SphereGeometry(19, 32, 18), this.materials.pin);
    head.position.y = 24;
    head.scale.y = 1.1;
    head.userData.entity = { type: 'pin', pin, floor, group };
    group.add(head);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(25, 2.5, 10, 48), this.materials.pinSelected);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 2;
    ring.visible = false;
    group.add(ring);
    group.userData.ring = ring;

    const label = createTextLabel(pin.label, 'campus-map-world-label pin-label');
    label.addEventListener('click', () => this.selectEntity({ type: 'pin', pin, floor, group }));
    this.labelLayer.append(label);
    this.labels.set(`pin:${pin.id}`, { el: label, world: group.position, entity: { type: 'pin', pin, floor, group } });

    this.activeFloorGroup.add(group);
    this.pinGroups.set(pin.id, group);
    this.interactive.push(stem, head);
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

  fitFloor(animated = true) {
    if (!this.activeFloor) return;
    const { initialCamera } = this.activeFloor;
    this.target.set(initialCamera.x, 0, initialCamera.z);
    this.cameraTarget.copy(this.target);
    this.camera.zoom = initialCamera.zoom || 0.75;
    this.camera.updateProjectionMatrix();
    this.updateCamera();
    this.updateLabels();
    if (!animated || REDUCED_MOTION) this.render();
  }

  updateCamera() {
    const tilt = 390;
    this.camera.position.set(this.cameraTarget.x, 900, this.cameraTarget.z + tilt);
    this.camera.lookAt(this.cameraTarget.x, 0, this.cameraTarget.z);
  }

  zoomBy(factor, anchor) {
    const oldZoom = this.camera.zoom;
    const nextZoom = clamp(oldZoom * factor, 0.38, 2.45);
    if (nextZoom === oldZoom) return;

    if (anchor) {
      const before = anchor;
      this.camera.zoom = nextZoom;
      this.camera.updateProjectionMatrix();
      const after = this.screenToWorld(window.innerWidth / 2, window.innerHeight / 2) || before;
      this.target.x += before.x - after.x;
      this.target.z += before.z - after.z;
      this.cameraTarget.copy(this.target);
    } else {
      this.camera.zoom = nextZoom;
      this.camera.updateProjectionMatrix();
    }

    this.updateCamera();
    this.updateLabels();
  }

  handleWheel(event) {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
    this.zoomBy(factor, this.screenToWorld(event.clientX, event.clientY));
  }

  handlePointerDown(event) {
    this.canvas.setPointerCapture(event.pointerId);
    this.updatePointer(event);
    const hit = this.pickEntity();
    this.drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      hit
    };
  }

  handlePointerMove(event) {
    this.updatePointer(event);
    if (this.drag && this.drag.pointerId === event.pointerId) {
      const dx = event.clientX - this.drag.x;
      const dy = event.clientY - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.drag.moved = true;

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

    const hit = this.pickEntity();
    this.setHovered(hit);
  }

  handlePointerUp(event) {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    const hit = this.pickEntity();
    if (!this.drag.moved && hit) this.selectEntity(hit);
    this.drag = null;
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

  pickEntity() {
    if (!this.interactive.length) return null;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.interactive, false);
    const hit = hits.find((entry) => entry.object.userData.entity);
    return hit?.object.userData.entity || null;
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
    this.setHovered(null);
  }

  selectEntity(entity) {
    this.selected = entity;
    this.onSelect(entity);
    this.updatePinMaterials();
    this.updateLabels();
  }

  selectPin(pinId) {
    const group = this.pinGroups.get(pinId);
    if (!group || !this.activeFloor) return;
    this.selectEntity({ type: 'pin', pin: group.userData.pin, floor: this.activeFloor, group });
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
    if (entity.type === 'pin') return `pin:${entity.pin.id}`;
    if (entity.type === 'stair') return `stair:${entity.stair.id}`;
    if (entity.type === 'room-number') return `room-number:${entity.label.id}`;
    return `room:${entity.room.id}`;
  }

  updatePinMaterials() {
    this.pinGroups.forEach((group) => {
      const selected = this.selected?.type === 'pin' && this.selected.pin.id === group.userData.pin.id;
      group.children.forEach((child) => {
        if (child.isMesh && child.material === this.materials.pinSelected) return;
        if (child.isMesh && child.material !== this.materials.shadow) {
          child.material = selected ? this.materials.pinSelected : this.materials.pin;
        }
      });
      if (group.userData.ring) group.userData.ring.visible = selected;
    });
  }

  setPinsVisible(visible) {
    this.pinsVisible = visible;
    this.pinGroups.forEach((group) => {
      group.visible = visible;
    });
    this.updateLabels();
  }

  setDepthEnabled(enabled) {
    this.depthEnabled = enabled;
    this.walls.forEach((wall) => {
      wall.visible = enabled;
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

    this.labels.forEach((record, key) => {
      const pos = record.world.clone();
      if (record.entity.type === 'pin') {
        pos.copy(record.entity.group.position);
        pos.y += 50;
      } else if (record.entity.type === 'stair') {
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
      const isPinLabel = key.startsWith('pin:');
      record.el.classList.toggle('is-active', isActive);
      record.el.hidden = !inView ||
        (isRoomNumber && !zoomVisible && !isActive) ||
        (isRoomLabel && !isActive) ||
        (isStairLabel && !isActive) ||
        (isPinLabel && !this.pinsVisible);
    });
  }

  animate() {
    if (this.disposed) return;
    requestAnimationFrame(() => this.animate());
    const dt = Math.min(0.05, this.clock.getDelta());

    this.roomGroups.forEach((group) => {
      const key = `room:${group.userData.room.id}`;
      const active = key === this.entityKey(this.hovered) || key === this.entityKey(this.selected);
      const targetY = active && this.depthEnabled ? 12 : 0;
      group.userData.currentY += (targetY - group.userData.currentY) * (REDUCED_MOTION ? 1 : Math.min(1, dt * 9));
      group.position.y = group.userData.currentY;
      const top = group.children[0];
      if (top) top.material = active ? (key === this.entityKey(this.selected) ? this.materials.roomSelected : this.materials.roomHover) : this.materials.room;
    });

    this.pinGroups.forEach((group) => {
      const key = `pin:${group.userData.pin.id}`;
      const active = key === this.entityKey(this.hovered) || key === this.entityKey(this.selected);
      const targetY = active ? 48 : 26;
      group.userData.currentY += (targetY - group.userData.currentY) * (REDUCED_MOTION ? 1 : Math.min(1, dt * 10));
      group.position.y = group.userData.currentY;
      group.rotation.y += ((active ? 0.16 : 0) - group.rotation.y) * (REDUCED_MOTION ? 1 : Math.min(1, dt * 8));
      const scale = active ? 1.08 : 1;
      group.scale.lerp(new THREE.Vector3(scale, scale, scale), REDUCED_MOTION ? 1 : Math.min(1, dt * 8));
    });

    this.stairGroups.forEach((group) => {
      const key = `stair:${group.userData.stair.id}`;
      const active = key === this.entityKey(this.hovered) || key === this.entityKey(this.selected);
      const targetY = active && this.depthEnabled ? 13 : 7;
      group.userData.currentY += (targetY - group.userData.currentY) * (REDUCED_MOTION ? 1 : Math.min(1, dt * 9));
      group.position.y = group.userData.currentY;
      const scale = active ? 1.035 : 1;
      group.scale.lerp(new THREE.Vector3(scale, scale, scale), REDUCED_MOTION ? 1 : Math.min(1, dt * 8));
    });

    this.updateLabels();
    this.render();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  clearLabels() {
    this.labels.forEach((record) => record.el.remove());
    this.labels.clear();
    if (this.blueprintLayer) this.blueprintLayer.replaceChildren();
  }

  disposeObject(object) {
    object.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material && !Object.values(this.materials).includes(child.material)) {
        if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
        else child.material.dispose();
      }
    });
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener('resize', this.resizeHandler);
    this.clearLabels();
    this.renderer.dispose();
  }
}

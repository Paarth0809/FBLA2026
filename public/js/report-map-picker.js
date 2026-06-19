const CLEAN_FLOOR_SOURCES = [
  {
    id: 'floor-1',
    label: 'Floor 1',
    locationLabel: 'Floor 1',
    src: '/maps/clean/floor-1-clean.json'
  },
  {
    id: 'floor-2',
    label: 'Floor 2',
    locationLabel: 'Floor 2',
    src: '/maps/clean/floor-2-clean.json'
  },
  {
    id: 'floor-3',
    label: 'Floor 3',
    locationLabel: 'Floor 3',
    src: '/maps/clean/floor-3-clean.json'
  },
  {
    id: 'basement',
    label: 'Basement',
    locationLabel: 'Basement',
    src: '/maps/clean/basement-clean.json',
    fitExcludeIds: ['basement-hallway-1', 'basement-space-1-1']
  }
];

const SVG_NS = 'http://www.w3.org/2000/svg';

function polygonBounds(polygon) {
  return polygon.reduce((bounds, [x, z]) => ({
    minX: Math.min(bounds.minX, x),
    maxX: Math.max(bounds.maxX, x),
    minZ: Math.min(bounds.minZ, z),
    maxZ: Math.max(bounds.maxZ, z)
  }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
}

function mergeBounds(boundsList) {
  return boundsList.reduce((bounds, next) => ({
    minX: Math.min(bounds.minX, next.minX),
    maxX: Math.max(bounds.maxX, next.maxX),
    minZ: Math.min(bounds.minZ, next.minZ),
    maxZ: Math.max(bounds.maxZ, next.maxZ)
  }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
}

function isFiniteBounds(bounds) {
  return Number.isFinite(bounds.minX) &&
    Number.isFinite(bounds.maxX) &&
    Number.isFinite(bounds.minZ) &&
    Number.isFinite(bounds.maxZ) &&
    bounds.maxX > bounds.minX &&
    bounds.maxZ > bounds.minZ;
}

function viewBoxToString(viewBox) {
  return `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`;
}

function cloneViewBox(viewBox) {
  return { x: viewBox.x, y: viewBox.y, width: viewBox.width, height: viewBox.height };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function polygonCenter(polygon) {
  const sum = polygon.reduce((acc, [x, z]) => {
    acc.x += x;
    acc.z += z;
    return acc;
  }, { x: 0, z: 0 });
  return [sum.x / polygon.length, sum.z / polygon.length];
}

function pointInPolygon(point, polygon) {
  const [x, z] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, zi] = polygon[i];
    const [xj, zj] = polygon[j];
    const intersects = ((zi > z) !== (zj > z)) &&
      (x < ((xj - xi) * (z - zi)) / ((zj - zi) || 1e-9) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function clampToBounds(point, bounds) {
  return [
    Math.max(bounds.minX, Math.min(bounds.maxX, point[0])),
    Math.max(bounds.minZ, Math.min(bounds.maxZ, point[1]))
  ];
}

function polygonPoints(polygon) {
  return polygon.map(([x, z]) => `${x},${z}`).join(' ');
}

function getFloorMeta(floorId) {
  return CLEAN_FLOOR_SOURCES.find((entry) => entry.id === floorId) || CLEAN_FLOOR_SOURCES[0];
}

function setHiddenValues(room, pin, activeFloorId) {
  document.getElementById('mapFloorId').value = room ? activeFloorId : '';
  document.getElementById('mapRoomId').value = room?.id || '';
  document.getElementById('mapRoomNumber').value = room?.roomNumber || room?.plannedRoomNumber || '';
  document.getElementById('mapPinX').value = room && pin ? pin[0].toFixed(3) : '';
  document.getElementById('mapPinZ').value = room && pin ? pin[1].toFixed(3) : '';
}

function initReportMapPicker() {
  const mount = document.getElementById('report-map-mini');
  const floorSelect = document.getElementById('report-floor-select');
  const search = document.getElementById('report-room-search');
  const status = document.getElementById('report-map-status');
  const selectedChip = document.getElementById('report-map-selected-chip');
  const clear = document.getElementById('report-map-clear');
  const zoomIn = document.getElementById('report-map-zoom-in');
  const zoomOut = document.getElementById('report-map-zoom-out');
  const fitButton = document.getElementById('report-map-fit');
  const locationInput = document.getElementById('locationFound');
  if (!mount || !floorSelect || !search || !status || !locationInput) return;

  let activeFloorId = floorSelect.value || 'floor-1';
  let cleanByFloor = new Map();
  let rooms = [];
  let selectedRoom = null;
  let selectedPin = null;
  let autoLocationValue = '';
  let userEditedLocation = false;
  let suppressLocationInputTracking = false;
  let svg = null;
  let pinEl = null;
  let roomElements = new Map();
  let draggingPin = false;
  let baseViewBox = null;
  let currentViewBox = null;
  let panning = null;
  let suppressNextMapClick = false;

  locationInput.addEventListener('input', () => {
    if (suppressLocationInputTracking) return;
    const value = locationInput.value.trim();
    userEditedLocation = Boolean(value) && value !== autoLocationValue;
  });

  function activeFloorMeta() {
    return getFloorMeta(activeFloorId);
  }

  function roomLocationText(room) {
    const roomNumber = room.roomNumber || room.plannedRoomNumber || room.label;
    const floor = activeFloorMeta();
    return `${roomNumber ? `Room ${roomNumber}, ` : ''}${floor.locationLabel}`;
  }

  function selectedRoomText(room) {
    return roomLocationText(room).replace(', ', ' • ');
  }

  function shouldAutofillLocation() {
    const current = locationInput.value.trim();
    return !current || (!userEditedLocation && current === autoLocationValue);
  }

  function dispatchLocationValidationEvents() {
    locationInput.dispatchEvent(new Event('input', { bubbles: true }));
    locationInput.dispatchEvent(new Event('change', { bubbles: true }));
    locationInput.classList.remove('input-error', 'shake');
    if (locationInput.hasAttribute('required')) {
      locationInput.classList.toggle('input-valid', locationInput.checkValidity() && Boolean(locationInput.value));
    }
  }

  function setLocationFromMap(nextLocation) {
    autoLocationValue = nextLocation;
    suppressLocationInputTracking = true;
    locationInput.value = nextLocation;
    dispatchLocationValidationEvents();
    suppressLocationInputTracking = false;
    userEditedLocation = false;
  }

  function clearMapGeneratedLocation() {
    if (!autoLocationValue || locationInput.value.trim() !== autoLocationValue) {
      autoLocationValue = '';
      return;
    }
    suppressLocationInputTracking = true;
    locationInput.value = '';
    dispatchLocationValidationEvents();
    suppressLocationInputTracking = false;
    autoLocationValue = '';
    userEditedLocation = false;
  }

  function updateSelectedChip(room) {
    if (!selectedChip) return;
    if (!room) {
      selectedChip.textContent = '';
      selectedChip.classList.add('hidden');
      return;
    }
    selectedChip.textContent = `Selected: ${selectedRoomText(room)}`;
    selectedChip.classList.remove('hidden');
  }

  function clientToWorld(event) {
    if (!svg) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const result = point.matrixTransform(matrix.inverse());
    return [result.x, result.y];
  }

  function eventToWorld(clientX, clientY) {
    if (!svg) return null;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const result = point.matrixTransform(matrix.inverse());
    return [result.x, result.y];
  }

  function applyViewBox() {
    if (!svg || !currentViewBox) return;
    svg.setAttribute('viewBox', viewBoxToString(currentViewBox));
  }

  function constrainViewBox(viewBox) {
    if (!baseViewBox) return viewBox;
    const next = cloneViewBox(viewBox);
    if (next.width >= baseViewBox.width || next.height >= baseViewBox.height) {
      return cloneViewBox(baseViewBox);
    }
    next.x = clamp(next.x, baseViewBox.x, baseViewBox.x + baseViewBox.width - next.width);
    next.y = clamp(next.y, baseViewBox.y, baseViewBox.y + baseViewBox.height - next.height);
    return next;
  }

  function resetViewToFit() {
    if (!baseViewBox) return;
    currentViewBox = cloneViewBox(baseViewBox);
    applyViewBox();
  }

  function zoomBy(factor, anchorClientPoint = null) {
    if (!svg || !baseViewBox || !currentViewBox) return;
    const currentZoom = baseViewBox.width / currentViewBox.width;
    const nextZoom = clamp(currentZoom * factor, 1, 6);
    if (Math.abs(nextZoom - currentZoom) < 0.001) return;

    const anchor = anchorClientPoint
      ? eventToWorld(anchorClientPoint.x, anchorClientPoint.y)
      : [
          currentViewBox.x + currentViewBox.width / 2,
          currentViewBox.y + currentViewBox.height / 2
        ];
    if (!anchor) return;

    const nextWidth = baseViewBox.width / nextZoom;
    const nextHeight = baseViewBox.height / nextZoom;
    const anchorXRatio = (anchor[0] - currentViewBox.x) / currentViewBox.width;
    const anchorYRatio = (anchor[1] - currentViewBox.y) / currentViewBox.height;

    currentViewBox = constrainViewBox({
      x: anchor[0] - anchorXRatio * nextWidth,
      y: anchor[1] - anchorYRatio * nextHeight,
      width: nextWidth,
      height: nextHeight
    });
    applyViewBox();
  }

  function panByClientDelta(deltaX, deltaY) {
    if (!svg || !currentViewBox) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    currentViewBox = constrainViewBox({
      ...currentViewBox,
      x: currentViewBox.x - deltaX * (currentViewBox.width / rect.width),
      y: currentViewBox.y - deltaY * (currentViewBox.height / rect.height)
    });
    applyViewBox();
  }

  function updatePinElement() {
    if (!pinEl || !selectedPin) return;
    pinEl.setAttribute('transform', `translate(${selectedPin[0]} ${selectedPin[1]})`);
  }

  function updateSelection(room, pin = null) {
    selectedRoom = room;
    selectedPin = room ? (pin || polygonCenter(room.polygon)) : null;
    mount.querySelectorAll('.report-map-room.selected').forEach((el) => el.classList.remove('selected'));
    if (room) {
      roomElements.get(room.id)?.classList.add('selected');
      pinEl?.classList.remove('hidden');
      updatePinElement();
      const nextLocation = roomLocationText(room);
      updateSelectedChip(room);
      if (shouldAutofillLocation()) {
        setLocationFromMap(nextLocation);
        status.textContent = `Location set to ${nextLocation}. Drag the pin to refine the exact spot.`;
      } else {
        status.textContent = `Map pin set to ${nextLocation}. Your written location stays unchanged.`;
      }
    } else {
      pinEl?.classList.add('hidden');
      updateSelectedChip(null);
      status.textContent = 'No room selected. You can still submit with the written location above.';
    }
    setHiddenValues(room, selectedPin, activeFloorId);
  }

  function chooseRoomFromPoint(point) {
    const hit = rooms.find((room) => pointInPolygon(point, room.polygon));
    if (hit) updateSelection(hit, point);
  }

  function movePin(point) {
    if (!selectedRoom || !point) return;
    const bounds = polygonBounds(selectedRoom.polygon);
    const clamped = pointInPolygon(point, selectedRoom.polygon) ? point : clampToBounds(point, bounds);
    selectedPin = clamped;
    setHiddenValues(selectedRoom, selectedPin, activeFloorId);
    updatePinElement();
  }

  function rawWorldBounds(clean) {
    const bounds = clean.coordinateSystem?.worldBounds || { minX: -700, minY: -760, maxX: 700, maxY: 760 };
    return {
      minX: bounds.minX,
      maxX: bounds.maxX,
      minZ: bounds.minY ?? bounds.minZ,
      maxZ: bounds.maxY ?? bounds.maxZ
    };
  }

  function computePickerFitBounds(clean) {
    const excludeIds = new Set(activeFloorMeta().fitExcludeIds || []);
    const candidates = [
      ...rooms,
      ...(clean.hallways || [])
    ]
      .filter((entity) => !excludeIds.has(entity.id))
      .filter((entity) => Array.isArray(entity.polygon) && entity.polygon.length >= 3)
      .map((entity) => polygonBounds(entity.polygon))
      .filter(isFiniteBounds);

    const merged = candidates.length ? mergeBounds(candidates) : rawWorldBounds(clean);
    return isFiniteBounds(merged) ? merged : rawWorldBounds(clean);
  }

  function viewBoxFromBounds(bounds) {
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxZ - bounds.minZ;
    const padding = Math.max(45, Math.max(width, height) * 0.07);
    return {
      x: bounds.minX - padding,
      y: bounds.minZ - padding,
      width: width + padding * 2,
      height: height + padding * 2
    };
  }

  function renderPicker(clean) {
    rooms = (clean.rooms || []).map((room) => ({
      ...room,
      roomNumber: room.roomNumber || room.plannedRoomNumber || room.label
    })).filter((room) => Array.isArray(room.polygon) && room.polygon.length >= 3);

    const fitBounds = computePickerFitBounds(clean);
    baseViewBox = viewBoxFromBounds(fitBounds);
    currentViewBox = cloneViewBox(baseViewBox);

    mount.replaceChildren();
    roomElements = new Map();
    svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', viewBoxToString(currentViewBox));
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${activeFloorMeta().label} room picker map`);
    svg.classList.add('report-map-svg');

    const rawBounds = rawWorldBounds(clean);
    const floor = document.createElementNS(SVG_NS, 'rect');
    floor.setAttribute('x', rawBounds.minX - 60);
    floor.setAttribute('y', rawBounds.minZ - 60);
    floor.setAttribute('width', rawBounds.maxX - rawBounds.minX + 120);
    floor.setAttribute('height', rawBounds.maxZ - rawBounds.minZ + 120);
    floor.setAttribute('class', 'report-map-floor');
    svg.append(floor);

    (clean.hallways || []).forEach((hallway) => {
      if (!Array.isArray(hallway.polygon) || hallway.polygon.length < 3) return;
      const poly = document.createElementNS(SVG_NS, 'polygon');
      poly.setAttribute('points', polygonPoints(hallway.polygon));
      poly.setAttribute('class', 'report-map-hallway');
      svg.append(poly);
    });

    rooms.forEach((room) => {
      const poly = document.createElementNS(SVG_NS, 'polygon');
      poly.setAttribute('points', polygonPoints(room.polygon));
      poly.setAttribute('class', 'report-map-room');
      poly.dataset.roomId = room.id;
      roomElements.set(room.id, poly);
      poly.addEventListener('click', (event) => {
        if (suppressNextMapClick) {
          suppressNextMapClick = false;
          return;
        }
        const point = clientToWorld(event) || polygonCenter(room.polygon);
        updateSelection(room, pointInPolygon(point, room.polygon) ? point : polygonCenter(room.polygon));
      });
      svg.append(poly);
    });

    pinEl = document.createElementNS(SVG_NS, 'g');
    pinEl.classList.add('report-map-pin', 'hidden');
    pinEl.innerHTML = '<circle r="15"></circle><path d="M0,-27 L8,-6 L0,0 L-8,-6 Z"></path>';
    pinEl.addEventListener('pointerdown', (event) => {
      draggingPin = true;
      pinEl.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    pinEl.addEventListener('pointermove', (event) => {
      if (!draggingPin) return;
      movePin(clientToWorld(event));
    });
    pinEl.addEventListener('pointerup', () => {
      draggingPin = false;
    });
    pinEl.addEventListener('pointercancel', () => {
      draggingPin = false;
    });
    svg.append(pinEl);

    svg.addEventListener('wheel', (event) => {
      event.preventDefault();
      const deltaMultiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 120 : 1;
      const normalizedDelta = clamp(event.deltaY * deltaMultiplier, -120, 120);
      const factor = clamp(Math.exp(-normalizedDelta * 0.002), 0.82, 1.22);
      zoomBy(factor, { x: event.clientX, y: event.clientY });
    }, { passive: false });

    svg.addEventListener('pointerdown', (event) => {
      if (event.target.closest?.('.report-map-pin')) return;
      const zoom = baseViewBox && currentViewBox ? baseViewBox.width / currentViewBox.width : 1;
      if (zoom <= 1.01) return;
      panning = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        moved: false
      };
      svg.setPointerCapture(event.pointerId);
      svg.classList.add('is-panning');
    });

    svg.addEventListener('pointermove', (event) => {
      if (!panning || panning.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - panning.lastX;
      const deltaY = event.clientY - panning.lastY;
      const totalX = Math.abs(event.clientX - panning.startX);
      const totalY = Math.abs(event.clientY - panning.startY);
      if (totalX > 3 || totalY > 3) panning.moved = true;
      panByClientDelta(deltaX, deltaY);
      panning.lastX = event.clientX;
      panning.lastY = event.clientY;
    });

    svg.addEventListener('pointerup', (event) => {
      if (!panning || panning.pointerId !== event.pointerId) return;
      suppressNextMapClick = panning.moved;
      panning = null;
      svg.classList.remove('is-panning');
    });

    svg.addEventListener('pointercancel', () => {
      panning = null;
      svg.classList.remove('is-panning');
    });

    svg.addEventListener('click', (event) => {
      if (suppressNextMapClick) {
        suppressNextMapClick = false;
        return;
      }
      if (event.target.closest?.('.report-map-pin') || event.target.closest?.('.report-map-room')) return;
      const point = clientToWorld(event);
      if (point) chooseRoomFromPoint(point);
    });

    mount.append(svg);
  }

  function activateFloor(nextFloorId) {
    activeFloorId = nextFloorId;
    search.value = '';
    updateSelection(null);
    const clean = cleanByFloor.get(activeFloorId);
    if (clean) renderPicker(clean);
  }

  search.addEventListener('input', () => {
    const query = search.value.trim().toLowerCase();
    if (!query) return;
    const match = rooms.find((room) => (
      String(room.roomNumber || '').toLowerCase() === query ||
      String(room.label || '').toLowerCase().includes(query)
    ));
    if (match) updateSelection(match);
  });

  floorSelect.addEventListener('change', () => {
    activateFloor(floorSelect.value);
  });

  clear?.addEventListener('click', () => {
    search.value = '';
    clearMapGeneratedLocation();
    updateSelection(null);
  });

  zoomIn?.addEventListener('click', () => zoomBy(1.45));
  zoomOut?.addEventListener('click', () => zoomBy(1 / 1.45));
  fitButton?.addEventListener('click', resetViewToFit);

  Promise.all(CLEAN_FLOOR_SOURCES.map((floor) => (
    fetch(floor.src)
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load ${floor.src}`);
        return response.json();
      })
      .then((clean) => [floor.id, clean])
  )))
    .then((entries) => {
      cleanByFloor = new Map(entries);
      renderPicker(cleanByFloor.get(activeFloorId) || entries[0][1]);
    })
    .catch((error) => {
      console.warn('[report-map-picker]', error);
      mount.innerHTML = '<div class="report-map-loading">Map picker unavailable. You can still submit with the written location.</div>';
    });
}

initReportMapPicker();

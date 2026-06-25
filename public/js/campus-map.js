// Campus map page controller. This module keeps the DOM controls, approved
// found-item locations, floor switching, and Three.js map renderer in sync without
// mixing page UI concerns into the renderer itself.
import { CAMPUS_MAP_FLOORS, getCampusFloor } from './campus-map-data.js?v=explore-world-20260617';
import { CampusMapWorld } from './campus-map-world.js?v=explore-world-20260617';

(function () {
  'use strict';

  const elements = {
    tabs: document.getElementById('floor-tabs'),
    search: document.getElementById('map-search'),
    details: document.getElementById('map-details'),
    viewport: document.querySelector('.campus-map-viewport'),
    canvas: document.getElementById('campus-map-canvas'),
    labelLayer: document.getElementById('campus-map-label-layer'),
    blueprintLayer: document.getElementById('campus-map-blueprint-layer'),
    loading: document.getElementById('map-loading'),
    readout: document.getElementById('map-readout'),
    zoomIn: document.getElementById('map-zoom-in'),
    zoomOut: document.getElementById('map-zoom-out'),
    reset: document.getElementById('map-reset'),
    focusBack: document.getElementById('map-focus-back'),
    viewCube: document.getElementById('campus-view-cube'),
    viewCubeCore: document.getElementById('campus-view-cube-core')
  };

  if (!elements.canvas || !elements.tabs) return;

  let world = null;

  const state = {
    // Persistent page state lives outside CampusMapWorld so floor rebuilds,
    // item-location refreshes, and focus mode can share the same selected context.
    activeFloorId: 'floor-1',
    selectedKey: null,
    focusedRoomId: null,
    mapPins: [],
    mapPinsByRoom: new Map(),
    markerEls: new Map()
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function groupPinsByRoom(items) {
    // Room grouping lets the side panel answer “what is in this room?” without
    // leaking any private contact data from the found-item records.
    const grouped = new Map();
    items.forEach((item) => {
      if (!item.mapRoomId) return;
      if (!grouped.has(item.mapRoomId)) grouped.set(item.mapRoomId, []);
      grouped.get(item.mapRoomId).push(item);
    });
    state.mapPinsByRoom = grouped;
  }

  function itemsForRoom(roomId) {
    return state.mapPinsByRoom.get(roomId) || [];
  }

  function roomCenter(room) {
    if (!Array.isArray(room?.polygon) || !room.polygon.length) return null;
    const total = room.polygon.reduce((sum, point) => ({
      x: sum.x + Number(point[0] || 0),
      z: sum.z + Number(point[1] || 0)
    }), { x: 0, z: 0 });
    return {
      x: total.x / room.polygon.length,
      z: total.z / room.polygon.length
    };
  }

  function passiveMarkerPoint(item) {
    const roomGroup = item.mapRoomId ? world?.roomGroups?.get(item.mapRoomId) : null;
    const room = roomGroup?.userData?.room || world?.activeFloor?.rooms?.find((entry) => entry.id === item.mapRoomId);
    const fallback = roomCenter(room);
    const x = Number.isFinite(Number(item.mapPinX)) ? Number(item.mapPinX) : fallback?.x;
    const z = Number.isFinite(Number(item.mapPinZ)) ? Number(item.mapPinZ) : fallback?.z;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    return {
      x,
      y: (roomGroup?.userData?.wallTopY || 42) + (roomGroup?.userData?.currentY || 0) + 18,
      z
    };
  }

  function markerId(item) {
    return String(item.id || `${item.mapFloorId}:${item.mapRoomId}:${item.mapPinX}:${item.mapPinZ}:${item.itemName}`);
  }

  function markerTitle(item) {
    const name = item.itemName || item.category || 'Found item';
    const room = item.mapRoomNumber ? ` in Room ${item.mapRoomNumber}` : '';
    return `${name}${room}`;
  }

  function renderPassiveMarkers() {
    if (!elements.labelLayer || !world?.activeFloor) return;
    const visibleIds = new Set();
    state.mapPins.forEach((item) => {
      if (item.mapFloorId !== state.activeFloorId || !item.mapRoomId) return;
      const point = passiveMarkerPoint(item);
      if (!point) return;
      const id = markerId(item);
      let marker = state.markerEls.get(id);
      if (!marker) {
        marker = document.createElement('span');
        marker.className = 'campus-map-passive-marker';
        marker.setAttribute('aria-hidden', 'true');
        elements.labelLayer.append(marker);
        state.markerEls.set(id, marker);
      }
      const projected = world.projectWorldPoint({
        x: point.x,
        y: point.y,
        z: point.z
      });
      marker.title = markerTitle(item);
      marker.hidden = !projected || !projected.inView;
      if (projected) {
        marker.style.transform = `translate3d(${projected.x}px, ${projected.y}px, 0) translate(-50%, -100%)`;
      }
      visibleIds.add(id);
    });

    state.markerEls.forEach((marker, id) => {
      if (!visibleIds.has(id)) {
        marker.remove();
        state.markerEls.delete(id);
      }
    });
  }

  function itemCardHtml(item) {
    const title = escapeHtml(item.itemName || 'Found item');
    const description = escapeHtml(item.description || 'No description provided.');
    const category = escapeHtml(item.category || 'Found item');
    const room = item.mapRoomNumber ? `Room ${escapeHtml(item.mapRoomNumber)}` : 'Mapped location';
    const claimUrl = escapeHtml(item.claimUrl || `/claim.html?id=${encodeURIComponent(item.id)}&type=found`);
    const detailUrl = escapeHtml(item.detailUrl || `/item.html?id=${encodeURIComponent(item.id)}`);
    const photo = item.photo ? `<img src="/uploads/${escapeHtml(item.photo)}" alt="${title} photo">` : `
      <div class="campus-map-item-photo-placeholder">
        <span class="material-symbols-outlined" aria-hidden="true">inventory_2</span>
      </div>
    `;

    return `
      <article class="campus-map-item-card">
        <div class="campus-map-item-photo">${photo}</div>
        <div class="campus-map-item-body">
          <strong>${title}</strong>
          <span>${category} · ${room}</span>
          <p>${description}</p>
          <div class="campus-map-item-actions">
            <a href="${detailUrl}">View Item</a>
            <a href="${claimUrl}">Claim</a>
          </div>
        </div>
      </article>
    `;
  }

  function roomItemSection(room) {
    const items = itemsForRoom(room.id);
    if (!items.length) {
      return `
        <div class="campus-map-room-items empty">
          <span class="material-symbols-outlined" aria-hidden="true">location_off</span>
          <p>No approved found items are mapped to this room yet.</p>
        </div>
      `;
    }

    return `
      <div class="campus-map-room-items">
        <h4>Approved found items here</h4>
        ${items.map(itemCardHtml).join('')}
      </div>
    `;
  }

  function roomHoverSummary(room) {
    const items = itemsForRoom(room.id);
    const count = items.length;
    const itemCopy = count === 1 ? '1 approved item here' : `${count} approved items here`;
    return `
      <div class="campus-map-room-items campus-map-room-items-preview${count ? '' : ' empty'}">
        <span class="material-symbols-outlined" aria-hidden="true">${count ? 'inventory_2' : 'location_off'}</span>
        <p>${count ? itemCopy : 'No approved found items are mapped to this room yet.'}</p>
      </div>
    `;
  }

  async function loadMapPins() {
    // The backend only returns approved, privacy-safe map locations. If this fetch
    // fails, the map remains usable rather than blocking the whole page.
    try {
      const response = await fetch('/api/items/map-pins', { credentials: 'include' });
      if (!response.ok) throw new Error(`Map item locations failed: ${response.status}`);
      const items = await response.json();
      state.mapPins = Array.isArray(items) ? items : [];
      groupPinsByRoom(state.mapPins);
      renderPassiveMarkers();
    } catch (error) {
      console.warn('[campus-map] Could not load approved found-item locations', error);
      state.mapPins = [];
      groupPinsByRoom([]);
      renderPassiveMarkers();
    }
  }

  function getFloor(id = state.activeFloorId) {
    return getCampusFloor(id);
  }

  function setLoading(isLoading) {
    elements.loading?.classList.toggle('hidden', !isLoading);
  }

  function iconForEntity(entity) {
    if (!entity) return 'explore';
    if (entity.type === 'stair') return 'stairs';
    if (entity.room.kind === 'Hallway') return 'route';
    if (entity.room.kind === 'Major zone') return 'domain';
    return 'layers';
  }

  function updateReadout(extra = '') {
    if (!elements.readout) return;
    elements.readout.replaceChildren(document.createTextNode(extra || 'Explore Mode'));
  }

  function updateDefaultDetails(floor = getFloor()) {
    // The details card doubles as lightweight onboarding for judges and first
    // time users, so it resets to clear map controls whenever nothing is chosen.
    if (!elements.details) return;
    elements.details.innerHTML = `
      <span class="material-symbols-outlined filled" aria-hidden="true">explore</span>
      <h3>${floor.label}</h3>
      <p>${floor.description}</p>
      <div class="campus-map-detail-meta">
        <span>Drag to pan</span>
        <span>Wheel or pinch to zoom</span>
        <span>Tap a room to view approved items here</span>
      </div>
    `;
    updateReadout(world?.rendererLabel || 'Explore Mode');
  }

  function updateDetails(entity, preview = false) {
    if (!elements.details) return;
    if (!entity) {
      updateDefaultDetails();
      return;
    }

    if (entity.type === 'stair') {
      elements.details.innerHTML = `
        <span class="material-symbols-outlined filled" aria-hidden="true">${iconForEntity(entity)}</span>
        <h3>${entity.stair.label}</h3>
        <p>Stair block on ${entity.floor.label}, modeled as raised tread geometry for the indoor map.</p>
        <div class="campus-map-detail-meta">
          <span>${preview ? 'Previewing' : 'Selected'}</span>
          <span>Vertical circulation</span>
        </div>
      `;
      return;
    }

    elements.details.innerHTML = selectedRoomDetails(entity, preview);
  }

  function selectedRoomDetails(entity, preview = false) {
    const roomNumber = entity.room.plannedRoomNumber ? ` Room ${entity.room.plannedRoomNumber}.` : '';
    const focusCopy = state.focusedRoomId === entity.room.id ? 'Focused room view' : preview ? 'Hovering' : 'Selected';
    return `
      <span class="material-symbols-outlined filled" aria-hidden="true">${iconForEntity(entity)}</span>
      <h3>${escapeHtml(entity.room.label)}</h3>
      <p>${escapeHtml(entity.room.kind)} on ${escapeHtml(entity.floor.label)}.${escapeHtml(roomNumber)} Click a room to enter top-down focus mode and inspect approved found items in that room.</p>
      <div class="campus-map-detail-meta">
        <span>${focusCopy}</span>
        <span>${entity.room.selectable ? 'Selectable zone' : 'Reference zone'}</span>
      </div>
      ${preview ? roomHoverSummary(entity.room) : roomItemSection(entity.room)}
    `;
  }

  function updateFloorTabs() {
    elements.tabs.replaceChildren();
    CAMPUS_MAP_FLOORS.forEach((floor) => {
      const active = floor.id === state.activeFloorId;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `campus-floor-tab${active ? ' active' : ''}`;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(active));
      button.innerHTML = `<span>${floor.short}</span><strong>${floor.label}</strong>`;
      button.addEventListener('click', () => setFloor(floor.id));
      elements.tabs.append(button);
    });
  }

  async function setFloor(floorId) {
    const floor = getFloor(floorId);
    state.activeFloorId = floor.id;
    state.selectedKey = null;
    setLoading(true);
    updateFloorTabs();
    updateDefaultDetails(floor);
    try {
      await world.setFloor(floor);
      updateReadout(world.rendererLabel || 'Explore Mode');
      renderPassiveMarkers();
    } finally {
      setLoading(false);
    }
  }

  function searchableRoomsForFloor(floor) {
    if (world?.activeFloor?.id === floor.id && Array.isArray(world.activeFloor.rooms)) {
      return world.activeFloor.rooms;
    }
    return floor.rooms || [];
  }

  function searchableLabelsForFloor(floor) {
    if (world?.activeFloor?.id === floor.id && Array.isArray(world.activeFloor.roomNumberLabels)) {
      return world.activeFloor.roomNumberLabels;
    }
    return floor.roomNumberLabels || [];
  }

  function findMatch(term) {
    // Search spans floor names, approved found-item locations, CAD-derived rooms,
    // typed labels, and stairs so users can jump to a room number.
    const normalized = term.trim().toLowerCase();
    if (!normalized) return null;

    for (const floor of CAMPUS_MAP_FLOORS) {
      if (
        floor.label.toLowerCase().includes(normalized) ||
        floor.description.toLowerCase().includes(normalized) ||
        String(floor.level).includes(normalized)
      ) {
        return { floor };
      }

      const livePin = state.mapPins.find((item) => (
        item.mapFloorId === floor.id &&
        [
          item.itemName,
          item.category,
          item.description,
          item.mapRoomNumber
        ].some((value) => String(value || '').toLowerCase().includes(normalized))
      ));
      if (livePin) return { floor, livePin };

      const rooms = searchableRoomsForFloor(floor);
      const room = rooms.find((entry) => (
        entry.label.toLowerCase().includes(normalized) ||
        entry.kind.toLowerCase().includes(normalized) ||
        String(entry.plannedRoomNumber || '').toLowerCase().includes(normalized)
      ));
      if (room) return { floor, room };

      const numberLabel = searchableLabelsForFloor(floor).find((entry) => entry.label.toLowerCase().includes(normalized));
      if (numberLabel) {
        const labeledRoom = rooms.find((entry) => entry.id === numberLabel.roomId);
        if (labeledRoom) return { floor, room: labeledRoom };
      }

      const stair = floor.stairs?.find((entry) => (
        entry.label.toLowerCase().includes(normalized) ||
        entry.id.toLowerCase().includes(normalized)
      ));
      if (stair) return { floor, stair };
    }

    return null;
  }

  async function handleSearch() {
    const match = findMatch(elements.search.value);
    if (!match) {
      updateDefaultDetails();
      return;
    }

    const selectAfterFloor = () => {
      if (match.livePin?.mapRoomId) world.selectRoom(match.livePin.mapRoomId);
      if (match.room) world.selectRoom(match.room.id);
      if (match.stair) world.selectStair(match.stair.id);
    };

    if (match.floor.id !== state.activeFloorId) {
      await setFloor(match.floor.id);
      selectAfterFloor();
      return;
    }

    selectAfterFloor();
  }

  world = new CampusMapWorld({
    canvas: elements.canvas,
    labelLayer: elements.labelLayer,
    blueprintLayer: elements.blueprintLayer,
    viewCube: elements.viewCube,
    viewCubeCore: elements.viewCubeCore,
    onFrame: () => renderPassiveMarkers(),
    onReady: ({ renderer } = {}) => updateReadout(renderer || '2.5D world'),
    onHover: (entity) => {
      if (!state.selectedKey) updateDetails(entity, true);
    },
    onSelect: (entity) => {
      state.selectedKey = entity ? `${entity.type}:${entity.type === 'stair' ? entity.stair.id : entity.room.id}` : null;
      updateDetails(entity);
    },
    onFocusChange: ({ active, room }) => {
      // Room focus is a camera state, but the page shell owns the Back button
      // and side-panel copy so keyboard and screen-reader users get the context.
      state.focusedRoomId = active && room ? room.id : null;
      elements.focusBack?.classList.toggle('hidden', !active);
      if (active && room && world?.activeFloor) {
        const group = world.roomGroups?.get(room.id);
        updateDetails({ type: 'room', room, floor: world.activeFloor, group });
      }
      if (!active && !state.selectedKey) updateDefaultDetails();
    }
  });

  elements.zoomIn?.addEventListener('click', () => world.zoomBy(1.16));
  elements.zoomOut?.addEventListener('click', () => world.zoomBy(1 / 1.16));
  elements.reset?.addEventListener('click', () => {
    world.exitRoomFocus({ restore: false });
    world.setCameraPreset('iso', { keepZoom: true, duration: 0.42 });
    world.fitFloor();
    state.focusedRoomId = null;
    state.selectedKey = null;
    updateDefaultDetails();
  });
  elements.focusBack?.addEventListener('click', () => {
    world.exitRoomFocus();
    state.focusedRoomId = null;
    state.selectedKey = null;
    updateDefaultDetails();
  });
  elements.viewCube?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-view]');
    if (!button) return;
    if (button.dataset.view !== 'top') world.exitRoomFocus({ restore: false });
    world.setCameraPreset(button.dataset.view, { keepZoom: true });
  });
  elements.search?.addEventListener('input', handleSearch);

  updateFloorTabs();
  loadMapPins().finally(() => setFloor(state.activeFloorId));
})();

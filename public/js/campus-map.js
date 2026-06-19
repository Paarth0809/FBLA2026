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
    viewCubeCore: document.getElementById('campus-view-cube-core'),
    togglePins: document.getElementById('toggle-pins'),
    toggleDepth: document.getElementById('toggle-depth'),
    toggleBlueprint: document.getElementById('toggle-blueprint')
  };

  if (!elements.canvas || !elements.tabs) return;

  const state = {
    activeFloorId: 'floor-1',
    selectedKey: null,
    focusedRoomId: null,
    mapPins: [],
    mapPinsByRoom: new Map()
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

  function itemCardHtml(item) {
    const title = escapeHtml(item.itemName || 'Found item');
    const description = escapeHtml(item.description || 'No description provided.');
    const category = escapeHtml(item.category || 'Found item');
    const room = item.mapRoomNumber ? `Room ${escapeHtml(item.mapRoomNumber)}` : 'Pinned location';
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
          <p>No approved found items are pinned in this room yet.</p>
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

  async function loadMapPins() {
    try {
      const response = await fetch('/api/items/map-pins', { credentials: 'include' });
      if (!response.ok) throw new Error(`Map pins failed: ${response.status}`);
      const items = await response.json();
      state.mapPins = Array.isArray(items) ? items : [];
      groupPinsByRoom(state.mapPins);
      world?.setLivePins(state.mapPins);
    } catch (error) {
      console.warn('[campus-map] Could not load approved found-item pins', error);
      state.mapPins = [];
      groupPinsByRoom([]);
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
    if (entity.type === 'pin') return entity.pin.live ? 'inventory_2' : entity.pin.status === 'connector' ? 'conversion_path' : 'location_on';
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
    if (!elements.details) return;
    elements.details.innerHTML = `
      <span class="material-symbols-outlined filled" aria-hidden="true">explore</span>
      <h3>${floor.label}</h3>
      <p>${floor.description}</p>
      <div class="campus-map-detail-meta">
        <span>Drag to pan</span>
        <span>Wheel or pinch to zoom</span>
        <span>Tap a pin or zone</span>
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

    if (entity.type === 'pin') {
      if (entity.pin.live && entity.pin.item) {
        const item = entity.pin.item;
        const roomCopy = item.mapRoomNumber ? `Room ${escapeHtml(item.mapRoomNumber)}, ${escapeHtml(entity.floor.label)}` : escapeHtml(entity.floor.label);
        elements.details.innerHTML = `
          <span class="material-symbols-outlined filled" aria-hidden="true">inventory_2</span>
          <h3>${escapeHtml(item.itemName)}</h3>
          <p>${escapeHtml(item.description || 'Approved found item pinned to this map location.')}</p>
          <div class="campus-map-detail-meta">
            <span>${preview ? 'Previewing' : 'Selected'}</span>
            <span>${roomCopy}</span>
          </div>
          <div class="campus-map-room-items">
            ${itemCardHtml(item)}
          </div>
        `;
        return;
      }
      elements.details.innerHTML = `
        <span class="material-symbols-outlined filled" aria-hidden="true">${iconForEntity(entity)}</span>
        <h3>${entity.pin.label}</h3>
        <p>${entity.pin.type} on ${entity.floor.label}. These are sample anchors for future found-item location pins.</p>
        <div class="campus-map-detail-meta">
          <span>${preview ? 'Previewing' : 'Selected'}</span>
          <span>${entity.pin.status === 'connector' ? 'Connector' : 'Example pin'}</span>
        </div>
      `;
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

    const roomNumber = entity.room.plannedRoomNumber ? ` Room ${entity.room.plannedRoomNumber}.` : '';
    const focusCopy = state.focusedRoomId === entity.room.id ? 'Focused room view' : preview ? 'Hovering' : 'Selected';
    elements.details.innerHTML = `
      <span class="material-symbols-outlined filled" aria-hidden="true">${iconForEntity(entity)}</span>
      <h3>${escapeHtml(entity.room.label)}</h3>
      <p>${escapeHtml(entity.room.kind)} on ${escapeHtml(entity.floor.label)}.${escapeHtml(roomNumber)} Click a room to enter top-down focus mode and inspect pinned item locations inside it.</p>
      <div class="campus-map-detail-meta">
        <span>${focusCopy}</span>
        <span>${entity.room.selectable ? 'Selectable zone' : 'Reference zone'}</span>
      </div>
      ${roomItemSection(entity.room)}
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
      world.setLivePins(state.mapPins);
      updateReadout(world.rendererLabel || 'Explore Mode');
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

      const pin = floor.pins.find((entry) => (
        entry.label.toLowerCase().includes(normalized) ||
        entry.type.toLowerCase().includes(normalized)
      ));
      if (pin) return { floor, pin };

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
      if (match.pin) world.selectPin(match.pin.id);
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

  const world = new CampusMapWorld({
    canvas: elements.canvas,
    labelLayer: elements.labelLayer,
    blueprintLayer: elements.blueprintLayer,
    viewCube: elements.viewCube,
    viewCubeCore: elements.viewCubeCore,
    onReady: ({ renderer } = {}) => updateReadout(renderer || '2.5D world'),
    onHover: (entity) => {
      if (!state.selectedKey) updateDetails(entity, true);
    },
    onSelect: (entity) => {
      state.selectedKey = entity ? `${entity.type}:${entity.type === 'pin' ? entity.pin.id : entity.type === 'stair' ? entity.stair.id : entity.room.id}` : null;
      updateDetails(entity);
    },
    onFocusChange: ({ active, room }) => {
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
  elements.togglePins?.addEventListener('change', () => world.setPinsVisible(elements.togglePins.checked));
  elements.toggleDepth?.addEventListener('change', () => {
    const enabled = elements.toggleDepth.checked;
    elements.viewport?.setAttribute('data-depth-enabled', String(enabled));
    world.setDepthEnabled(enabled);
  });
  elements.toggleBlueprint?.addEventListener('change', () => world.setBlueprintVisible(elements.toggleBlueprint.checked));

  updateFloorTabs();
  loadMapPins().finally(() => setFloor(state.activeFloorId));
})();

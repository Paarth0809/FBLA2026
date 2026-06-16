import { CAMPUS_MAP_FLOORS, getCampusFloor } from './campus-map-data.js';
import { CampusMapWorld } from './campus-map-world.js';

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
    togglePins: document.getElementById('toggle-pins'),
    toggleDepth: document.getElementById('toggle-depth'),
    toggleBlueprint: document.getElementById('toggle-blueprint')
  };

  if (!elements.canvas || !elements.tabs) return;

  const state = {
    activeFloorId: 'floor-1',
    selectedKey: null
  };

  function getFloor(id = state.activeFloorId) {
    return getCampusFloor(id);
  }

  function setLoading(isLoading) {
    elements.loading?.classList.toggle('hidden', !isLoading);
  }

  function iconForEntity(entity) {
    if (!entity) return 'explore';
    if (entity.type === 'pin') return entity.pin.status === 'connector' ? 'conversion_path' : 'location_on';
    if (entity.type === 'stair') return 'stairs';
    if (entity.room.kind === 'Hallway') return 'route';
    if (entity.room.kind === 'Major zone') return 'domain';
    return 'layers';
  }

  function updateReadout(extra = '') {
    if (!elements.readout) return;
    elements.readout.replaceChildren(document.createTextNode(extra || 'Interactive map'));
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
    updateReadout(world?.renderer ? '2.5D world' : '');
  }

  function updateDetails(entity, preview = false) {
    if (!elements.details) return;
    if (!entity) {
      updateDefaultDetails();
      return;
    }

    if (entity.type === 'pin') {
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
    elements.details.innerHTML = `
      <span class="material-symbols-outlined filled" aria-hidden="true">${iconForEntity(entity)}</span>
      <h3>${entity.room.label}</h3>
      <p>${entity.room.kind} on ${entity.floor.label}.${roomNumber} Crisp room-number labels are rendered as map UI, not traced scan text.</p>
      <div class="campus-map-detail-meta">
        <span>${preview ? 'Hovering' : 'Selected'}</span>
        <span>${entity.room.selectable ? 'Selectable zone' : 'Reference zone'}</span>
      </div>
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

  function setFloor(floorId) {
    const floor = getFloor(floorId);
    state.activeFloorId = floor.id;
    state.selectedKey = null;
    setLoading(true);
    updateFloorTabs();
    world.setFloor(floor);
    updateDefaultDetails(floor);
    updateReadout('2.5D world');
    setLoading(false);
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

      const room = floor.rooms.find((entry) => (
        entry.label.toLowerCase().includes(normalized) ||
        entry.kind.toLowerCase().includes(normalized) ||
        String(entry.plannedRoomNumber || '').toLowerCase().includes(normalized)
      ));
      if (room) return { floor, room };

      const numberLabel = floor.roomNumberLabels?.find((entry) => entry.label.toLowerCase().includes(normalized));
      if (numberLabel) {
        const labeledRoom = floor.rooms.find((entry) => entry.id === numberLabel.roomId);
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

  function handleSearch() {
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
      setFloor(match.floor.id);
      requestAnimationFrame(selectAfterFloor);
      return;
    }

    selectAfterFloor();
  }

  const world = new CampusMapWorld({
    canvas: elements.canvas,
    labelLayer: elements.labelLayer,
    blueprintLayer: elements.blueprintLayer,
    onReady: () => updateReadout('2.5D world'),
    onHover: (entity) => {
      if (!state.selectedKey) updateDetails(entity, true);
    },
    onSelect: (entity) => {
      state.selectedKey = entity ? `${entity.type}:${entity.type === 'pin' ? entity.pin.id : entity.type === 'stair' ? entity.stair.id : entity.room.id}` : null;
      updateDetails(entity);
    }
  });

  elements.zoomIn?.addEventListener('click', () => world.zoomBy(1.16));
  elements.zoomOut?.addEventListener('click', () => world.zoomBy(1 / 1.16));
  elements.reset?.addEventListener('click', () => {
    world.fitFloor();
    updateDefaultDetails();
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
  setFloor(state.activeFloorId);
})();

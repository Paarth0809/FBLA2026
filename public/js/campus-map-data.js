/*
 * campus-map-data.js
 * Curated geometry for the premium 2.5D campus map.
 *
 * The scanned/vectorized plans remain source references. This file defines the
 * clean interactive map world: plates, rooms, stairs, crisp room-number labels,
 * and no-label SVG linework for high-fidelity wall/detail rendering.
 */

const rect = (x, z, width, depth) => ([
  [x, z],
  [x + width, z],
  [x + width, z + depth],
  [x, z + depth]
]);

const room = (id, label, kind, polygon, options = {}) => ({
  id,
  label,
  kind,
  polygon,
  height: options.height ?? 0.08,
  selectable: options.selectable !== false,
  plannedRoomNumber: options.plannedRoomNumber ?? null,
  importance: options.importance ?? 'normal'
});

const numberedRoom = (floorId, number, polygon, options = {}) => room(
  `${floorId}-${number.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  options.label || `Room ${number}`,
  options.kind || 'Classroom',
  polygon,
  { ...options, plannedRoomNumber: number }
);

const pin = (id, label, type, position, status = 'example') => ({
  id,
  label,
  type,
  status,
  position,
  linkedItemId: null
});

const detailLayer = (id, src, frame, options = {}) => ({
  id,
  src,
  frame,
  cadGeometry: options.cadGeometry ?? null,
  cadThickness: options.cadThickness ?? 4.5,
  cadHeight: options.cadHeight ?? 9,
  opacity: options.opacity ?? 0.42,
  elevation: options.elevation ?? 23,
  color: options.color ?? '#21372c'
});

const stair = (id, label, position, size, options = {}) => ({
  id,
  label,
  position,
  size,
  rotation: options.rotation ?? 0,
  treads: options.treads ?? 8
});

function roomLabel(roomEntry, options = {}) {
  return {
    id: `${roomEntry.id}-number`,
    label: roomEntry.plannedRoomNumber,
    roomId: roomEntry.id,
    position: options.position || null,
    minZoom: options.minZoom ?? 0.56,
    importance: roomEntry.importance || 'normal'
  };
}

function labelsFromRooms(rooms, overrides = {}) {
  return rooms
    .filter((entry) => entry.plannedRoomNumber)
    .map((entry) => roomLabel(entry, overrides[entry.plannedRoomNumber] || {}));
}

const f1Rooms = [
  numberedRoom('f1', '1629', rect(-682, -535, 86, 90)),
  numberedRoom('f1', '1627', rect(-586, -535, 84, 90)),
  numberedRoom('f1', '1625', rect(-492, -535, 84, 90)),
  numberedRoom('f1', '1623', rect(-398, -535, 122, 90)),
  numberedRoom('f1', '1621', rect(-185, -535, 175, 90)),
  numberedRoom('f1', '1619', rect(100, -535, 150, 90)),
  numberedRoom('f1', '1617', rect(260, -535, 190, 90)),
  numberedRoom('f1', '1634', rect(-704, -385, 120, 68)),
  numberedRoom('f1', '1640', rect(-704, -305, 120, 70)),
  numberedRoom('f1', '1626', rect(-510, -370, 70, 58)),
  numberedRoom('f1', '1628', rect(-510, -435, 72, 50)),
  numberedRoom('f1', '1642', rect(-700, -225, 270, 300), { label: '1642 Auxiliary Gym', kind: 'Major zone', height: 0.14, importance: 'major' }),
  numberedRoom('f1', '1631', rect(-305, -365, 68, 58)),
  numberedRoom('f1', '1633', rect(-305, -300, 68, 58)),
  numberedRoom('f1', '1635', rect(-305, -232, 64, 86)),
  numberedRoom('f1', '1637', rect(-305, -140, 64, 88)),
  numberedRoom('f1', '1639', rect(-252, -10, 96, 48)),
  numberedRoom('f1', '1641', rect(-120, -10, 98, 48)),
  numberedRoom('f1', '1601', rect(-210, -405, 390, 285), { label: '1601 Gym', kind: 'Major zone', height: 0.15, importance: 'major' }),
  numberedRoom('f1', '1602', rect(-18, -104, 48, 42), { kind: 'Support' }),
  numberedRoom('f1', '1601A', rect(130, -100, 128, 52), { kind: 'Support' }),
  numberedRoom('f1', '1603', rect(280, -104, 36, 58), { kind: 'Support' }),
  numberedRoom('f1', '1614', rect(438, -385, 110, 60)),
  numberedRoom('f1', '1616', rect(552, -405, 44, 78), { kind: 'Support' }),
  numberedRoom('f1', '1608', rect(438, -312, 150, 74)),
  numberedRoom('f1', '1606', rect(438, -225, 150, 76)),
  numberedRoom('f1', '1604', rect(438, -135, 150, 86)),
  numberedRoom('f1', '1408', rect(418, 15, 58, 46), { kind: 'Support' }),
  numberedRoom('f1', '1410A', rect(506, 96, 95, 74), { kind: 'Support' }),
  numberedRoom('f1', '1410D', rect(455, 126, 66, 70), { kind: 'Support' }),
  numberedRoom('f1', '1404', rect(360, 98, 75, 43), { kind: 'Support' }),
  numberedRoom('f1', '1403', rect(310, 188, 58, 44), { kind: 'Support' }),
  numberedRoom('f1', '1405', rect(378, 188, 58, 44), { kind: 'Support' }),
  numberedRoom('f1', '1407', rect(446, 188, 58, 44), { kind: 'Support' }),
  numberedRoom('f1', '1501', rect(-315, 92, 405, 285), { label: '1501 Cafeteria', kind: 'Major zone', height: 0.14, importance: 'major' }),
  numberedRoom('f1', '1209', rect(235, 210, 300, 270), { label: '1209 Auditorium', kind: 'Major zone', height: 0.14, importance: 'major' }),
  numberedRoom('f1', '1201', [[210, 112], [260, 96], [292, 164], [238, 185]], { kind: 'Support' }),
  numberedRoom('f1', '1203', [[235, 450], [288, 432], [306, 488], [252, 508]], { kind: 'Support' }),
  numberedRoom('f1', '1230', rect(615, 205, 92, 175)),
  numberedRoom('f1', '1228', rect(615, 397, 92, 110)),
  numberedRoom('f1', '1222', rect(615, 530, 92, 98)),
  numberedRoom('f1', '1145', rect(-430, 560, 84, 68)),
  numberedRoom('f1', '1147', rect(-430, 635, 84, 68)),
  numberedRoom('f1', '1149', rect(-330, 635, 74, 68)),
  numberedRoom('f1', '1151', rect(-170, 560, 92, 70)),
  numberedRoom('f1', '1153', rect(-170, 640, 92, 70)),
  numberedRoom('f1', '1155', rect(-68, 640, 110, 70)),
  numberedRoom('f1', '1157', rect(52, 640, 122, 70)),
  numberedRoom('f1', '1159', rect(188, 640, 110, 70)),
  numberedRoom('f1', '1137', rect(-430, 740, 84, 58)),
  numberedRoom('f1', '1135', rect(-320, 740, 96, 88)),
  numberedRoom('f1', '1133', rect(-260, 860, 92, 82)),
  numberedRoom('f1', '1131', rect(-430, 880, 86, 62)),
  numberedRoom('f1', '1129', rect(-430, 950, 86, 62)),
  numberedRoom('f1', '1127', rect(-430, 1020, 86, 62)),
  numberedRoom('f1', '1125', rect(-430, 1090, 86, 62)),
  numberedRoom('f1', '1123', rect(-430, 1160, 86, 62)),
  numberedRoom('f1', '1121', rect(-220, 1168, 72, 54)),
  numberedRoom('f1', '1119', rect(-138, 1168, 72, 54)),
  numberedRoom('f1', '1101', rect(35, 748, 86, 66)),
  numberedRoom('f1', '1103', rect(-62, 748, 86, 66)),
  numberedRoom('f1', '1105', rect(-160, 748, 86, 66)),
  numberedRoom('f1', '1107', rect(-245, 748, 48, 54)),
  numberedRoom('f1', '1109', rect(-300, 748, 48, 54)),
  numberedRoom('f1', '1111', rect(-245, 820, 96, 66)),
  numberedRoom('f1', '1113', rect(-245, 894, 96, 66)),
  numberedRoom('f1', '1115', rect(-245, 970, 96, 66)),
  numberedRoom('f1', '1117', rect(-245, 1046, 96, 66)),
  numberedRoom('f1', '1214', rect(300, 650, 98, 88)),
  numberedRoom('f1', '1216', rect(300, 750, 98, 88)),
  numberedRoom('f1', '1218', rect(300, 850, 98, 88)),
  numberedRoom('f1', '1220', rect(430, 875, 168, 122), { kind: 'Major zone', importance: 'major' })
];

const f2Rooms = [
  numberedRoom('f2', '2201', rect(-610, -320, 135, 145), { label: '2201 Media Center', kind: 'Major zone', importance: 'major' }),
  numberedRoom('f2', '2203', rect(-720, -285, 92, 96)),
  numberedRoom('f2', '2205', rect(-745, -395, 70, 52), { kind: 'Support' }),
  numberedRoom('f2', '2206', rect(-330, -285, 88, 60), { kind: 'Support' }),
  numberedRoom('f2', '2101', rect(-140, -80, 100, 78)),
  numberedRoom('f2', '2103', rect(-30, -80, 100, 78)),
  numberedRoom('f2', '2105', rect(80, -80, 100, 78)),
  numberedRoom('f2', '2107', rect(190, -80, 44, 42)),
  numberedRoom('f2', '2109', rect(190, -32, 44, 42)),
  numberedRoom('f2', '2111', rect(265, -205, 118, 88)),
  numberedRoom('f2', '2113', rect(392, -205, 118, 88)),
  numberedRoom('f2', '2115', rect(520, -205, 118, 88)),
  numberedRoom('f2', '2117', rect(650, -205, 92, 70)),
  numberedRoom('f2', '2119', rect(650, -125, 92, 70)),
  numberedRoom('f2', '2121', rect(650, -45, 92, 70)),
  numberedRoom('f2', '2123', rect(650, 35, 92, 70)),
  numberedRoom('f2', '2125', rect(650, 115, 92, 70)),
  numberedRoom('f2', '2127', rect(650, 195, 92, 70)),
  numberedRoom('f2', '2129', rect(650, 275, 92, 70)),
  numberedRoom('f2', '2131', rect(535, 300, 96, 72)),
  numberedRoom('f2', '2133', rect(330, 420, 126, 88)),
  numberedRoom('f2', '2135', rect(218, 505, 76, 62)),
  numberedRoom('f2', '2137', rect(105, 505, 76, 62)),
  numberedRoom('f2', '2139', rect(-8, 505, 76, 62)),
  numberedRoom('f2', '2141', rect(-120, 505, 76, 62)),
  numberedRoom('f2', '2143', rect(-232, 505, 76, 62)),
  numberedRoom('f2', '2145', rect(-330, 420, 96, 84)),
  numberedRoom('f2', '2147', rect(-282, 228, 82, 58)),
  numberedRoom('f2', '2149', rect(-190, 228, 82, 58)),
  numberedRoom('f2', '2151', rect(-98, 228, 82, 58)),
  numberedRoom('f2', '2153', rect(-6, 228, 82, 58)),
  numberedRoom('f2', '2155', rect(86, 228, 92, 58)),
  numberedRoom('f2', '2112', rect(345, 100, 42, 36), { kind: 'Support' }),
  numberedRoom('f2', '2116', rect(394, 100, 42, 36), { kind: 'Support' }),
  numberedRoom('f2', '2124', rect(442, 100, 42, 36), { kind: 'Support' }),
  numberedRoom('f2', '2134', rect(100, 388, 70, 58), { kind: 'Support' })
];

const f3Rooms = [
  numberedRoom('f3', '3101', rect(418, -330, 92, 70)),
  numberedRoom('f3', '3103', rect(318, -330, 92, 70)),
  numberedRoom('f3', '3105', rect(218, -330, 92, 70)),
  numberedRoom('f3', '3109', rect(60, -220, 72, 52)),
  numberedRoom('f3', '3111', rect(140, -220, 44, 38), { kind: 'Support' }),
  numberedRoom('f3', '3113', rect(60, -150, 120, 76)),
  numberedRoom('f3', '3115', rect(60, -60, 120, 86)),
  numberedRoom('f3', '3117', rect(60, 44, 120, 86)),
  numberedRoom('f3', '3119', rect(60, 148, 120, 86)),
  numberedRoom('f3', '3121', rect(-205, 235, 100, 80)),
  numberedRoom('f3', '3123', rect(-415, 235, 100, 78)),
  numberedRoom('f3', '3125', rect(-415, 145, 100, 78)),
  numberedRoom('f3', '3127', rect(-415, 55, 100, 78)),
  numberedRoom('f3', '3129', rect(-415, -35, 100, 78)),
  numberedRoom('f3', '3131', rect(-305, -18, 116, 90)),
  numberedRoom('f3', '3133', rect(-305, -145, 116, 90)),
  numberedRoom('f3', '3135', rect(-415, -245, 116, 95)),
  numberedRoom('f3', '3137', rect(-415, -355, 92, 72)),
  numberedRoom('f3', '3139', rect(-415, -435, 92, 72)),
  numberedRoom('f3', '3141', rect(-415, -515, 92, 72)),
  numberedRoom('f3', '3143', rect(-315, -555, 100, 84)),
  numberedRoom('f3', '3145', rect(-92, -515, 92, 72)),
  numberedRoom('f3', '3147', rect(-92, -435, 92, 72)),
  numberedRoom('f3', '3149', rect(-92, -355, 92, 72)),
  numberedRoom('f3', '3151', rect(-92, -275, 92, 72)),
  numberedRoom('f3', '3153', rect(-92, -195, 92, 72)),
  numberedRoom('f3', '3155', rect(-92, -115, 92, 38), { kind: 'Support' }),
  numberedRoom('f3', '3157', rect(-92, -70, 92, 38), { kind: 'Support' }),
  numberedRoom('f3', '3134', rect(-245, -320, 86, 58), { kind: 'Support' })
];

const bRooms = [
  numberedRoom('b', '0101', rect(-60, -260, 80, 64)),
  numberedRoom('b', '0103', rect(-60, -185, 80, 48)),
  numberedRoom('b', '0105', rect(-60, -128, 80, 64)),
  numberedRoom('b', '0107', rect(-150, -70, 60, 42)),
  numberedRoom('b', '0109', rect(-230, -70, 100, 62)),
  numberedRoom('b', '0110', rect(-20, 15, 88, 64)),
  numberedRoom('b', '0111', [[-250, 2], [-128, 2], [-128, 80], [-205, 80], [-250, 55]]),
  numberedRoom('b', '0113', rect(-380, 5, 88, 64)),
  numberedRoom('b', '0115', rect(-480, 5, 88, 64)),
  numberedRoom('b', '0117', rect(-480, -80, 88, 64)),
  numberedRoom('b', '0119', rect(-480, -165, 88, 64)),
  numberedRoom('b', '0121', rect(-380, -165, 88, 80)),
  numberedRoom('b', '0123', rect(-270, -165, 52, 58), { kind: 'Support' }),
  numberedRoom('b', '0125', rect(-190, -165, 116, 76)),
  numberedRoom('b', '0127', rect(95, -155, 106, 78)),
  numberedRoom('b', '0129', rect(235, -150, 110, 82)),
  numberedRoom('b', '0131', rect(385, -155, 110, 84)),
  numberedRoom('b', '0133', rect(525, -155, 118, 90)),
  numberedRoom('b', '0135', rect(650, -125, 62, 44), { kind: 'Support' }),
  numberedRoom('b', '0137', rect(650, -68, 92, 78)),
  numberedRoom('b', '0138', rect(285, 20, 98, 56), { kind: 'Support' }),
  numberedRoom('b', '0139', rect(430, 28, 108, 74)),
  numberedRoom('b', '0141', rect(548, 28, 90, 74)),
  numberedRoom('b', '0143', rect(428, 128, 108, 74)),
  numberedRoom('b', '0145', rect(300, 122, 84, 54)),
  numberedRoom('b', '0147', rect(122, 128, 122, 74)),
  numberedRoom('b', '0149', rect(55, 128, 48, 42), { kind: 'Support' })
];

export const CAMPUS_MAP_FLOORS = [
  {
    id: 'basement',
    label: 'Basement',
    short: 'B',
    level: 0,
    description: '0-level academic and support rooms, kept separate from the first-floor main map.',
    bounds: { minX: -720, maxX: 760, minZ: -360, maxZ: 360 },
    initialCamera: { x: 55, z: 0, zoom: 0.72 },
    blueprint: {
      src: '/maps/floors/page-01-base-no-labels.svg',
      width: 2376,
      height: 1434
    },
    cleanGeometry: '/maps/clean/basement-clean.json',
    detailLines: [
      detailLayer('b-no-label-linework', '/maps/floors/page-01-base-no-labels.svg', { x: -690, z: -330, width: 1380, depth: 660 }, {
        cadGeometry: '/maps/geometry/basement-cad-detail.json',
        opacity: 0.22
      })
    ],
    floorShapes: [
      { id: 'b-main-plate', label: 'Basement floor plate', polygon: rect(-650, -280, 1320, 560) },
      { id: 'b-center-core', label: 'Basement center core', polygon: rect(-280, -190, 560, 380) }
    ],
    rooms: bRooms,
    roomNumberLabels: labelsFromRooms(bRooms),
    stairs: [
      stair('b-west-stairs', 'Basement west stairs', [-520, 0], [70, 108], { rotation: 0 }),
      stair('b-center-stairs', 'Basement center stairs', [8, -10], [88, 92], { rotation: Math.PI / 2 }),
      stair('b-east-stairs', 'Basement east stairs', [520, 0], [70, 108], { rotation: 0 })
    ],
    connectors: [
      { id: 'b-main-spine', label: 'Basement spine', points: [[-520, -10], [-160, -10], [130, -8], [520, 4]], width: 58 }
    ],
    pins: [
      pin('b-west', 'Basement west hall', 'Example area', [-445, -14]),
      pin('b-center', 'Lower central hall', 'Example area', [0, -8]),
      pin('b-east', 'Basement east hall', 'Example area', [445, 8])
    ]
  },
  {
    id: 'floor-1',
    label: 'Floor 1',
    short: '1',
    level: 1,
    description: 'Main first-floor map with the gym, cafeteria, auditorium, east wing, and front wing connected by the central hallway.',
    bounds: { minX: -780, maxX: 760, minZ: -610, maxZ: 1260 },
    initialCamera: { x: -10, z: 250, zoom: 0.48 },
    blueprint: {
      src: '/maps/floors/page-05-base-no-labels.svg',
      secondarySrc: '/maps/floors/page-04-base-no-labels.svg',
      width: 1836,
      height: 1854
    },
    cleanGeometry: '/maps/clean/floor-1-clean.json',
    detailLines: [
      detailLayer('f1-main-no-label-linework', '/maps/floors/page-05-base-no-labels.svg', { x: -720, z: -575, width: 1450, depth: 1050 }, {
        cadGeometry: '/maps/geometry/floor-1-main-cad-detail.json',
        opacity: 0.2
      }),
      detailLayer('f1-front-no-label-linework', '/maps/floors/page-04-base-no-labels.svg', { x: -495, z: 500, width: 980, depth: 740 }, {
        cadGeometry: '/maps/geometry/floor-1-front-wing-cad-detail.json',
        opacity: 0.18,
        elevation: 24
      })
    ],
    floorShapes: [
      { id: 'f1-athletics-plate', label: 'Athletics wing', polygon: rect(-715, -470, 390, 540) },
      { id: 'f1-main-plate', label: 'Main first-floor plate', polygon: rect(-300, -565, 845, 615) },
      { id: 'f1-east-plate', label: 'East classroom wing', polygon: rect(425, -415, 300, 660) },
      { id: 'f1-auditorium-plate', label: 'Auditorium wing', polygon: rect(205, 95, 535, 550) },
      { id: 'f1-front-wing-plate', label: 'Front wing', polygon: rect(-485, 525, 980, 725) },
      { id: 'f1-connector-plate', label: 'First-floor connector hallway', polygon: [[-105, 40], [105, 40], [145, 535], [-145, 535]] }
    ],
    rooms: f1Rooms,
    roomNumberLabels: labelsFromRooms(f1Rooms, {
      '1601': { minZoom: 0.28 },
      '1642': { minZoom: 0.28 },
      '1501': { minZoom: 0.28 },
      '1209': { minZoom: 0.28 },
      '1220': { minZoom: 0.34 }
    }),
    stairs: [
      stair('f1-west-stairs', 'Athletics stairs', [-525, -325], [62, 120], { rotation: 0 }),
      stair('f1-cafeteria-stairs', 'Cafeteria stairs', [-55, 404], [118, 62], { rotation: Math.PI / 2 }),
      stair('f1-auditorium-stairs', 'Auditorium stairs', [492, 584], [112, 58], { rotation: Math.PI / 2 }),
      stair('f1-front-west-stairs', 'Front west stairs', [-318, 680], [88, 54], { rotation: Math.PI / 2 }),
      stair('f1-front-east-stairs', 'Front east stairs', [230, 680], [88, 54], { rotation: Math.PI / 2 })
    ],
    connectors: [
      { id: 'f1-main-spine', label: 'First-floor main spine', points: [[-520, 10], [-70, 10], [440, 10], [560, 180]], width: 72 },
      { id: 'f1-front-link', label: 'First-floor connector hallway', points: [[0, 50], [0, 260], [0, 535]], width: 72 },
      { id: 'f1-front-spine', label: 'Front wing spine', points: [[-360, 725], [-90, 725], [120, 725], [340, 725]], width: 56 }
    ],
    pins: [
      pin('f1-gym', '1601 Gym', 'Major space', [-20, -250]),
      pin('f1-cafeteria', '1501 Cafeteria', 'Major space', [-120, 230]),
      pin('f1-auditorium', '1209 Auditorium', 'Major space', [375, 345]),
      pin('f1-front-wing', 'Front wing connector', 'Hallway link', [0, 560], 'connector')
    ]
  },
  {
    id: 'floor-2',
    label: 'Floor 2',
    short: '2',
    level: 2,
    description: 'Second-floor academic wing with media center, east-west classroom clusters, stairs, and support rooms.',
    bounds: { minX: -780, maxX: 780, minZ: -470, maxZ: 620 },
    initialCamera: { x: 0, z: 60, zoom: 0.62 },
    blueprint: {
      src: '/maps/floors/page-03-base-no-labels.svg',
      width: 1884,
      height: 1836
    },
    cleanGeometry: '/maps/clean/floor-2-clean.json',
    detailLines: [
      detailLayer('f2-no-label-linework', '/maps/floors/page-03-base-no-labels.svg', { x: -760, z: -440, width: 1520, depth: 1010 }, {
        cadGeometry: '/maps/geometry/floor-2-cad-detail.json',
        opacity: 0.2
      })
    ],
    floorShapes: [
      { id: 'f2-west-plate', label: 'Second-floor west wing', polygon: rect(-745, -420, 520, 870) },
      { id: 'f2-center-plate', label: 'Second-floor center spine', polygon: rect(-250, -260, 520, 540) },
      { id: 'f2-east-plate', label: 'Second-floor east wing', polygon: rect(260, -250, 520, 845) }
    ],
    rooms: f2Rooms,
    roomNumberLabels: labelsFromRooms(f2Rooms),
    stairs: [
      stair('f2-media-stairs', 'Media center stairs', [-410, -160], [72, 118], { rotation: 0 }),
      stair('f2-north-stairs', 'Second-floor north stairs', [-185, -35], [88, 54], { rotation: Math.PI / 2 }),
      stair('f2-east-stairs', 'Second-floor east stairs', [548, 372], [92, 54], { rotation: Math.PI / 2 }),
      stair('f2-west-stairs', 'Second-floor west stairs', [-326, 385], [92, 54], { rotation: Math.PI / 2 })
    ],
    connectors: [
      { id: 'f2-spine', label: 'Second-floor spine', points: [[-600, 20], [-130, 20], [170, 10], [610, 18]], width: 66 }
    ],
    pins: [
      pin('f2-media', '2201 Media Center', 'Major space', [-545, -245]),
      pin('f2-center', 'Second-floor center hall', 'Example area', [0, 18]),
      pin('f2-east', 'Second-floor east hall', 'Example area', [548, 24])
    ]
  },
  {
    id: 'floor-3',
    label: 'Floor 3',
    short: '3',
    level: 3,
    description: 'Third-floor classroom level with north/south room rows, stair banks, and central support rooms.',
    bounds: { minX: -560, maxX: 560, minZ: -620, maxZ: 380 },
    initialCamera: { x: -95, z: -95, zoom: 0.68 },
    blueprint: {
      src: '/maps/floors/page-02-base-no-labels.svg',
      width: 2376,
      height: 1482
    },
    cleanGeometry: '/maps/clean/floor-3-clean.json',
    detailLines: [
      detailLayer('f3-no-label-linework', '/maps/floors/page-02-base-no-labels.svg', { x: -535, z: -600, width: 1050, depth: 945 }, {
        cadGeometry: '/maps/geometry/floor-3-cad-detail.json',
        opacity: 0.2
      })
    ],
    floorShapes: [
      { id: 'f3-north-plate', label: 'Third-floor north wing', polygon: rect(-455, -585, 540, 510) },
      { id: 'f3-center-plate', label: 'Third-floor center hall', polygon: rect(-330, -110, 560, 265) },
      { id: 'f3-south-plate', label: 'Third-floor south wing', polygon: rect(-455, 105, 660, 245) },
      { id: 'f3-east-plate', label: 'Third-floor east wing', polygon: rect(190, -350, 360, 260) }
    ],
    rooms: f3Rooms,
    roomNumberLabels: labelsFromRooms(f3Rooms),
    stairs: [
      stair('f3-north-stairs', 'Third-floor north stairs', [-235, -510], [72, 100], { rotation: 0 }),
      stair('f3-west-stairs', 'Third-floor west stairs', [-380, -78], [72, 100], { rotation: 0 }),
      stair('f3-south-stairs', 'Third-floor south stairs', [-108, 240], [88, 54], { rotation: Math.PI / 2 }),
      stair('f3-east-stairs', 'Third-floor east stairs', [420, -272], [72, 100], { rotation: 0 })
    ],
    connectors: [
      { id: 'f3-spine', label: 'Third-floor spine', points: [[-370, -95], [-115, -95], [90, -95], [398, -100]], width: 64 },
      { id: 'f3-south-link', label: 'Third-floor south hall', points: [[-330, 130], [-130, 130], [130, 115]], width: 58 }
    ],
    pins: [
      pin('f3-center', 'Third-floor center hall', 'Example area', [-70, -95]),
      pin('f3-north', 'Third-floor north rooms', 'Example area', [-260, -445]),
      pin('f3-south', 'Third-floor south rooms', 'Example area', [-250, 205])
    ]
  }
];

export function getCampusFloor(id) {
  return CAMPUS_MAP_FLOORS.find((floor) => floor.id === id) || CAMPUS_MAP_FLOORS[0];
}

export function getAllCampusPins() {
  return CAMPUS_MAP_FLOORS.flatMap((floor) => (
    floor.pins.map((entry) => ({ ...entry, floorId: floor.id, floorLabel: floor.label }))
  ));
}

// tests/run.js — Full test suite for School Lost & Found
// Run with:  node tests/run.js
//
// The server must NOT already be running — this script starts its own instance.

const http    = require('http');
const { exec } = require('child_process');
const path    = require('path');
const fs      = require('fs');
const bcrypt  = require('bcryptjs');
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

// ── Isolated test database ────────────────────────────────────
const ROOT      = path.join(__dirname, '..');
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL is required for npm test.');
}

const testPrisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: TEST_DATABASE_URL })
});

function runCommand(command, env = {}) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd: ROOT, env: { ...process.env, ...env } }, (error, stdout, stderr) => {
      if (error) {
        error.message += `\n${stdout}\n${stderr}`;
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

function date(value) {
  return new Date(value);
}

async function resetTestDatabase() {
  await runCommand('npx prisma migrate deploy', { DATABASE_URL: TEST_DATABASE_URL });

  await testPrisma.message.deleteMany();
  await testPrisma.claim.deleteMany();
  await testPrisma.foundItem.deleteMany();
  await testPrisma.missingItem.deleteMany();
  await testPrisma.uploadedAsset.deleteMany();
  await testPrisma.auditLog.deleteMany();
  await testPrisma.notificationLog.deleteMany();
  await testPrisma.notificationPreference.deleteMany();
  await testPrisma.userSettings.deleteMany();
  await testPrisma.user.deleteMany();

  await testPrisma.user.createMany({
    data: [
      {
        id: 'admin-001',
        name: 'Administrator',
        email: 'admin@school.edu',
        passwordHash: bcrypt.hashSync('admin123', 10),
        role: 'ADMIN',
        createdAt: date('2026-02-01T00:00:00.000Z')
      },
      {
        id: 'user-001',
        name: 'Alex Chen',
        email: 'student@school.edu',
        passwordHash: bcrypt.hashSync('student123', 10),
        role: 'USER',
        createdAt: date('2026-02-01T00:00:00.000Z')
      },
      {
        id: 'user-002',
        name: 'Jordan Lee',
        email: 'student2@school.edu',
        passwordHash: bcrypt.hashSync('student123', 10),
        role: 'USER',
        createdAt: date('2026-02-01T00:00:00.000Z')
      }
    ]
  });

  await testPrisma.foundItem.createMany({
    data: [
      { id: 'item-001', itemName: 'Blue North Face Backpack', category: 'Bags & Backpacks',
        description: 'Large blue backpack found near the library.', locationFound: 'Library Entrance',
        dateFound: date('2026-02-15T00:00:00.000Z'), contactEmailPrivate: 'admin@school.edu',
        status: 'APPROVED', submittedById: 'admin-001', submitterName: 'Staff Member',
        createdAt: date('2026-02-15T10:30:00.000Z') },
      { id: 'item-002', itemName: 'iPhone 14 (Space Gray)', category: 'Electronics',
        description: 'Space gray iPhone 14 with clear case, found in cafeteria.', locationFound: 'Cafeteria',
        dateFound: date('2026-02-18T00:00:00.000Z'), contactEmailPrivate: 'admin@school.edu',
        status: 'APPROVED', submittedById: 'admin-001', submitterName: 'Staff Member',
        createdAt: date('2026-02-18T12:15:00.000Z') },
      { id: 'item-003', itemName: 'White Wireless Earbuds', category: 'Electronics',
        description: 'White AirPods in charging case, found on gym bleachers.', locationFound: 'Gymnasium',
        dateFound: date('2026-02-20T00:00:00.000Z'), contactEmailPrivate: 'admin@school.edu',
        status: 'APPROVED', submittedById: 'admin-001', submitterName: 'Coach Williams',
        createdAt: date('2026-02-20T14:00:00.000Z') },
      { id: 'item-005', itemName: 'AP Calculus Textbook', category: 'Books & Supplies',
        description: 'AP Calculus AB textbook, Larson 10th edition. Found in classroom 204.', locationFound: 'Room 204',
        dateFound: date('2026-02-28T00:00:00.000Z'), contactEmailPrivate: 'admin@school.edu',
        status: 'APPROVED', submittedById: 'admin-001', submitterName: 'Mr. Johnson',
        createdAt: date('2026-02-28T15:30:00.000Z') },
      { id: 'item-006', itemName: 'Black Compact Umbrella', category: 'Other',
        description: 'Standard black folding umbrella found near the main entrance.', locationFound: 'Main Entrance',
        dateFound: date('2026-02-26T00:00:00.000Z'), contactEmailPrivate: 'admin@school.edu',
        status: 'APPROVED', submittedById: 'admin-001', submitterName: 'Front Office',
        createdAt: date('2026-02-26T08:00:00.000Z') },
      { id: 'item-007', itemName: 'Red Hydro Flask Water Bottle', category: 'Other',
        description: 'Red 32oz Hydro Flask with stickers, found at the track.', locationFound: 'Track & Field',
        dateFound: date('2026-03-01T00:00:00.000Z'), contactEmailPrivate: 'admin@school.edu',
        status: 'PENDING', submittedById: 'user-001', submitterName: 'Alex Chen',
        createdAt: date('2026-03-01T16:00:00.000Z') }
    ]
  });

  await testPrisma.missingItem.createMany({
    data: [
      { id: 'missing-001', itemName: 'Blue Hydro Flask', category: 'Other',
        description: 'Blue 24oz Hydro Flask with ocean sticker. Name on bottom.', lastSeenLocation: 'Cafeteria',
        lastSeenDate: date('2026-02-10T00:00:00.000Z'), contactEmailPrivate: 'student@school.edu',
        status: 'APPROVED', submittedById: 'user-001', submitterName: 'Alex Chen',
        createdAt: date('2026-02-10T13:00:00.000Z') },
      { id: 'missing-002', itemName: 'HP Laptop Charger', category: 'Electronics',
        description: 'HP 45W charger with blue tape near connector, left in library.', lastSeenLocation: 'Library',
        lastSeenDate: date('2026-02-14T00:00:00.000Z'), contactEmailPrivate: 'student@school.edu',
        status: 'APPROVED', submittedById: 'user-001', submitterName: 'Alex Chen',
        createdAt: date('2026-02-14T11:30:00.000Z') },
      { id: 'missing-003', itemName: 'Gray Champion Hoodie', category: 'Clothing',
        description: 'Gray Champion hoodie size L with ink stain near pocket.', lastSeenLocation: 'Girls Locker Room',
        lastSeenDate: date('2026-02-28T00:00:00.000Z'), contactEmailPrivate: 'student@school.edu',
        status: 'PENDING', submittedById: 'user-001', submitterName: 'Alex Chen',
        createdAt: date('2026-02-28T10:00:00.000Z') }
    ]
  });
}

// ── Start the server ──────────────────────────────────────────
let serverProcess;

function startServer() {
  return new Promise((resolve, reject) => {
    serverProcess = exec(
      'node server/index.js',
      {
        cwd: ROOT,
        env: {
          ...process.env,
          PORT: '3001',
          NODE_ENV: 'test',
          DATABASE_URL: TEST_DATABASE_URL,
          SESSION_STORE: 'postgres',
          SESSION_SECRET: 'test-session-secret-change-me'
        }
      }
    );
    serverProcess.stderr.on('data', d => { if (d.includes('Error')) console.error(d); });
    // Give the server 1.5 seconds to boot, then resolve
    setTimeout(resolve, 1500);
    serverProcess.on('error', reject);
  });
}

function stopServer() {
  if (serverProcess) serverProcess.kill();
}

// ── HTTP helpers ──────────────────────────────────────────────
const BASE = 'http://localhost:3001';

// Generic JSON request
function req(method, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : '';
    const options = {
      hostname: 'localhost',
      port: 3001,
      path,
      method,
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...(cookie ? { Cookie: cookie } : {})
      }
    };
    const r = http.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        const setCookie = res.headers['set-cookie'];
        const sessionCookie = setCookie ? setCookie[0].split(';')[0] : null;
        resolve({ status: res.statusCode, body: parsed, cookie: sessionCookie });
      });
    });
    r.on('error', reject);
    if (bodyStr) r.write(bodyStr);
    r.end();
  });
}

// URL-encoded form request (needed for routes that use multer, without a file)
function formReq(method, path, fields, cookie) {
  return new Promise((resolve, reject) => {
    const bodyStr = new URLSearchParams(fields).toString();
    const options = {
      hostname: 'localhost',
      port: 3001,
      path,
      method,
      headers: {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...(cookie ? { Cookie: cookie } : {})
      }
    };
    const r = http.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    r.on('error', reject);
    r.write(bodyStr);
    r.end();
  });
}

// Simple GET for HTML page checks
function getPage(path) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE}${path}`, res => {
      resolve({ status: res.statusCode, type: res.headers['content-type'] || '' });
      res.resume();
    }).on('error', reject);
  });
}

// ── Test runner ───────────────────────────────────────────────
const results = { passed: 0, failed: 0, errors: [] };

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅  ${name}`);
    results.passed++;
  } catch (err) {
    console.log(`  ❌  ${name}`);
    console.log(`       → ${err.message}`);
    results.failed++;
    results.errors.push({ name, error: err.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function loadCampusMapDataForTests() {
  const vm = require('vm');
  const file = path.join(ROOT, 'public/js/campus-map-data.js');
  const source = fs.readFileSync(file, 'utf8')
    .replace('export const CAMPUS_MAP_FLOORS =', 'const CAMPUS_MAP_FLOORS =')
    .replace(/export function /g, 'function ');
  const sandbox = {};
  vm.runInNewContext(`${source}\nglobalThis.__floors = CAMPUS_MAP_FLOORS;`, sandbox, { filename: file });
  return sandbox.__floors;
}

function polygonArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum / 2);
}

// ── Matching unit tests (pure, no server needed) ──────────────
function runMatcherTests() {
  const { scoreMatch, findMatchesForMissingItems, getObjectFamily } = require('../server/lib/matcher');

  console.log('\n🔗  Matching Logic (unit tests)');
  console.log('────────────────────────────────────────────────');

  function matcherTest(name, fn) {
    try {
      fn();
      console.log(`  ✅  ${name}`);
      results.passed++;
    } catch (err) {
      console.log(`  ❌  ${name}`);
      console.log(`       → ${err.message}`);
      results.failed++;
      results.errors.push({ name, error: err.message });
    }
  }

  const airpods  = { itemName: 'AirPods', category: 'Electronics', description: 'Lost my AirPods', lastSeenLocation: 'Cafeteria' };
  const earbuds  = { itemName: 'White Wireless Earbuds', category: 'Electronics', description: 'White AirPods in charging case', locationFound: 'Gym' };
  const macbook  = { itemName: 'MacBook Pro', category: 'Electronics', description: '14-inch MacBook Pro', locationFound: 'Library' };
  const charger  = { itemName: 'MacBook Charger', category: 'Electronics', description: 'USB-C charger', locationFound: 'Cafeteria' };
  const backpack = { itemName: 'Blue Backpack', category: 'Bags & Backpacks', description: 'Blue Nike backpack', locationFound: 'Cafeteria' };
  const hydroFlaskMissing = { itemName: 'Blue Hydro Flask', category: 'Other', description: 'Blue 24oz water bottle', lastSeenLocation: 'Cafeteria' };
  const hydroFlaskFound   = { itemName: 'Red Hydro Flask Water Bottle', category: 'Other', description: '32oz hydro flask', locationFound: 'Track' };

  matcherTest('AirPods matches white wireless earbuds (same family)', () => {
    const { score, strongSignal, reasons } = scoreMatch(airpods, earbuds);
    assert(strongSignal, 'Expected strongSignal=true. Reasons: ' + JSON.stringify(reasons));
    assert(score >= 20, `Expected score >= 20, got ${score}`);
  });

  matcherTest('AirPods does NOT match MacBook charger', () => {
    const { score, strongSignal } = scoreMatch(airpods, charger);
    assert(!strongSignal || score < 20, `Expected no match (score=${score}, strongSignal=${strongSignal})`);
  });

  matcherTest('Category-only Electronics match is rejected', () => {
    const { score, strongSignal } = scoreMatch(airpods, macbook);
    assert(!strongSignal || score < 20, `Expected no match (score=${score}, strongSignal=${strongSignal})`);
  });

  matcherTest('Same location alone is rejected', () => {
    const missingAirpods = { ...airpods, lastSeenLocation: 'Cafeteria' };
    const foundBackpack  = { ...backpack, locationFound: 'Cafeteria' };
    const { score, strongSignal } = scoreMatch(missingAirpods, foundBackpack);
    assert(!strongSignal || score < 20, `Expected no match (score=${score}, strongSignal=${strongSignal})`);
  });

  matcherTest('Hydro Flask matches water bottle (same family)', () => {
    const { score, strongSignal, reasons } = scoreMatch(hydroFlaskMissing, hydroFlaskFound);
    assert(strongSignal, 'Expected strongSignal=true. Reasons: ' + JSON.stringify(reasons));
    assert(score >= 20, `Expected score >= 20, got ${score}`);
  });

  matcherTest('AI profile keyword overlap (>=2) produces a strong signal', () => {
    const withAI = {
      ...airpods,
      aiProfile: { keywords: ['white', 'earbuds', 'wireless', 'case'], color: 'white', brand: 'apple', material: 'plastic', distinguishingFeatures: [] }
    };
    const foundWithAI = {
      ...earbuds,
      aiProfile: { keywords: ['white', 'earbuds', 'airpods', 'charging'], color: 'white', brand: 'apple', material: 'plastic', distinguishingFeatures: [] }
    };
    const { score, strongSignal, reasons } = scoreMatch(withAI, foundWithAI);
    assert(strongSignal, 'Expected strongSignal=true from AI overlap. Reasons: ' + JSON.stringify(reasons));
    assert(score >= 20, `Expected score >= 20, got ${score}`);
  });

  matcherTest('AI Apple keyword overlap does NOT match different object families', () => {
    const macbookWithAI = {
      ...macbook,
      aiProfile: {
        keywords: ['laptop', 'computer', 'electronics', 'apple', 'portable'],
        color: 'space gray',
        brand: 'apple',
        material: 'aluminum',
        distinguishingFeatures: []
      }
    };
    const airpodsWithAI = {
      ...earbuds,
      aiProfile: {
        keywords: ['wireless earbuds', 'electronics', 'apple', 'portable', 'charging case'],
        color: 'white',
        brand: 'apple',
        material: 'plastic',
        distinguishingFeatures: []
      }
    };
    const { score, strongSignal, reasons } = scoreMatch(macbookWithAI, airpodsWithAI);
    assert(!strongSignal && score < 20, `Expected no match (score=${score}, strongSignal=${strongSignal}, reasons=${JSON.stringify(reasons)})`);
  });

  matcherTest('findMatchesForMissingItems returns only earbuds match for AirPods', () => {
    const missingList = [{ ...airpods, id: 'm1', status: 'approved', submittedBy: 'u1' }];
    const foundPool   = [
      { ...charger,  id: 'f1', status: 'approved' },
      { ...macbook,  id: 'f2', status: 'approved' },
      { ...earbuds,  id: 'f3', status: 'approved' },
    ];
    const groups = findMatchesForMissingItems(missingList, foundPool);
    const matches = groups[0].foundMatches;
    assert(matches.length === 1, `Expected 1 match, got ${matches.length}: ${matches.map(m => m.item.itemName)}`);
    assert(matches[0].item.id === 'f3', 'Expected only earbuds (f3) to match');
  });

  matcherTest('getObjectFamily identifies AirPods as earbuds family', () => {
    assert(getObjectFamily('AirPods Pro') === 'earbuds', 'AirPods should be earbuds family');
    assert(getObjectFamily('Hydro Flask') === 'bottle',  'Hydro Flask should be bottle family');
    assert(getObjectFamily('MacBook charger') === 'charger', 'MacBook charger should be charger family');
    assert(getObjectFamily('random item xyz') === null,  'Unknown item should return null');
  });
}

// ── Main test suite ───────────────────────────────────────────
async function runTests() {
  console.log('\n🔍  School Lost & Found — Test Suite');
  console.log('════════════════════════════════════════════════\n');

  let userCookie   = '';
  let user001Cookie = ''; // cookie for the seeded user-001 (submitter of fixture missing items)
  let adminCookie  = '';
  let newItemId    = '';
  let newMissingId = '';

  // ══════════════════════════════════════════════════
  //  AUTH
  // ══════════════════════════════════════════════════
  console.log('🔐  Auth');
  console.log('────────────────────────────────────────────────');

  await test('/auth/me — unauthenticated → 401', async () => {
    const r = await req('GET', '/api/auth/me');
    assert(r.status === 401, `Expected 401, got ${r.status}`);
    assert(r.body.error, 'Expected error message in body');
  });

  await test('/auth/signup — missing fields → 400', async () => {
    const r = await req('POST', '/api/auth/signup', { email: 'x@x.com' });
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test('/auth/signup — password too short → 400', async () => {
    const r = await req('POST', '/api/auth/signup', { name: 'T', email: 'x@x.com', password: '123' });
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test('/auth/signup — valid new user → 200 + session cookie', async () => {
    const r = await req('POST', '/api/auth/signup', {
      name: 'Test User', email: `tester_${Date.now()}@test.com`, password: 'testpass1'
    });
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.id,            'Expected id in response');
    assert(r.body.role === 'user', 'Expected role=user');
    assert(r.cookie,             'Expected Set-Cookie header');
    userCookie = r.cookie;
  });

  await test('/auth/signup — duplicate email → 400', async () => {
    const r = await req('POST', '/api/auth/signup', {
      name: 'Dup', email: 'admin@school.edu', password: 'password123'
    });
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test('/auth/login — wrong password → 401', async () => {
    const r = await req('POST', '/api/auth/login', { email: 'admin@school.edu', password: 'wrongpass' });
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  await test('/auth/login — unknown email → 401', async () => {
    const r = await req('POST', '/api/auth/login', { email: 'ghost@ghost.com', password: 'password123' });
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  await test('/auth/login — missing fields → 400', async () => {
    const r = await req('POST', '/api/auth/login', { email: 'admin@school.edu' });
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test('/auth/login — valid admin → 200 + sets session', async () => {
    const r = await req('POST', '/api/auth/login', { email: 'admin@school.edu', password: 'admin123' });
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.role === 'admin', `Expected role=admin, got ${r.body.role}`);
    assert(r.cookie, 'Expected Set-Cookie header');
    adminCookie = r.cookie;
  });

  await test('/auth/login — valid student → 200', async () => {
    const r = await req('POST', '/api/auth/login', { email: 'student@school.edu', password: 'student123' });
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.role === 'user', `Expected role=user, got ${r.body.role}`);
    user001Cookie = r.cookie;
  });

  await test('/auth/settings — account appearance settings persist by user', async () => {
    const anonymous = await req('GET', '/api/auth/settings');
    assert(anonymous.status === 401, `Expected unauthenticated settings request to return 401, got ${anonymous.status}`);

    const initial = await req('GET', '/api/auth/settings', null, user001Cookie);
    assert(initial.status === 200, `Expected 200, got ${initial.status}: ${JSON.stringify(initial.body)}`);
    assert(initial.body.preferredLanguage === 'en', `Expected default preferredLanguage=en, got ${initial.body.preferredLanguage}`);
    assert(initial.body.dyslexicFontEnabled === false, 'Expected dyslexic font to default to false');

    const saved = await req('POST', '/api/auth/settings', {
      preferredLanguage: 'es',
      dyslexicFontEnabled: true
    }, user001Cookie);
    assert(saved.status === 200, `Expected 200 from settings save, got ${saved.status}: ${JSON.stringify(saved.body)}`);
    assert(saved.body.preferredLanguage === 'es', `Expected saved language es, got ${saved.body.preferredLanguage}`);
    assert(saved.body.dyslexicFontEnabled === true, 'Expected saved dyslexic font preference true');

    const persisted = await req('GET', '/api/auth/settings', null, user001Cookie);
    assert(persisted.body.preferredLanguage === 'es', 'Expected preferred language to persist');
    assert(persisted.body.dyslexicFontEnabled === true, 'Expected dyslexic font preference to persist');
  });

  await test('/auth/me — authenticated as admin → 200, correct data', async () => {
    const r = await req('GET', '/api/auth/me', null, adminCookie);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.email === 'admin@school.edu', `Expected admin email`);
    assert(r.body.role  === 'admin',            `Expected role=admin`);
    assert(!r.body.passwordHash,                'passwordHash must NOT be in response');
  });

  await test('/gatorbot/chat — unrelated questions stay website-scoped', async () => {
    const r = await req('POST', '/api/gatorbot/chat', {
      message: 'Who won the Super Bowl?',
      pagePath: '/index.html',
      pageTitle: 'Home'
    });
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.usedFallback === true, 'Test mode should use deterministic fallback');
    assert(/only help with Green Level Lost & Found/i.test(r.body.reply), `Unexpected reply: ${r.body.reply}`);
    assert(!JSON.stringify(r.body).includes('admin@school.edu'), 'GatorBot must not leak emails');
  });

  await test('/gatorbot/chat — supported languages are website knowledge, not refused', async () => {
    const r = await req('POST', '/api/gatorbot/chat', {
      message: 'What languages are included in this website?',
      pagePath: '/index.html',
      pageTitle: 'Home'
    });
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.usedFallback === true, 'Test mode should use deterministic fallback');
    assert(!/only help with Green Level Lost & Found/i.test(r.body.reply), `Language question should not be refused: ${r.body.reply}`);
    assert(/English/i.test(r.body.reply), `Expected English in supported language reply: ${r.body.reply}`);
    assert(/Spanish/i.test(r.body.reply), `Expected Spanish in supported language reply: ${r.body.reply}`);
    assert(/Gujarati/i.test(r.body.reply), `Expected Gujarati in supported language reply: ${r.body.reply}`);
    assert(/Greek/i.test(r.body.reply), `Expected Greek in supported language reply: ${r.body.reply}`);
    assert(!JSON.stringify(r.body).includes('@school.edu'), 'Language answer must not expose private emails');
  });

  await test('/gatorbot/chat — dyslexia font toggle is website knowledge, not refused', async () => {
    const r = await req('POST', '/api/gatorbot/chat', {
      message: 'Where is the dyslexic toggle for this website?',
      pagePath: '/index.html',
      pageTitle: 'Home'
    });
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.usedFallback === true, 'Test mode should use deterministic fallback');
    assert(!/only help with Green Level Lost & Found/i.test(r.body.reply), `Dyslexia toggle question should not be refused: ${r.body.reply}`);
    assert(/dyslexia-friendly font|Dyslexia Font/i.test(r.body.reply), `Expected dyslexia font in reply: ${r.body.reply}`);
    assert(/OpenDyslexic/i.test(r.body.reply), `Expected OpenDyslexic in reply: ${r.body.reply}`);
    assert(/Settings/i.test(r.body.reply), `Expected Settings location in reply: ${r.body.reply}`);
    assert(/Student Portal|sign in/i.test(r.body.reply), `Expected Student Portal or sign-in guidance in reply: ${r.body.reply}`);
    assert(!JSON.stringify(r.body).includes('@school.edu'), 'Dyslexia answer must not expose private emails');
  });

  await test('/gatorbot/chat — anonymous report question points to auth actions', async () => {
    const r = await req('POST', '/api/gatorbot/chat', {
      message: 'How do I report a found item?',
      pagePath: '/index.html',
      pageTitle: 'Home'
    });
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(/sign in/i.test(r.body.reply), `Anonymous report flow should explain sign-in: ${r.body.reply}`);
    const hrefs = (r.body.actions || []).map(action => action.href);
    assert(hrefs.includes('/login.html'), 'Expected Sign In action');
    assert(hrefs.includes('/signup.html'), 'Expected Create Account action');
    assert(!hrefs.includes('/admin.html'), 'Anonymous users must not get admin actions');
  });

  await test('/gatorbot/chat — student dashboard summary is own-data only', async () => {
    const r = await req('POST', '/api/gatorbot/chat', {
      message: 'Can you summarize my submissions?',
      pagePath: '/my-submissions.html',
      pageTitle: 'My Submissions'
    }, user001Cookie);
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(/your/i.test(r.body.reply), `Expected own dashboard language: ${r.body.reply}`);
    assert(/found|missing|claim|message/i.test(r.body.reply), `Expected dashboard counts in reply: ${r.body.reply}`);
    assert(!JSON.stringify(r.body).includes('@school.edu'), 'Student summary must not expose private emails');
    assert(!(r.body.actions || []).some(action => action.href === '/admin.html'), 'Student must not receive admin action');
  });

  await test('/gatorbot/chat — admin guidance requires admin session', async () => {
    const student = await req('POST', '/api/gatorbot/chat', {
      message: 'How do I approve items as an admin?',
      pagePath: '/index.html',
      pageTitle: 'Home'
    }, user001Cookie);
    assert(student.status === 200, `Expected 200, got ${student.status}`);
    assert(!(student.body.actions || []).some(action => action.href === '/admin.html'), 'Student must not receive admin dashboard link');

    const admin = await req('POST', '/api/gatorbot/chat', {
      message: 'How do I approve items as an admin?',
      pagePath: '/admin.html',
      pageTitle: 'Admin'
    }, adminCookie);
    assert(admin.status === 200, `Expected 200, got ${admin.status}: ${JSON.stringify(admin.body)}`);
    assert((admin.body.actions || []).some(action => action.href === '/admin.html'), 'Admin should receive admin dashboard action');
  });

  await test('/auth/logout — valid session → 200, session destroyed', async () => {
    const login = await req('POST', '/api/auth/login', { email: 'student@school.edu', password: 'student123' });
    const c = login.cookie;
    const logout = await req('POST', '/api/auth/logout', null, c);
    assert(logout.status === 200, `Expected 200, got ${logout.status}`);
    // Cookie should no longer work
    const me = await req('GET', '/api/auth/me', null, c);
    assert(me.status === 401, 'After logout, /auth/me should return 401');
  });

  await test('/auth/forgot-password — missing email → 400', async () => {
    const r = await req('POST', '/api/auth/forgot-password', {});
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test('/auth/forgot-password — unknown email does not reveal account status', async () => {
    const r = await req('POST', '/api/auth/forgot-password', { email: 'ghost@school.edu' });
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.message.includes('If this email is registered'), 'Expected account-safe reset message');
  });

  await test('/auth/forgot-password — valid email → reset link works once', async () => {
    const latestResetToken = async () => {
      const resetLog = await testPrisma.notificationLog.findFirst({
        where: {
          subject: { contains: 'Password Reset Request' },
          email: 'student@school.edu'
        },
        orderBy: { createdAt: 'desc' }
      });
      assert(resetLog, 'Expected password reset email in notification logs');
      const body = resetLog.metadata?.body || '';
      const tokenMatch = body.match(/token=([a-f0-9]+)/);
      assert(tokenMatch, 'Expected token in reset password email body');
      return tokenMatch[1];
    };

    const r = await req('POST', '/api/auth/forgot-password', { email: 'student@school.edu' });
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.message.includes('password reset link shortly'), 'Expected reset message');

    const token = await latestResetToken();

    const shortPassword = await req('POST', '/api/auth/reset-password', { token, password: '123' });
    assert(shortPassword.status === 400, `Expected 400 for short password, got ${shortPassword.status}`);

    const invalidToken = await req('POST', '/api/auth/reset-password', { token: 'invalidtoken', password: 'newstudentpass123' });
    assert(invalidToken.status === 400, `Expected 400 for invalid token, got ${invalidToken.status}`);

    const reset = await req('POST', '/api/auth/reset-password', { token, password: 'newstudentpass123' });
    assert(reset.status === 200, `Expected 200, got ${reset.status}`);

    const reused = await req('POST', '/api/auth/reset-password', { token, password: 'anotherpass123' });
    assert(reused.status === 400, `Expected 400 for reused token, got ${reused.status}`);

    const loginNew = await req('POST', '/api/auth/login', { email: 'student@school.edu', password: 'newstudentpass123' });
    assert(loginNew.status === 200, `Expected 200 with new password, got ${loginNew.status}`);

    await req('POST', '/api/auth/forgot-password', { email: 'student@school.edu' });
    const restoreToken = await latestResetToken();
    const restore = await req('POST', '/api/auth/reset-password', { token: restoreToken, password: 'student123' });
    assert(restore.status === 200, `Expected restore reset to pass, got ${restore.status}`);
  });

  // ══════════════════════════════════════════════════
  //  FOUND ITEMS
  // ══════════════════════════════════════════════════
  console.log('\n📦  Found Items');
  console.log('────────────────────────────────────────────────');

  await test('GET /items — public, returns only approved items', async () => {
    const r = await req('GET', '/api/items');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(Array.isArray(r.body), 'Expected array');
    assert(r.body.length > 0, 'Expected at least one item (from seed data)');
    assert(r.body.every(i => i.status === 'approved'), 'All returned items must be approved');
  });

  await test('GET /items — public response does not leak private contact fields', async () => {
    const r = await req('GET', '/api/items');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.length > 0, 'Expected at least one item');
    for (const item of r.body) {
      assert(!('contactEmail' in item), 'Public found item list must not include contactEmail');
      assert(!('submittedBy' in item), 'Public found item list must not include submittedBy');
      assert(!('aiProfile' in item), 'Public found item list must not include private aiProfile data');
    }
  });

  await test('GET /items?keyword=backpack — filters by keyword', async () => {
    const r = await req('GET', '/api/items?keyword=backpack');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.length > 0, 'Expected at least one result');
    const match = r.body.some(i =>
      i.itemName.toLowerCase().includes('backpack') ||
      i.description.toLowerCase().includes('backpack') ||
      i.locationFound.toLowerCase().includes('backpack')
    );
    assert(match, 'Results should contain "backpack"');
  });

  await test('GET /items?category=Electronics — filters by category', async () => {
    const r = await req('GET', '/api/items?category=Electronics');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.every(i => i.category === 'Electronics'), 'All results must be Electronics');
  });

  await test('GET /items?keyword=zzznoresult — returns empty array', async () => {
    const r = await req('GET', '/api/items?keyword=zzznoresult999');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.length === 0, 'Expected empty array for non-matching keyword');
  });

  await test('GET /items/:id — valid approved item → 200', async () => {
    const r = await req('GET', '/api/items/item-001');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.id === 'item-001', `Expected item-001`);
    assert(r.body.itemName, 'Expected itemName field');
    assert(r.body.category, 'Expected category field');
  });

  await test('GET /items/:id — public detail does not leak private contact fields', async () => {
    const r = await req('GET', '/api/items/item-001');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(!('contactEmail' in r.body), 'Public found item detail must not include contactEmail');
    assert(!('submittedBy' in r.body), 'Public found item detail must not include submittedBy');
    assert(!('aiProfile' in r.body), 'Public found item detail must not include private aiProfile data');
  });

  await test('GET /items/:id — non-existent → 404', async () => {
    const r = await req('GET', '/api/items/does-not-exist-xyz');
    assert(r.status === 404, `Expected 404, got ${r.status}`);
  });

  await test('GET /items/:id — pending item, unauthenticated → 404', async () => {
    // item-007 is seeded as pending
    const r = await req('GET', '/api/items/item-007');
    assert(r.status === 404, `Expected 404 for pending item when unauthenticated, got ${r.status}`);
  });

  await test('POST /items — unauthenticated → 401', async () => {
    const r = await req('POST', '/api/items', { itemName: 'Stolen test', category: 'Other' });
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  await test('POST /items — missing required fields → 400', async () => {
    const r = await formReq('POST', '/api/items', {
      itemName: 'Incomplete Item'
      // missing category, description, locationFound, dateFound, contactEmail
    }, userCookie);
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test('POST /items — valid submission (authenticated) → 200, status=pending', async () => {
    const r = await formReq('POST', '/api/items', {
      itemName:      'Test Wallet',
      category:      'Other',
      description:   'Brown leather wallet found near the main entrance doors.',
      locationFound: 'Main Entrance',
      dateFound:     '2026-03-01',
      contactEmail:  'student@school.edu',
      mapFloorId:    'floor-1',
      mapRoomId:     'room-1133',
      mapRoomNumber: '1133',
      mapPinX:       '128.5',
      mapPinZ:       '-42.25'
    }, userCookie);
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.item,                         'Expected item in response');
    assert(r.body.item.status === 'pending',    'Expected status=pending');
    assert(r.body.item.itemName === 'Test Wallet', 'Expected correct itemName');
    assert(r.body.item.mapFloorId === 'floor-1', 'Expected map floor metadata to persist');
    assert(r.body.item.mapRoomId === 'room-1133', 'Expected map room metadata to persist');
    assert(r.body.item.mapRoomNumber === '1133', 'Expected map room number metadata to persist');
    assert(r.body.item.mapPinX === 128.5, 'Expected numeric map pin X metadata');
    assert(r.body.item.mapPinZ === -42.25, 'Expected numeric map pin Z metadata');
    newItemId = r.body.item.id;
  });

  await test('GET /items/map-pins — pending mapped items stay hidden from public map', async () => {
    const r = await req('GET', '/api/items/map-pins');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(Array.isArray(r.body), 'Expected array');
    assert(!r.body.some(pin => pin.id === newItemId), 'Pending found item must not appear as public map pin');
    for (const pin of r.body) {
      assert(!('contactEmail' in pin), 'Public map pin must not include contactEmail');
      assert(!('submittedBy' in pin), 'Public map pin must not include submittedBy');
      assert(!('aiProfile' in pin), 'Public map pin must not include aiProfile');
    }
  });

  // ══════════════════════════════════════════════════
  //  MISSING ITEMS
  // ══════════════════════════════════════════════════
  console.log('\n⚠️   Missing Items');
  console.log('────────────────────────────────────────────────');

  await test('GET /missing-items — public, approved only', async () => {
    const r = await req('GET', '/api/missing-items');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(Array.isArray(r.body), 'Expected array');
    assert(r.body.length > 0, 'Expected at least one missing item from seed');
    assert(r.body.every(i => i.status === 'approved'), 'All must be approved');
  });

  await test('GET /missing-items — public response does not leak private contact fields', async () => {
    const r = await req('GET', '/api/missing-items');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.length > 0, 'Expected at least one missing item');
    for (const item of r.body) {
      assert(!('contactEmail' in item), 'Public missing item list must not include contactEmail');
      assert(!('submittedBy' in item), 'Public missing item list must not include submittedBy');
      assert(!('aiProfile' in item), 'Public missing item list must not include private aiProfile data');
    }
  });

  await test('GET /missing-items?keyword=flask — filters correctly', async () => {
    const r = await req('GET', '/api/missing-items?keyword=flask');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.length > 0, 'Expected at least one result for "flask"');
  });

  await test('GET /missing-items?category=Electronics — filters by category', async () => {
    const r = await req('GET', '/api/missing-items?category=Electronics');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.every(i => i.category === 'Electronics'), 'All must be Electronics');
  });

  await test('GET /missing-items/:id — valid → 200', async () => {
    const r = await req('GET', '/api/missing-items/missing-001');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.id === 'missing-001', 'Expected missing-001');
    assert(r.body.lastSeenLocation, 'Expected lastSeenLocation field');
  });

  await test('GET /missing-items/:id — public detail does not leak private contact fields', async () => {
    const r = await req('GET', '/api/missing-items/missing-001');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(!('contactEmail' in r.body), 'Public missing item detail must not include contactEmail');
    assert(!('submittedBy' in r.body), 'Public missing item detail must not include submittedBy');
    assert(!('aiProfile' in r.body), 'Public missing item detail must not include private aiProfile data');
  });

  await test('GET /missing-items/:id — logged-in non-owner can message without email leak', async () => {
    const r = await req('GET', '/api/missing-items/missing-001', null, userCookie);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.canMessageOwner === true, 'Logged-in non-owner should be allowed to message owner');
    assert(!('contactEmail' in r.body), 'Missing item detail must not reveal owner email to non-owner');
    assert(!('submittedBy' in r.body), 'Missing item detail must not reveal owner user id to non-owner');
  });

  await test('GET /missing-items/:id — non-existent → 404', async () => {
    const r = await req('GET', '/api/missing-items/does-not-exist-xyz');
    assert(r.status === 404, `Expected 404, got ${r.status}`);
  });

  await test('POST /missing-items — unauthenticated → 401', async () => {
    const r = await req('POST', '/api/missing-items', { itemName: 'My phone' });
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  await test('POST /missing-items — missing fields → 400', async () => {
    const r = await formReq('POST', '/api/missing-items', {
      itemName: 'Incomplete'
    }, userCookie);
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test('POST /missing-items — valid (authenticated) → 200, status=pending', async () => {
    const r = await formReq('POST', '/api/missing-items', {
      itemName:         'Test Headphones',
      category:         'Electronics',
      description:      'Black Sony headphones with red ear cups, left in the library.',
      lastSeenLocation: 'Library',
      lastSeenDate:     '2026-03-01',
      contactEmail:     'student@school.edu'
    }, userCookie);
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.item.status === 'pending', 'Expected status=pending');
    newMissingId = r.body.item.id;
  });

  // ══════════════════════════════════════════════════
  //  CLAIMS
  // ══════════════════════════════════════════════════
  console.log('\n📋  Claims');
  console.log('────────────────────────────────────────────────');

  await test('POST /claims — unauthenticated → 401', async () => {
    const r = await req('POST', '/api/claims', { itemId: 'item-001', itemType: 'found' });
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  await test('POST /claims — missing required fields → 400', async () => {
    const r = await req('POST', '/api/claims', {
      itemId: 'item-001', itemType: 'found'
      // missing claimerName, claimerEmail, description
    }, userCookie);
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test('POST /claims — non-existent item → 404', async () => {
    const r = await req('POST', '/api/claims', {
      itemId:       'does-not-exist-xyz',
      itemType:     'found',
      claimerName:  'Test User',
      claimerEmail: 'test@test.com',
      description:  'This is definitely my item, I can prove ownership.'
    }, userCookie);
    assert(r.status === 404, `Expected 404, got ${r.status}`);
  });

  await test('POST /claims — invalid itemType → 400', async () => {
    const r = await req('POST', '/api/claims', {
      itemId:       'item-002',
      itemType:     'invalid_type',
      claimerName:  'Test User',
      claimerEmail: 'test@test.com',
      description:  'This is my item and I can prove it.'
    }, userCookie);
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  let newClaimId = '';
  await test('POST /claims — valid found item claim → 200', async () => {
    const r = await req('POST', '/api/claims', {
      itemId:       'item-002',
      itemType:     'found',
      claimerName:  'Test Claimer',
      claimerEmail: 'claimer@test.com',
      claimerPhone: '555-9999',
      description:  'This is my iPhone. The IMEI is printed on the box at home and I can provide a receipt.'
    }, userCookie);
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.claim,                      'Expected claim in response');
    assert(r.body.claim.status === 'pending', 'Expected status=pending');
    assert(r.body.claim.itemName,             'Expected itemName in claim');
    newClaimId = r.body.claim.id;
  });

  await test('POST /claims — valid missing item claim → 200', async () => {
    const r = await req('POST', '/api/claims', {
      itemId:       'missing-001',
      itemType:     'missing',
      claimerName:  'Item Finder',
      claimerEmail: 'finder@test.com',
      description:  'I found this item and can return it to the owner.'
    }, userCookie);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.claim.itemType === 'missing', 'Expected itemType=missing');
  });

  // ══════════════════════════════════════════════════
  //  MESSAGES
  // ══════════════════════════════════════════════════
  console.log('\n💬  Messages');
  console.log('────────────────────────────────────────────────');

  await test('POST /messages — missing-item owner can be messaged without exposing receiverEmail', async () => {
    const r = await req('POST', '/api/messages', {
      itemId: 'missing-001',
      itemName: 'Blue Hydro Flask',
      content: 'I found a bottle matching this description near the cafeteria.'
    }, userCookie);
    assert(r.status === 201, `Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.receiverEmail === 'student@school.edu', 'Server should resolve the owner account internally');
  });

  await test('GET /messages/inbox — missing-item owner receives secure contact message', async () => {
    const r = await req('GET', '/api/messages/inbox', null, user001Cookie);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.some(m => m.itemId === 'missing-001' && m.senderEmail), 'Expected owner inbox to include missing item message');
  });

  await test('POST /messages — missing-item owner cannot message themselves through owner shortcut', async () => {
    const r = await req('POST', '/api/messages', {
      itemId: 'missing-001',
      itemName: 'Blue Hydro Flask',
      content: 'Self-message should not be allowed.'
    }, user001Cookie);
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  // ══════════════════════════════════════════════════
  //  ADMIN
  // ══════════════════════════════════════════════════
  console.log('\n⚙️   Admin');
  console.log('────────────────────────────────────────────────');

  await test('GET /admin/items — unauthenticated → 401', async () => {
    const r = await req('GET', '/api/admin/items');
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  await test('GET /admin/items — non-admin user → 403', async () => {
    const r = await req('GET', '/api/admin/items', null, userCookie);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test('GET /admin/items — admin → 200, includes pending items', async () => {
    const r = await req('GET', '/api/admin/items', null, adminCookie);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(Array.isArray(r.body), 'Expected array');
    assert(r.body.some(i => i.status === 'pending'), 'Admin should see pending items');
  });

  await test('GET /admin/items — revoked admin role in DB cannot use stale session', async () => {
    await testPrisma.user.update({
      where: { email: 'admin@school.edu' },
      data: { role: 'USER' }
    });

    const r = await req('GET', '/api/admin/items', null, adminCookie);

    await testPrisma.user.update({
      where: { email: 'admin@school.edu' },
      data: { role: 'ADMIN' }
    });
    assert(r.status === 403, `Expected 403 after DB role downgrade, got ${r.status}`);
  });

  await test('GET /admin/missing-items — admin → 200', async () => {
    const r = await req('GET', '/api/admin/missing-items', null, adminCookie);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(Array.isArray(r.body), 'Expected array');
  });

  await test('GET /admin/missing-items — non-admin → 403', async () => {
    const r = await req('GET', '/api/admin/missing-items', null, userCookie);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test('GET /admin/claims — admin → 200', async () => {
    const r = await req('GET', '/api/admin/claims', null, adminCookie);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(Array.isArray(r.body), 'Expected array');
  });

  await test('GET /admin/claims — non-admin → 403', async () => {
    const r = await req('GET', '/api/admin/claims', null, userCookie);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test('PUT /admin/items/:id/approve — approves pending item', async () => {
    assert(newItemId, 'Need newItemId from earlier test');
    const r = await req('PUT', `/api/admin/items/${newItemId}/approve`, null, adminCookie);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.status === 'approved', `Expected status=approved, got ${r.body.status}`);
  });

  await test('GET /items/map-pins — approved mapped found items appear with safe fields', async () => {
    assert(newItemId, 'Need newItemId from earlier test');
    const r = await req('GET', '/api/items/map-pins');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(Array.isArray(r.body), 'Expected array');
    const pin = r.body.find(entry => entry.id === newItemId);
    assert(pin, 'Approved mapped found item should appear as public map pin');
    assert(pin.mapFloorId === 'floor-1', 'Expected pin floor id');
    assert(pin.mapRoomId === 'room-1133', 'Expected pin room id');
    assert(pin.mapRoomNumber === '1133', 'Expected pin room number');
    assert(pin.mapPinX === 128.5, 'Expected pin X coordinate');
    assert(pin.mapPinZ === -42.25, 'Expected pin Z coordinate');
    assert(pin.claimUrl === `/claim.html?id=${newItemId}&type=found`, 'Expected claim URL');
    assert(!('contactEmail' in pin), 'Public map pin must not include contactEmail');
    assert(!('submittedBy' in pin), 'Public map pin must not include submittedBy');
    assert(!('aiProfile' in pin), 'Public map pin must not include aiProfile');
  });

  await test('PUT /admin/items/:id/reject — rejects item', async () => {
    assert(newItemId, 'Need newItemId from earlier test');
    const r = await req('PUT', `/api/admin/items/${newItemId}/reject`, null, adminCookie);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.status === 'rejected', `Expected status=rejected, got ${r.body.status}`);
  });

  await test('PUT /admin/items/:id/mark-claimed — marks item as claimed', async () => {
    const r = await req('PUT', '/api/admin/items/item-003/mark-claimed', null, adminCookie);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.status === 'claimed', `Expected status=claimed`);
    // Restore for demo
    await req('PUT', '/api/admin/items/item-003/approve', null, adminCookie);
  });

  await test('PUT /admin/items/:id/approve — non-existent item → 404', async () => {
    const r = await req('PUT', '/api/admin/items/does-not-exist-xyz/approve', null, adminCookie);
    assert(r.status === 404, `Expected 404, got ${r.status}`);
  });

  await test('PUT /admin/missing-items/:id/approve → 200', async () => {
    assert(newMissingId, 'Need newMissingId from earlier test');
    const r = await req('PUT', `/api/admin/missing-items/${newMissingId}/approve`, null, adminCookie);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.status === 'approved', `Expected status=approved`);
  });

  await test('PUT /admin/missing-items/:id/reject → 200', async () => {
    assert(newMissingId, 'Need newMissingId from earlier test');
    const r = await req('PUT', `/api/admin/missing-items/${newMissingId}/reject`, null, adminCookie);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.status === 'rejected', `Expected status=rejected`);
  });

  await test('PUT /missing-items/:id/mark-found (owner) → 200, status=found', async () => {
    const r = await req('PUT', '/api/missing-items/missing-002/mark-found', null, user001Cookie);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.status === 'found', `Expected status=found`);
    // Restore
    await req('PUT', '/api/admin/missing-items/missing-002/approve', null, adminCookie);
  });

  await test('PUT /missing-items/:id/mark-found (non-owner) → 403', async () => {
    // userCookie is a freshly signed-up user who did not submit missing-002
    const r = await req('PUT', '/api/missing-items/missing-002/mark-found', null, userCookie);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test('PUT /admin/missing-items/:id — non-existent → 404', async () => {
    const r = await req('PUT', '/api/admin/missing-items/does-not-exist/approve', null, adminCookie);
    assert(r.status === 404, `Expected 404, got ${r.status}`);
  });

  await test('PUT /admin/claims/:id/approve → 200, also marks item as claimed', async () => {
    assert(newClaimId, 'Need newClaimId from earlier test');
    const r = await req('PUT', `/api/admin/claims/${newClaimId}/approve`, null, adminCookie);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.status === 'approved', `Expected claim status=approved`);
    // Verify item-002 was marked as claimed
    const item = await req('GET', '/api/items/item-002');
    assert(item.body.status === 'claimed', 'Item should now be claimed');
    // Restore item-002 for demo
    await req('PUT', '/api/admin/items/item-002/approve', null, adminCookie);
  });

  await test('PUT /admin/claims/:id/reject → 200', async () => {
    // Create a fresh claim to reject
    const login = await req('POST', '/api/auth/login', { email: 'student@school.edu', password: 'student123' });
    const sc = login.cookie;
    const claim = await req('POST', '/api/claims', {
      itemId:       'item-005',
      itemType:     'found',
      claimerName:  'Reject Test',
      claimerEmail: 'reject@test.com',
      description:  'This is my calculus textbook, my name is written inside the cover.'
    }, sc);
    const cid = claim.body.claim.id;
    const r = await req('PUT', `/api/admin/claims/${cid}/reject`, null, adminCookie);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.status === 'rejected', `Expected status=rejected`);
    await req('DELETE', `/api/admin/claims/${cid}`, null, adminCookie);
  });

  await test('PUT /admin/claims/:id — non-existent → 404', async () => {
    const r = await req('PUT', '/api/admin/claims/does-not-exist/approve', null, adminCookie);
    assert(r.status === 404, `Expected 404, got ${r.status}`);
  });

  // Deletes — run last since they're destructive
  await test('DELETE /admin/items/:id → 200, item gone', async () => {
    assert(newItemId, 'Need newItemId from earlier test');
    const r = await req('DELETE', `/api/admin/items/${newItemId}`, null, adminCookie);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    const check = await req('GET', `/api/items/${newItemId}`);
    assert(check.status === 404, 'Item should be gone after delete');
  });

  await test('DELETE /admin/missing-items/:id → 200, item gone', async () => {
    assert(newMissingId, 'Need newMissingId from earlier test');
    const r = await req('DELETE', `/api/admin/missing-items/${newMissingId}`, null, adminCookie);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    const check = await req('GET', `/api/missing-items/${newMissingId}`);
    assert(check.status === 404, 'Missing item should be gone after delete');
  });

  await test('DELETE /admin/claims/:id → 200, claim gone', async () => {
    // Create then delete
    const login = await req('POST', '/api/auth/login', { email: 'student@school.edu', password: 'student123' });
    const sc = login.cookie;
    const claim = await req('POST', '/api/claims', {
      itemId:       'item-006',
      itemType:     'found',
      claimerName:  'Delete Test',
      claimerEmail: 'del@test.com',
      description:  'This is my black umbrella, I left it near the entrance.'
    }, sc);
    const cid = claim.body.claim.id;
    const r = await req('DELETE', `/api/admin/claims/${cid}`, null, adminCookie);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
  });

  await test('DELETE /admin/items — non-existent → 404', async () => {
    const r = await req('DELETE', '/api/admin/items/does-not-exist', null, adminCookie);
    assert(r.status === 404, `Expected 404, got ${r.status}`);
  });

  // ══════════════════════════════════════════════════
  //  HTML PAGES
  // ══════════════════════════════════════════════════
  console.log('\n🌐  HTML Pages');
  console.log('────────────────────────────────────────────────');

  const pages = [
    '/',
    '/index.html',
    '/login.html',
    '/signup.html',
    '/search.html',
    '/search-missing.html',
    '/report.html',
    '/report-missing.html',
    '/item.html',
    '/missing-item.html',
    '/claim.html',
    '/map.html',
    '/admin.html',
    '/my-submissions.html'
  ];

  for (const page of pages) {
    await test(`GET ${page} → 200 HTML`, async () => {
      const r = await getPage(page);
      assert(r.status === 200,                 `Expected 200, got ${r.status}`);
      assert(r.type.includes('text/html'),     `Expected text/html, got "${r.type}"`);
    });
  }

  await test('GET /css/style.css → 200', async () => {
    const r = await getPage('/css/style.css');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
  });

  await test('GET /js/api.js → 200', async () => {
    const r = await getPage('/js/api.js');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
  });

  await test('GET /js/nav.js → 200', async () => {
    const r = await getPage('/js/nav.js');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
  });

  await test('GET /js/gatorbot.js → 200', async () => {
    const r = await getPage('/js/gatorbot.js');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
  });

  await test('GET /images/gatorbot.jpeg → 200', async () => {
    const r = await getPage('/images/gatorbot.jpeg');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
  });

  await test('campus map data module exists and exports floors', async () => {
    const file = path.join(ROOT, 'public/js/campus-map-data.js');
    assert(fs.existsSync(file), 'Expected public/js/campus-map-data.js to exist');
    const source = await fs.promises.readFile(file, 'utf8');
    assert(source.includes('export const CAMPUS_MAP_FLOORS'), 'Expected CAMPUS_MAP_FLOORS export');
  });

  await test('campus map floors include high-fidelity detail layers', async () => {
    const floors = loadCampusMapDataForTests();
    assert(floors.length === 4, `Expected 4 floors, got ${floors.length}`);
    for (const floor of floors) {
      assert(Array.isArray(floor.detailLines) && floor.detailLines.length > 0, `${floor.id} needs traced detailLines`);
      assert(floor.detailLines.some(layer => layer.cadGeometry), `${floor.id} needs generated CAD geometry`);
      assert(Array.isArray(floor.roomNumberLabels) && floor.roomNumberLabels.length >= 8, `${floor.id} needs room-number labels`);
      assert(Array.isArray(floor.stairs) && floor.stairs.length > 0, `${floor.id} needs stair geometry`);
    }
  });

  await test('campus map CAD workspace generator and outputs exist', async () => {
    const packageFile = path.join(ROOT, 'package.json');
    const pkg = JSON.parse(await fs.promises.readFile(packageFile, 'utf8'));
    assert(pkg.scripts && pkg.scripts['map:cad'], 'Expected map:cad script');
    assert(pkg.scripts['map:cad'].includes('generate-campus-cad-workspace'), 'map:cad should run the CAD generator');

    const generator = path.join(ROOT, 'scripts/generate-campus-cad-workspace.js');
    assert(fs.existsSync(generator), 'Expected CAD workspace generator script');

    const manifestFile = path.join(ROOT, 'cad/campus-map-workspace/manifests/workspace-manifest.json');
    assert(fs.existsSync(manifestFile), 'Expected generated CAD workspace manifest');
    const manifest = JSON.parse(await fs.promises.readFile(manifestFile, 'utf8'));
    assert(Array.isArray(manifest.floors) && manifest.floors.length === 5, 'Expected five CAD source drawings including Floor 1 front wing');
    for (const floor of manifest.floors) {
      assert(fs.existsSync(path.join(ROOT, 'cad/campus-map-workspace', floor.dxf)), `Missing generated DXF ${floor.dxf}`);
      assert(fs.existsSync(path.join(ROOT, floor.geometry)), `Missing generated map geometry ${floor.geometry}`);
      assert(floor.referencePathCount > 100, `${floor.id} should include imported reference paths`);
      assert(floor.closedBasePathCount > 0, `${floor.id} should include closed CAD-detail paths`);
    }
  });

  await test('campus map clean CAD converter and Floor 1 academic output exist', async () => {
    const packageFile = path.join(ROOT, 'package.json');
    const pkg = JSON.parse(await fs.promises.readFile(packageFile, 'utf8'));
    assert(pkg.scripts && pkg.scripts['map:cad:clean'], 'Expected map:cad:clean script');
    assert(pkg.scripts['map:cad:clean'].includes('convert-clean-dxf-to-map'), 'map:cad:clean should run the clean DXF converter');

    const converter = path.join(ROOT, 'scripts/convert-clean-dxf-to-map.js');
    assert(fs.existsSync(converter), 'Expected clean DXF converter script');

    const cleanDxf = path.join(ROOT, 'cad/campus-map-workspace/sources/gatorfloor1academic.dxf');
    assert(fs.existsSync(cleanDxf), 'Expected Floor 1 academic clean DXF');

    const cleanJson = path.join(ROOT, 'public/maps/clean/floor-1-clean.json');
    assert(fs.existsSync(cleanJson), 'Expected Floor 1 clean map JSON');
    const clean = JSON.parse(await fs.promises.readFile(cleanJson, 'utf8'));

    assert(clean.floorId === 'floor-1', `Expected floor-1 clean geometry, got ${clean.floorId}`);
    assert(clean.source && clean.source.endsWith('gatorfloor1academic.dxf'), 'Clean geometry should record the source DXF');
    assert(Array.isArray(clean.rooms) && clean.rooms.length >= 60, `Expected at least 60 clean Floor 1 rooms, got ${clean.rooms?.length}`);
    assert(Array.isArray(clean.hallways) && clean.hallways.length >= 3, `Expected at least 3 clean hallways, got ${clean.hallways?.length}`);
    assert(Array.isArray(clean.stairs) && clean.stairs.length >= 5, `Expected at least 5 clean stair blocks, got ${clean.stairs?.length}`);
    assert(Array.isArray(clean.labels) && clean.labels.length >= 50, 'Clean output should include typed room-number labels from CAD');
    assert(clean.labels.every((entry) => entry.roomId), 'Clean room labels should be matched to room polygons');

    for (const entry of clean.rooms.slice(0, 12)) {
      assert(entry.id && entry.roomNumber && entry.kind, `Clean room missing id/roomNumber/kind: ${JSON.stringify(entry)}`);
      assert(Array.isArray(entry.polygon) && entry.polygon.length >= 4, `Clean room ${entry.id} needs a polygon`);
      assert(polygonArea(entry.polygon) > 100, `Clean room ${entry.id} polygon area is too small`);
    }
  });

  await test('campus map Floor 1 references clean selectable CAD geometry', async () => {
    const floors = loadCampusMapDataForTests();
    const floor1 = floors.find(floor => floor.id === 'floor-1');
    assert(floor1, 'Expected floor-1 data');
    assert(floor1.cleanGeometry === '/maps/clean/floor-1-clean.json', 'Floor 1 should point to clean CAD geometry');
  });

  await test('campus map floor 1 is room-level, not broad placeholder zones', async () => {
    const floors = loadCampusMapDataForTests();
    const floor1 = floors.find(floor => floor.id === 'floor-1');
    assert(floor1, 'Expected floor-1 data');
    assert(floor1.rooms.length >= 32, `Floor 1 should include room-level geometry, got ${floor1.rooms.length} rooms`);
    const labels = new Set((floor1.roomNumberLabels || []).map(entry => entry.label));
    for (const expected of ['1145', '1101', '1209', '1222', '1501', '1601', '1629', '1642']) {
      assert(labels.has(expected), `Floor 1 missing room label ${expected}`);
    }
  });

  await test('campus map world module exists and exports renderer', async () => {
    const file = path.join(ROOT, 'public/js/campus-map-world.js');
    assert(fs.existsSync(file), 'Expected public/js/campus-map-world.js to exist');
    const source = await fs.promises.readFile(file, 'utf8');
    assert(source.includes('export class CampusMapWorld'), 'Expected CampusMapWorld export');
  });

  await test('campus map Explore Mode keeps premium 3D controls and stable zoom', async () => {
    await runCommand('node tests/map-world-source.test.js');
  });

  await test('campus map clean DXF converter supports all floors', async () => {
    await runCommand('node tests/map-converter.test.js');
  });

  await test('report found map picker supports all clean floors', async () => {
    await runCommand('node tests/report-map-picker-source.test.js');
  });

  await test('demo report autofill and image preview source contracts hold', async () => {
    await runCommand('node tests/demo-autofill-source.test.js');
  });

  await test('portal translation coverage source contracts hold', async () => {
    await runCommand('node tests/translation-coverage-source.test.js');
  });

  await test('OpenAI provider adapter handles website and image JSON safely', async () => {
    await runCommand('node tests/ai-provider.test.js');
  });

  // ══════════════════════════════════════════════════
  //  SUMMARY
  // ══════════════════════════════════════════════════
  const total = results.passed + results.failed;
  console.log('\n════════════════════════════════════════════════');
  console.log(`  ✅  Passed : ${results.passed} / ${total}`);
  console.log(`  ❌  Failed : ${results.failed} / ${total}`);

  if (results.failed > 0) {
    console.log('\n  Failed tests:');
    results.errors.forEach(e => console.log(`    • ${e.name}\n      ${e.error}`));
  } else {
    console.log('\n  🎉  All tests passed!');
  }
  console.log('════════════════════════════════════════════════\n');
}

// ── Entry point ───────────────────────────────────────────────
(async () => {
  // Run pure unit tests first (no server needed)
  runMatcherTests();

  console.log('\nStarting test server on port 3001…');
  await resetTestDatabase();
  await startServer();
  try {
    await runTests();
  } finally {
    stopServer();
    await testPrisma.$disconnect();
  }
  process.exit(results.failed > 0 ? 1 : 0);
})();

// tests/run.js — Full test suite for School Lost & Found
// Run with:  node tests/run.js
//
// The server must NOT already be running — this script starts its own instance.

const http    = require('http');
const { exec } = require('child_process');
const path    = require('path');
const fs      = require('fs');

// ── Isolated test data folder ─────────────────────────────────
const ROOT      = path.join(__dirname, '..');
const TEST_DATA = path.join(ROOT, 'data-test');

function resetTestData() {
  // Wipe and recreate so every run starts from a clean slate
  if (fs.existsSync(TEST_DATA)) fs.rmSync(TEST_DATA, { recursive: true, force: true });
  fs.mkdirSync(TEST_DATA, { recursive: true });
}

// ── Start the server ──────────────────────────────────────────
let serverProcess;

function startServer() {
  resetTestData();
  return new Promise((resolve, reject) => {
    serverProcess = exec(
      'node server/index.js',
      { cwd: ROOT, env: { ...process.env, PORT: '3001', DATA_DIR: TEST_DATA } }
    );
    serverProcess.stderr.on('data', d => { if (d.includes('Error')) console.error(d); });
    // Give the server 1.5 seconds to boot, then resolve
    setTimeout(resolve, 1500);
    serverProcess.on('error', reject);
  });
}

function stopServer() {
  if (serverProcess) serverProcess.kill();
  // Clean up the temporary test data folder
  if (fs.existsSync(TEST_DATA)) fs.rmSync(TEST_DATA, { recursive: true, force: true });
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

// ── Main test suite ───────────────────────────────────────────
async function runTests() {
  console.log('\n🔍  School Lost & Found — Test Suite');
  console.log('════════════════════════════════════════════════\n');

  let userCookie  = '';
  let adminCookie = '';
  let newItemId   = '';
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
  });

  await test('/auth/me — authenticated as admin → 200, correct data', async () => {
    const r = await req('GET', '/api/auth/me', null, adminCookie);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.email === 'admin@school.edu', `Expected admin email`);
    assert(r.body.role  === 'admin',            `Expected role=admin`);
    assert(!r.body.passwordHash,                'passwordHash must NOT be in response');
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
      contactEmail:  'student@school.edu'
    }, userCookie);
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.item,                         'Expected item in response');
    assert(r.body.item.status === 'pending',    'Expected status=pending');
    assert(r.body.item.itemName === 'Test Wallet', 'Expected correct itemName');
    newItemId = r.body.item.id;
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

  await test('PUT /admin/missing-items/:id/mark-found → 200, status=found', async () => {
    const r = await req('PUT', '/api/admin/missing-items/missing-002/mark-found', null, adminCookie);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.status === 'found', `Expected status=found`);
    // Restore
    await req('PUT', '/api/admin/missing-items/missing-002/approve', null, adminCookie);
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
    '/admin.html'
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
  console.log('\nStarting test server on port 3001…');
  await startServer();
  try {
    await runTests();
  } finally {
    stopServer();
  }
  process.exit(results.failed > 0 ? 1 : 0);
})();

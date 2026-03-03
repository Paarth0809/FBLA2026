/**
 * ui-flow.test.js — End-to-end UI test: full lost-and-found lifecycle
 *
 * Scenario
 * ────────
 *  1. User1 signs up and reports a MISSING item.
 *     → Verify: item exists with status "pending", not yet visible in public search.
 *
 *  2. Admin logs in and APPROVES the missing item report.
 *     → Verify: status changes to "approved", item now appears in public search.
 *
 *  3. User2 signs up and reports the item as FOUND.
 *     → Verify: found item exists with status "pending", not yet visible publicly.
 *
 *  4. Admin APPROVES the found item.
 *     → Verify: status "approved", item visible in public found-items search.
 *
 *  5. User1 logs in, visits the found item page, and submits a CLAIM.
 *     → Verify: claim button visible (race-condition fix), claim stored as "pending".
 *
 *  6. Admin APPROVES the claim.
 *     → Verify: claim → "approved", found item → "claimed", no longer in public search.
 *
 * Run
 * ───
 *   npx playwright test            (headless, default)
 *   npx playwright test --headed   (watch it in a browser window)
 */

const { test, expect } = require('@playwright/test');

// ── Test accounts ─────────────────────────────────────────────────────────────
const ADMIN = { email: 'admin@school.edu', password: 'admin123' };
const USER1 = { name: 'Jamie Reporter', email: 'jamie@ui-test.edu', password: 'testpass1' };
const USER2 = { name: 'Sam Finder',     email: 'sam@ui-test.edu',   password: 'testpass2' };

// ── Shared state (filled in during the test run) ──────────────────────────────
let foundItemId = null;

// ── Today's date in YYYY-MM-DD for date inputs ────────────────────────────────
const TODAY = new Date().toISOString().split('T')[0];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function signUp(page, { name, email, password }) {
  await page.goto('/signup.html');
  await page.fill('#name', name);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.fill('#confirm', password);
  await page.click('#submit-btn');
  // signup redirects to '/' on success
  await page.waitForLoadState('networkidle');
}

async function logIn(page, { email, password }) {
  await page.goto('/login.html');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('#submit-btn');
  await page.waitForLoadState('networkidle');
}

// Runs a fetch() inside the browser (inherits the session cookie)
async function apiGet(page, path) {
  return page.evaluate(async (url) => {
    const res = await fetch(url, { credentials: 'include' });
    return res.json();
  }, `http://localhost:3002/api${path}`);
}

// ── Tests (must run in this order) ───────────────────────────────────────────
test.describe.serial('Full lost & found lifecycle', () => {

  // ── Step 1 ────────────────────────────────────────────────────────────────
  test('Step 1 — User1 reports a missing item', async ({ page }) => {
    // ── Sign up User1 ────────────────────────────────────────────────────────
    await signUp(page, USER1);

    // Verify nav shows the logged-in user's first name
    await expect(page.locator('#nav-auth')).toContainText('Jamie');

    // ── Fill in the report-missing form ──────────────────────────────────────
    await page.goto('/report-missing.html');
    await expect(page.locator('#form-container')).toBeVisible();

    await page.fill('#itemName', 'Black TI-84 Calculator');
    await page.selectOption('#category', 'Electronics');
    await page.fill('#description',
      'TI-84 Plus CE graphing calculator, black, with a small scratch on the back. ' +
      'My name "Jamie" is written in marker inside the battery cover.');
    await page.fill('#lastSeenLocation', 'Math Classroom 301');
    await page.fill('#lastSeenDate', TODAY);
    // contactEmail is pre-filled from the logged-in user — leave it
    await page.click('#submit-btn');

    // ── Verify success message ────────────────────────────────────────────────
    await expect(page.locator('#success-box')).toBeVisible();
    await expect(page.locator('#success-box')).toContainText('administrator will review');

    // ── State BEFORE admin review (checked from User1's session) ────────────
    // Public search must return nothing — only approved items appear there
    const publicItems = await apiGet(page, '/missing-items');
    expect(publicItems).toHaveLength(0);                 // ← not visible yet

    console.log('    ✔  Missing item submitted successfully');
    console.log('    ✔  Public search returns 0 items (pending items are hidden)');
  });

  // ── Step 2 ────────────────────────────────────────────────────────────────
  test('Step 2 — Admin approves the missing item', async ({ page }) => {
    await logIn(page, ADMIN);

    await page.goto('/admin.html');
    await expect(page.locator('#dashboard')).toBeVisible();

    // Switch to Missing Items tab
    await page.click('button:text("Missing Items")');
    await expect(page.locator('#tab-missing')).toHaveClass(/active/);

    // ── State BEFORE approval (admin can see pending items) ──────────────────
    const beforeItems = await apiGet(page, '/admin/missing-items');
    expect(beforeItems).toHaveLength(1);
    expect(beforeItems[0].itemName).toBe('Black TI-84 Calculator');
    expect(beforeItems[0].status).toBe('pending');

    await expect(page.locator('#missing-content')).toContainText('Black TI-84 Calculator');
    await expect(page.locator('#missing-content')).toContainText('pending');

    // Click the Approve button for this item
    await page.locator('#missing-content .btn-success').first().click();
    await page.waitForLoadState('networkidle');

    // ── State AFTER approval ─────────────────────────────────────────────────
    await expect(page.locator('#missing-content')).toContainText('approved');

    const allItems = await apiGet(page, '/admin/missing-items');
    expect(allItems[0].status).toBe('approved');         // ← approved in DB

    const publicItems = await apiGet(page, '/missing-items');
    expect(publicItems).toHaveLength(1);                  // ← now visible publicly
    expect(publicItems[0].itemName).toBe('Black TI-84 Calculator');

    console.log('    ✔  Admin approved missing item → status: approved');
    console.log('    ✔  Public search now returns 1 item (correct)');
  });

  // ── Step 3 ────────────────────────────────────────────────────────────────
  test('Step 3 — User2 reports the item as found', async ({ page }) => {
    await signUp(page, USER2);

    await expect(page.locator('#nav-auth')).toContainText('Sam');

    // ── Fill in the report-found form ─────────────────────────────────────────
    await page.goto('/report.html');
    await expect(page.locator('#form-container')).toBeVisible();

    await page.fill('#itemName', 'Black TI-84 Calculator');
    await page.selectOption('#category', 'Electronics');
    await page.fill('#description',
      'TI-84 Plus CE graphing calculator. Found on the floor near room 301 after school.');
    await page.fill('#locationFound', 'Hallway outside Room 301');
    await page.fill('#dateFound', TODAY);
    await page.click('#submit-btn');

    // ── Verify success message ────────────────────────────────────────────────
    await expect(page.locator('#success-box')).toBeVisible();
    await expect(page.locator('#success-box')).toContainText('administrator will review');

    // ── State BEFORE admin review (checked from User2's session) ────────────
    // Public search must still return nothing — item is pending
    const publicItems = await apiGet(page, '/items');
    expect(publicItems).toHaveLength(0);                  // ← not visible yet

    console.log('    ✔  Found item submitted successfully');
    console.log('    ✔  Public search returns 0 items (pending items are hidden)');
  });

  // ── Step 4 ────────────────────────────────────────────────────────────────
  test('Step 4 — Admin approves the found item', async ({ page }) => {
    await logIn(page, ADMIN);

    await page.goto('/admin.html');
    await expect(page.locator('#dashboard')).toBeVisible();

    // Found Items tab is active by default
    await expect(page.locator('#tab-found')).toHaveClass(/active/);

    // ── State BEFORE approval (admin sees pending items) ─────────────────────
    const beforeItems = await apiGet(page, '/admin/items');
    expect(beforeItems).toHaveLength(1);
    foundItemId = beforeItems[0].id;
    expect(beforeItems[0].itemName).toBe('Black TI-84 Calculator');
    expect(beforeItems[0].status).toBe('pending');

    await expect(page.locator('#found-content')).toContainText('Black TI-84 Calculator');
    await expect(page.locator('#found-content')).toContainText('pending');

    // Click Approve
    await page.locator('#found-content .btn-success').first().click();
    await page.waitForLoadState('networkidle');

    // ── State AFTER approval ─────────────────────────────────────────────────
    await expect(page.locator('#found-content')).toContainText('approved');

    const allItems = await apiGet(page, '/admin/items');
    expect(allItems[0].status).toBe('approved');         // ← approved in DB

    const publicItems = await apiGet(page, '/items');
    expect(publicItems).toHaveLength(1);                  // ← now visible publicly
    expect(publicItems[0].id).toBe(foundItemId);

    console.log('    ✔  Admin approved found item → status: approved');
    console.log('    ✔  Public search now returns 1 item (correct)');
  });

  // ── Step 5 ────────────────────────────────────────────────────────────────
  test('Step 5 — User1 submits a claim on the found item', async ({ page }) => {
    await logIn(page, USER1);

    // Navigate to the found item's detail page
    await page.goto(`/item.html?id=${foundItemId}`);
    await page.waitForLoadState('networkidle');

    // Claim button must be visible (this verifies the race-condition fix)
    const claimBtn = page.locator('#claim-area a');
    await expect(claimBtn).toBeVisible();
    await expect(claimBtn).toContainText('Submit a Claim');

    await claimBtn.click();

    // ── Now on claim.html ─────────────────────────────────────────────────────
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#form-container')).toBeVisible();

    // Name and email should be pre-filled from the session
    await expect(page.locator('#claimerName')).toHaveValue(USER1.name);
    await expect(page.locator('#claimerEmail')).toHaveValue(USER1.email);

    // Fill in proof of ownership
    await page.fill('#description',
      'This is my calculator. My name "Jamie" is written in black marker inside the ' +
      'battery cover. I bought it from Best Buy last August for AP Calculus class.');

    await page.click('#submit-btn');

    // ── Verify success message ────────────────────────────────────────────────
    await expect(page.locator('#success-box')).toBeVisible();
    await expect(page.locator('#success-box')).toContainText('Claim submitted');

    // ── State BEFORE admin review (public endpoint available to User1) ───────
    // Found item must still be "approved" (not yet claimed)
    const foundItem = await apiGet(page, `/items/${foundItemId}`);
    expect(foundItem.status).toBe('approved');

    console.log('    ✔  Claim submitted successfully');
    console.log('    ✔  Found item still "approved" until admin acts (correct)');
  });

  // ── Step 6 ────────────────────────────────────────────────────────────────
  test('Step 6 — Admin approves the claim and closes the loop', async ({ page }) => {
    await logIn(page, ADMIN);

    await page.goto('/admin.html');
    await expect(page.locator('#dashboard')).toBeVisible();

    // Switch to Claims tab
    await page.click('button:text("Claims")');
    await expect(page.locator('#tab-claims')).toHaveClass(/active/);

    // ── State BEFORE approval (admin sees pending claim) ─────────────────────
    const beforeClaims = await apiGet(page, '/admin/claims');
    expect(beforeClaims).toHaveLength(1);
    expect(beforeClaims[0].claimerName).toBe(USER1.name);
    expect(beforeClaims[0].status).toBe('pending');

    await expect(page.locator('#claims-content')).toContainText(USER1.name);
    await expect(page.locator('#claims-content')).toContainText('pending');

    // Approve the claim
    await page.locator('#claims-content .btn-success').first().click();
    await page.waitForLoadState('networkidle');

    // ── State AFTER approval ─────────────────────────────────────────────────

    // 1. Claim row now shows "approved"
    await expect(page.locator('#claims-content')).toContainText('approved');

    const claims = await apiGet(page, '/admin/claims');
    expect(claims[0].status).toBe('approved');           // ← claim approved

    // 2. The found item is now "claimed"
    const items = await apiGet(page, '/admin/items');
    expect(items[0].status).toBe('claimed');              // ← item closed

    // 3. Found item no longer appears in public search
    const publicItems = await apiGet(page, '/items');
    expect(publicItems).toHaveLength(0);                  // ← off public list

    // 4. Item detail page shows the "claimed" banner
    await page.goto(`/item.html?id=${foundItemId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.alert-success'))
      .toContainText('claimed and returned');

    console.log('    ✔  Claim approved → status: approved');
    console.log('    ✔  Found item → status: claimed');
    console.log('    ✔  Public search returns 0 items (item is closed)');
    console.log('    ✔  Item detail page shows "claimed and returned" banner');
  });

});

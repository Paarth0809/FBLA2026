// nav.js — Shared navigation, authentication state, and utility functions
//
// Every page includes this file (after api.js). On load it:
//   1. Calls GET /api/auth/me to find out who is logged in
//   2. Renders the correct nav bar buttons for that user
//   3. Fires a "userLoaded" custom event so each page can react to the auth state
//
// Pages that need auth info listen for the event like this:
//   document.addEventListener('userLoaded', function(e) {
//     const user = e.detail;  // null if not logged in
//     ...
//   });

// ── School name ───────────────────────────────────────────────────────────────
// Change this string to rebrand the app for a different school.
const SCHOOL_NAME = 'Green Level Lost & Found';

// currentUser holds the logged-in user object (or null if not logged in).
// It's populated by loadUser() below and used by requireAuth() / requireAdmin().
let currentUser = null;

function safeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

// loadUser — fetches the current session user from the server.
// Called automatically at the bottom of this file when nav.js loads.
async function loadUser() {
  try {
    // GET /api/auth/me returns the user object if a valid session exists,
    // or 401 if no one is logged in.
    currentUser = await api.get('/auth/me');
  } catch {
    // 401 is expected for logged-out visitors — just set currentUser to null
    currentUser = null;
  }
  renderNav();
  // Dispatch a custom DOM event so any page-specific code can react to the
  // auth state without needing to call the API again.
  document.dispatchEvent(new CustomEvent('userLoaded', { detail: currentUser }));
}

// renderNav — builds navigation action groups based on login state.
// Injected into #nav-auth and optional compact/sidebar nav slots.
function renderNav() {
  const slots = Array.from(document.querySelectorAll('#nav-auth, #nav-auth-mobile, [data-nav-auth]'));
  if (slots.length === 0) return;

  slots.forEach((el) => {
    const mode = el.dataset.navAuth ||
      (el.id === 'nav-auth-mobile' ? 'compact' : (el.classList.contains('w-full') ? 'sidebar' : 'default'));
    el.innerHTML = currentUser ? renderLoggedInNav(mode) : renderLoggedOutNav(mode);
  });
}

function renderLoggedInNav(mode = 'default') {
  const firstName = (currentUser.name || 'there').split(' ')[0];
  const isAdmin = currentUser.role === 'admin';
  const portalHref = isAdmin ? '/admin.html' : '/my-submissions.html';
  const portalLabel = isAdmin ? 'GLHS Portal' : 'Student Portal';
  const portalIcon = isAdmin ? 'admin_panel_settings' : 'space_dashboard';

  if (mode === 'sidebar') {
    return `
      <div class="auth-panel">
        <div class="auth-user">Signed in as ${safeText(firstName)}</div>
        <button onclick="logout()" class="btn btn-ghost btn-sm w-full" type="button">
          <span class="material-symbols-outlined">logout</span>Sign Out
        </button>
      </div>
    `;
  }

  if (mode === 'compact') {
    return `
      <a href="${portalHref}" class="btn btn-outline btn-sm">
        <span class="material-symbols-outlined">${portalIcon}</span>
        <span class="hide-mobile">${portalLabel}</span>
      </a>
    `;
  }

  return `
    <span class="nav-user hide-mobile">Hi, ${safeText(firstName)}</span>
    <a href="${portalHref}" class="btn btn-outline btn-sm">
      <span class="material-symbols-outlined">${portalIcon}</span>${portalLabel}
    </a>
    <button onclick="logout()" class="btn btn-ghost btn-sm" type="button">
      <span class="material-symbols-outlined">logout</span>Sign Out
    </button>
  `;
}

function renderLoggedOutNav(mode = 'default') {
  const stackClass = mode === 'sidebar' ? 'auth-panel' : 'auth-actions';
  return `
    <div class="${stackClass}">
      <a href="/login.html" class="btn btn-outline btn-sm">Sign In</a>
      <a href="/signup.html" class="btn btn-primary btn-sm">Create Account</a>
    </div>
  `;
}

// logout — calls the API to destroy the server session, then redirects home
async function logout() {
  try { await api.post('/auth/logout'); } catch { /* ignore network errors */ }
  currentUser = null;
  window.location.href = '/';
}

// requireAuth — redirects to login if the user is not signed in.
// Call this at the top of any page that should only be accessible when logged in.
// The current URL is passed as a ?redirect= parameter so the user is sent back
// to the right page after they log in.
function requireAuth() {
  if (!currentUser) {
    const redirect = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = '/login.html?redirect=' + redirect;
    return false;
  }
  return true;
}

// requireAdmin — redirects to the homepage if the user is not an admin.
// Used on admin.html to prevent non-admin users from accessing the dashboard.
function requireAdmin() {
  if (!currentUser || currentUser.role !== 'admin') {
    window.location.href = '/';
    return false;
  }
  return true;
}

// ── Toast notifications ───────────────────────────────────────────────────────
// showToast — display a temporary notification at the bottom of the screen.
// type can be 'success', 'error', or 'info'.
function showToast(message, type = 'info') {
  // Create the container div once and reuse it for all toasts
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: 'check_circle', error: 'error', info: 'info' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="material-symbols-outlined">${icons[type] || 'info'}</span><span>${message}</span>`;
  container.appendChild(toast);
  // Auto-remove after 4 seconds
  setTimeout(() => toast.remove(), 4000);
}

// ── Utility helpers ───────────────────────────────────────────────────────────

// formatDate — convert an ISO date string like "2026-02-15" to "Feb 15, 2026".
// We append T00:00:00 to force local time parsing — without it, JavaScript
// treats bare date strings as UTC midnight which can show the previous day.
function formatDate(str) {
  if (!str) return '—';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// statusBadge — return an HTML <span> styled as a colored badge for an item status.
// Used in tables and cards throughout the app.
function statusBadge(status) {
  const map = {
    pending:  'badge-pending',
    approved: 'badge-approved',
    rejected: 'badge-rejected',
    claimed:  'badge-claimed',
    found:    'badge-found'
  };
  const cls = map[status] || 'badge-pending';
  return `<span class="badge ${cls}">${status}</span>`;
}

// categoryEmoji — return a representative Material icon for each item category.
// Used as a fallback thumbnail when an item has no photo.
function categoryEmoji(category) {
  const map = {
    'Electronics':           'devices',
    'Clothing':              'checkroom',
    'Books & Supplies':      'menu_book',
    'Keys & ID Cards':       'key',
    'Bags & Backpacks':      'backpack',
    'Sports Equipment':      'sports_basketball',
    'Jewelry & Accessories': 'watch',
    'Other':                 'inventory_2'
  };
  const icon = map[category] || 'inventory_2';
  return `<span class="material-symbols-outlined category-icon" aria-hidden="true">${icon}</span>`;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
// Run loadUser as soon as this script is parsed so the nav renders before the
// rest of the page's scripts fire their userLoaded listeners.
loadUser();

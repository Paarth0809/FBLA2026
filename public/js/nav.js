// nav.js — Shared navigation bar logic and auth state
// Include this (after api.js) on every page.

// Change this to your school's name!
const SCHOOL_NAME = 'School Lost & Found';

let currentUser = null;  // filled in by loadUser()

// Called once on page load — fetches the current session user
async function loadUser() {
  try {
    currentUser = await api.get('/auth/me');
  } catch {
    currentUser = null;
  }
  renderNav();
  // Tell the page that user info is ready (pages listen for this event)
  document.dispatchEvent(new CustomEvent('userLoaded', { detail: currentUser }));
}

// Renders the right-side nav buttons based on login state
function renderNav() {
  const el = document.getElementById('nav-auth');
  if (!el) return;

  if (currentUser) {
    el.innerHTML = `
      <span class="text-sm text-muted hide-mobile" style="padding:0 0.5rem">
        Hi, ${currentUser.name.split(' ')[0]}
      </span>
      ${currentUser.role === 'admin'
        ? '<a href="/admin.html" class="btn btn-outline btn-sm">⚙️ Admin</a>'
        : '<a href="/my-submissions.html" class="btn btn-outline btn-sm hide-mobile">My Submissions</a>'}
      <a href="/report.html" class="btn btn-primary btn-sm">+ Report Found</a>
      <button onclick="logout()" class="btn btn-ghost btn-sm">Logout</button>
    `;
  } else {
    el.innerHTML = `
      <a href="/login.html"  class="btn btn-outline btn-sm">Sign In</a>
      <a href="/signup.html" class="btn btn-primary btn-sm">Sign Up</a>
    `;
  }
}

// Log the current user out
async function logout() {
  try { await api.post('/auth/logout'); } catch { /* ignore */ }
  currentUser = null;
  window.location.href = '/';
}

// Call this on protected pages — redirects to login if not signed in
function requireAuth() {
  if (!currentUser) {
    const redirect = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = '/login.html?redirect=' + redirect;
    return false;
  }
  return true;
}

// Call this on admin-only pages
function requireAdmin() {
  if (!currentUser || currentUser.role !== 'admin') {
    window.location.href = '/';
    return false;
  }
  return true;
}

// ── Toast notifications ──────────────────────────────────────
function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✓', error: '✕', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icons[type] || ''}</span> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ── Helpers ──────────────────────────────────────────────────

// Format "2026-02-15" → "Feb 15, 2026"
function formatDate(str) {
  if (!str) return '—';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Return a colored badge <span> for an item status
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

// Category emoji map for item card thumbnails
function categoryEmoji(category) {
  const map = {
    'Electronics':          '📱',
    'Clothing':             '👕',
    'Books & Supplies':     '📚',
    'Keys & ID Cards':      '🔑',
    'Bags & Backpacks':     '🎒',
    'Sports Equipment':     '⚽',
    'Jewelry & Accessories':'💍',
    'Other':                '📦'
  };
  return map[category] || '📦';
}

// Kick off the auth check as soon as nav.js loads
loadUser();

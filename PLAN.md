# PLAN.md — Full UI Redesign: Google Stitch "Green Level Reclaim" Design System

> Source of truth: Google Stitch project "Green Level Reclaim" (ID: 72805516918142809)
> Last updated: 2026-06-09

---

## CRITICAL: How to Write HTML Files

The GateGuard hook BLOCKS the Write tool for HTML files. Use Bash heredoc ONLY:

```bash
cat > /Users/paarthrathod/SOURCE/FBLA2026/public/FILENAME.html << 'HTMLEOF'
... html content ...
HTMLEOF
```

Use single-quoted `'HTMLEOF'` — this prevents shell from expanding `${...}` in JS template literals.

---

## Overview

Complete visual redesign of all 12 HTML pages to match Google Stitch "Green Level Reclaim" reference designs. NO backend changes whatsoever. All routes, API calls, JS logic, tabs, forms, matches, messages, claims, uploads, and admin actions preserved exactly.

**Root cause of visual mismatch:** Every page uses an INCOMPLETE Tailwind config that is missing:
1. Custom `spacing` tokens (xs, sm, md, lg, xl, xxl)
2. Custom `fontSize` tokens (display-lg, headline-lg, headline-md, body-md, label-md, label-sm)
3. Custom `fontFamily` tokens (headline-lg, headline-md, body-md, label-md, etc.)
4. Several color tokens (tertiary, secondary, error-container, surface-dim, inverse-on-surface, etc.)
5. Wrong `borderRadius` defaults (should be 0.25rem, not Tailwind's default)

**Second issue:** Active sidebar nav items use `bg-primary-container/20 text-primary` (transparent/weak).
Stitch design uses: `bg-primary-container text-on-primary-container rounded-xl translate-x-1` (solid emerald with dark text + slight indent)

**Third issue:** Admin sidebar uses `bg-surface-container-low` (light green). Stitch design uses `bg-inverse-surface` (dark charcoal-green, matching the top navbar).

---

## style.css — CAN and SHOULD Be Updated

`public/css/style.css` is fully editable. Update it freely to match the Stitch design. The only constraint: keep the **class names** that JS-generated HTML depends on (you can restyle them completely, just don't rename or delete them).

**Class names to preserve (restyle freely, keep the names):**
- `.btn`, `.btn-primary`, `.btn-outline`, `.btn-ghost`, `.btn-success`, `.btn-sm`, `.btn-lg`
- `.badge`, `.badge-category`, `.badge-status`, `.badge-pending`, `.badge-approved`, `.badge-rejected`, `.badge-claimed`
- `.alert`, `.alert-info`, `.alert-error`, `.alert-success`, `.alert-warning`
- `.toast`, `.toast-info`, `.toast-success`, `.toast-error`
- `.modal`, `.modal-overlay`, `.modal-header`, `.modal-body`, `.modal-footer`, `.modal-close`
- `.spinner`, `.loading-center`
- `.empty-state`
- `.tab`, `.tab-panel`, `.tab-bar`
- `.form-input`, `.form-select`, `.form-textarea`, `.form-label`, `.form-hint`, `.form-group`, `.req`
- `.upload-zone`, `.photo-preview`
- `.table-wrap`, `.table-container`
- `.item-card`, `.item-card-img`, `.item-card-body`, `.item-card-top`, `.item-card-name`, `.item-card-desc`, `.item-meta`, `.item-meta-row`
- `.match-card`, `.match-items`, `.match-item`, `.match-thumb`, `.match-reason`, `.match-strength`
- `.msg-card`, `.msg-header`, `.msg-regarding`, `.msg-body`, `.msg-context`, `.msg-reply-quote`
- `.detail-grid`, `.detail-img`, `.detail-fields`, `.detail-field`, `.detail-label`, `.detail-value`

---

## Complete Tailwind Config (use in EVERY page, identical across all 12)

```javascript
tailwind.config = {
  darkMode: "class",
  theme: { extend: {
    colors: {
      "primary": "#006c49", "on-primary": "#ffffff",
      "primary-container": "#10b981", "on-primary-container": "#00422b",
      "primary-fixed": "#6ffbbe", "primary-fixed-dim": "#4edea3",
      "on-primary-fixed": "#002113", "on-primary-fixed-variant": "#005236",
      "secondary": "#565e74", "on-secondary": "#ffffff",
      "secondary-container": "#dae2fd", "on-secondary-container": "#5c647a",
      "secondary-fixed": "#dae2fd", "secondary-fixed-dim": "#bec6e0",
      "on-secondary-fixed": "#131b2e", "on-secondary-fixed-variant": "#3f465c",
      "tertiary": "#a43a3a", "on-tertiary": "#ffffff",
      "tertiary-container": "#fc7c78", "on-tertiary-container": "#711419",
      "tertiary-fixed": "#ffdad7", "tertiary-fixed-dim": "#ffb3af",
      "on-tertiary-fixed": "#410005", "on-tertiary-fixed-variant": "#842225",
      "error": "#ba1a1a", "on-error": "#ffffff",
      "error-container": "#ffdad6", "on-error-container": "#93000a",
      "surface": "#f4fbf4", "surface-bright": "#f4fbf4",
      "surface-dim": "#d4dcd5", "surface-tint": "#006c49",
      "surface-container-lowest": "#ffffff", "surface-container-low": "#eef6ee",
      "surface-container": "#e8f0e9", "surface-container-high": "#e3eae3",
      "surface-container-highest": "#dde4dd", "surface-variant": "#dde4dd",
      "on-surface": "#161d19", "on-surface-variant": "#3c4a42",
      "outline": "#6c7a71", "outline-variant": "#bbcabf",
      "inverse-surface": "#2b322d", "inverse-on-surface": "#ebf3eb",
      "inverse-primary": "#4edea3", "background": "#f4fbf4", "on-background": "#161d19"
    },
    borderRadius: { "DEFAULT": "0.25rem", "lg": "0.5rem", "xl": "0.75rem", "full": "9999px" },
    spacing: {
      "xs": "4px", "sm": "8px", "md": "16px", "lg": "24px",
      "xl": "32px", "xxl": "48px", "unit": "4px", "gutter": "24px"
    },
    fontFamily: {
      "headline": ["'Plus Jakarta Sans'", "sans-serif"],
      "headline-lg": ["'Plus Jakarta Sans'", "sans-serif"],
      "headline-md": ["'Plus Jakarta Sans'", "sans-serif"],
      "display-lg": ["'Plus Jakarta Sans'", "sans-serif"],
      "body-md": ["'Inter'", "sans-serif"],
      "body-lg": ["'Inter'", "sans-serif"],
      "label-md": ["'Inter'", "sans-serif"],
      "label-sm": ["'Inter'", "sans-serif"]
    },
    fontSize: {
      "display-lg": ["48px", {"lineHeight":"1.2","letterSpacing":"-0.02em","fontWeight":"800"}],
      "headline-lg": ["32px", {"lineHeight":"1.25","letterSpacing":"-0.01em","fontWeight":"700"}],
      "headline-md": ["24px", {"lineHeight":"1.4","fontWeight":"600"}],
      "headline-lg-mobile": ["24px", {"lineHeight":"1.3","fontWeight":"700"}],
      "body-lg": ["18px", {"lineHeight":"1.6","fontWeight":"400"}],
      "body-md": ["16px", {"lineHeight":"1.5","fontWeight":"400"}],
      "label-md": ["14px", {"lineHeight":"1.2","letterSpacing":"0.05em","fontWeight":"600"}],
      "label-sm": ["12px", {"lineHeight":"1.2","fontWeight":"500"}]
    },
    maxWidth: { "container": "1280px" }
  }}
}
```

---

## Standard Per-Page Head Block (identical for ALL 12 pages)

```html
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap" rel="stylesheet"/>
```

```html
<style>
  body { font-family: 'Inter', sans-serif; }
  .material-symbols-outlined { font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24; line-height: 1; display: inline-flex; align-items: center; vertical-align: middle; }
  .icon-fill { font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24; }
</style>
```

Use `icon-fill` CSS class for filled icons (NOT the old `.filled` class or `.material-symbols-outlined.filled`).
Existing `.filled` usages in JS-generated HTML are fine — don't touch JS. Only new HTML uses `icon-fill`.

---

## Two Layout Systems

| Context | Layout | Sidebar |
|---------|---------|---------|
| Public (index, search, search-missing, item, missing-item, login, signup) | Top navbar only | None |
| Student forms (report, report-missing, claim, my-submissions) | Left sidebar + main | Student Portal sidebar (light) |
| Admin (admin) | Left sidebar + main | GLHS Portal sidebar (DARK) |

---

## Student Portal Sidebar (used by report, report-missing, claim, my-submissions)

```html
<aside class="hidden md:flex flex-col w-64 bg-surface-container-low border-r border-outline-variant fixed left-0 top-0 bottom-0 z-40 overflow-y-auto">
  <!-- Brand -->
  <div class="p-5 border-b border-outline-variant">
    <a href="/index.html" class="flex items-center gap-3">
      <div class="w-9 h-9 rounded-full bg-primary-container flex items-center justify-center shrink-0">
        <span class="material-symbols-outlined icon-fill text-on-primary-container" style="font-size:18px">school</span>
      </div>
      <div>
        <div class="font-headline font-bold text-on-surface text-sm leading-tight">Student Portal</div>
        <div class="text-xs text-on-surface-variant">Lost &amp; Found</div>
      </div>
    </a>
  </div>

  <!-- Nav — swap ACTIVE/INACTIVE class on each item per page -->
  <nav class="flex-1 p-3 flex flex-col gap-0.5">

    <!-- ACTIVE item pattern: -->
    <a href="/my-submissions.html"
       class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold bg-primary-container text-on-primary-container translate-x-1 transition-all">
      <span class="material-symbols-outlined icon-fill" style="font-size:18px">dashboard</span>
      My Submissions
    </a>

    <!-- INACTIVE item pattern: -->
    <a href="/report.html"
       class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors">
      <span class="material-symbols-outlined" style="font-size:18px">add_circle</span>
      Report Found Item
    </a>

    <a href="/report-missing.html"
       class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors">
      <span class="material-symbols-outlined" style="font-size:18px">report</span>
      Report Missing Item
    </a>

    <div class="border-t border-outline-variant my-2"></div>

    <a href="/search.html"
       class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors">
      <span class="material-symbols-outlined" style="font-size:18px">search</span>
      Browse Found Items
    </a>

    <a href="/search-missing.html"
       class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors">
      <span class="material-symbols-outlined" style="font-size:18px">manage_search</span>
      Browse Missing Items
    </a>
  </nav>

  <!-- Auth (logout button injected by nav.js) -->
  <div class="p-3 border-t border-outline-variant">
    <div id="nav-auth" class="w-full"></div>
  </div>
</aside>
```

**Mobile top bar for student pages:**
```html
<div class="md:hidden fixed top-0 left-0 right-0 z-40 bg-inverse-surface h-14 flex items-center gap-3 px-4" style="box-shadow:0 2px 12px rgba(0,0,0,0.18)">
  <a href="/index.html" class="text-white/70 hover:text-white transition-colors" aria-label="Back to home">
    <span class="material-symbols-outlined" style="font-size:22px">arrow_back</span>
  </a>
  <span class="font-headline font-bold text-white text-base flex-1">PAGE TITLE HERE</span>
  <div id="nav-auth-mobile" class="flex items-center"></div>
</div>
```

**Body + main layout for student pages:**
```html
<body class="bg-surface-container min-h-screen flex">
  <!-- aside here -->
  <main class="flex-1 md:ml-64 pt-14 md:pt-0 min-h-screen overflow-y-auto">
    <!-- content here -->
  </main>
</body>
```

---

## GLHS Portal Sidebar (admin.html ONLY — DARK sidebar)

```html
<aside class="hidden md:flex flex-col w-64 bg-inverse-surface fixed left-0 top-0 bottom-0 z-40 overflow-y-auto">
  <!-- Brand -->
  <div class="p-5 border-b border-white/10">
    <a href="/admin.html" class="flex items-center gap-3">
      <div class="w-9 h-9 rounded-full bg-primary-container flex items-center justify-center shrink-0">
        <span class="material-symbols-outlined icon-fill text-on-primary-container" style="font-size:18px">school</span>
      </div>
      <div>
        <div class="font-headline font-bold text-white text-sm leading-tight">GLHS Portal</div>
        <div class="text-xs text-white/50">Lost &amp; Found Admin</div>
      </div>
    </a>
  </div>

  <!-- Nav -->
  <nav class="flex-1 p-3 flex flex-col gap-0.5">
    <!-- ACTIVE admin item: -->
    <a href="/admin.html"
       class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold bg-primary-container text-on-primary-container translate-x-1 transition-all">
      <span class="material-symbols-outlined icon-fill" style="font-size:18px">admin_panel_settings</span>
      Dashboard
    </a>
    <!-- Inactive: text-white/60 hover:bg-white/10 hover:text-white -->
    <a href="/search.html"
       class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/60 hover:bg-white/10 hover:text-white transition-colors">
      <span class="material-symbols-outlined" style="font-size:18px">search</span>
      Browse Items
    </a>
  </nav>

  <!-- Auth -->
  <div class="p-3 border-t border-white/10">
    <div id="nav-auth" class="w-full"></div>
  </div>
</aside>
```

**Body + layout for admin page:**
```html
<body class="bg-surface min-h-screen flex">
  <!-- aside here -->
  <main class="flex-1 md:ml-64 overflow-y-auto">
    <!-- content here -->
  </main>
</body>
```

---

## Top Navbar (public pages: index, search, search-missing, item, missing-item, login, signup)

```html
<nav class="fixed top-0 w-full z-50 bg-inverse-surface border-b border-white/5" style="box-shadow:0 2px 12px rgba(0,0,0,0.18)">
  <div class="max-w-container mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
    <a href="/index.html" class="flex items-center gap-2 font-headline font-bold text-lg text-white hover:text-primary-container transition-colors">
      <span class="material-symbols-outlined icon-fill text-primary-container" style="font-size:22px">search</span>
      School Lost &amp; Found
    </a>
    <div class="flex items-center gap-1">
      <a href="/search.html" class="hidden md:block text-white/75 hover:text-white hover:bg-white/10 px-3 py-2 rounded-xl text-sm font-medium transition-colors">Found Items</a>
      <a href="/search-missing.html" class="hidden md:block text-white/75 hover:text-white hover:bg-white/10 px-3 py-2 rounded-xl text-sm font-medium transition-colors">Missing Items</a>
      <div id="nav-auth" class="flex items-center gap-2 ml-2"></div>
    </div>
  </div>
</nav>
```

For search pages, add inline search in the navbar (between logo and right links):
```html
<form id="search-form" class="flex-1 max-w-xl mx-4">
  <div class="relative">
    <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline" style="font-size:18px">search</span>
    <input class="w-full pl-10 pr-4 py-2 rounded-full border border-white/20 bg-white/10 text-white placeholder-white/50 text-sm focus:outline-none focus:bg-white/20 focus:border-white/40 transition-all"
           type="text" id="keyword" placeholder="Search items…">
  </div>
</form>
```

---

## Page-by-Page Specification

### 1. index.html — Homepage
**Body:** `class="bg-surface text-on-surface min-h-screen flex flex-col"`  
**Top:** Fixed dark navbar  

**Hero section** (`bg-gradient-to-br from-surface-container-low via-surface-container to-surface-container-high`):
- Left column: "AI-Powered Recovery System" badge (bg-white/70 text-primary border-primary/20), large headline (font-headline font-extrabold, clamp(2.5rem,5vw,3.5rem), letter-spacing -0.02em), subtext, CTA buttons
- Right column: Bento grid (CSS grid 2-col 2-row):
  - `bento-main` spans full height left col: school.jpg with recovery rate overlay card
  - Two `bento-side` tiles on right: one with item count stat, one with avg return stat
- Auth-conditional: `#report-actions` (hidden), `#signin-cta`, `#admin-section`
  
**Stats strip** (`bg-surface-container py-12`): 4 cards with icon + big number + label

**How it works** (`py-20 bg-surface-container-lowest`): 3 cards with numbered circles (bg-primary-container text-on-primary-container), decorative connecting line behind

**Admin section** (`py-16 bg-surface-container`): shown to logged-out or admin only

**Footer** (`bg-inverse-surface`): logo + copyright + `#footer-user`

**JS to preserve exactly:**
```javascript
document.addEventListener('userLoaded', function(e) {
  const user = e.detail;
  if (user) {
    document.getElementById('report-actions').classList.remove('hidden');
    document.getElementById('signin-cta').classList.add('hidden');
    if (user.role !== 'admin') document.getElementById('admin-section').classList.add('hidden');
    document.getElementById('footer-user').textContent = `Logged in as: ${user.email} (${user.role})`;
  }
});
```

---

### 2. login.html — Sign In
**Body:** `class="min-h-screen bg-surface-container flex items-center justify-center p-4 relative overflow-hidden"`  
Background decorative blobs (absolute positioned blur circles)

Floating card (`max-w-md`, `bg-surface-container-lowest`, `rounded-2xl`, border, shadow):
- School photo header (h-44, bg-inverse-surface): img + gradient overlay + school name + back-to-home link
- Card body (p-7): "Welcome back" h2 + subtext, `#error-box`, form with email + password inputs + submit btn
- Demo account buttons (3 grid): Admin / Student 1 / Student 2 — `onclick="fillDemo(email, password)"`

**JS to preserve exactly:**
```javascript
document.addEventListener('userLoaded', function(e) { if (e.detail) window.location.href = getRedirect(); });
function getRedirect() { return new URLSearchParams(window.location.search).get('redirect') || '/'; }
function fillDemo(email, password) {
  document.getElementById('email').value = email;
  document.getElementById('password').value = password;
}
document.getElementById('login-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const btn = document.getElementById('submit-btn');
  const errorBox = document.getElementById('error-box');
  errorBox.classList.add('hidden');
  btn.disabled = true; btn.textContent = 'Signing in…';
  try {
    await api.post('/auth/login', { email: document.getElementById('email').value.trim(), password: document.getElementById('password').value });
    window.location.href = getRedirect();
  } catch (err) {
    errorBox.textContent = err.message; errorBox.classList.remove('hidden');
    btn.disabled = false; btn.textContent = 'Sign In';
  }
});
```

---

### 3. signup.html — Create Account
**Body:** `class="min-h-screen bg-surface-container-lowest flex"`

Split layout:
- **Left panel** (`hidden md:flex`, `w-5/12`, `bg-inverse-surface`, relative overflow-hidden):
  - School.jpg background (opacity-30 with gradient overlay)
  - Top: brand link
  - Middle: "Verified Community" badge + headline "Reuniting campus community." + subtext
  - Bottom: stats row (94% Recovery rate + 500+ Items reunited)
- **Right panel** (`flex-1`, `flex flex-col justify-center`, `p-8 md:p-12`):
  - Mobile brand link (md:hidden)
  - "Create an account" h2 + subtext
  - `#error-box`
  - Form: Full Name + Email + Password + Confirm Password + submit btn
  - "Already have an account? Sign in" link

**JS to preserve exactly:**
```javascript
document.addEventListener('userLoaded', function(e) { if (e.detail) window.location.href = '/'; });
document.getElementById('signup-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const btn = document.getElementById('submit-btn');
  const errorBox = document.getElementById('error-box');
  errorBox.classList.add('hidden');
  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const confirm = document.getElementById('confirm').value;
  if (password !== confirm) { errorBox.textContent = 'Passwords do not match.'; errorBox.classList.remove('hidden'); return; }
  btn.disabled = true; btn.textContent = 'Creating account…';
  try {
    await api.post('/auth/signup', { name, email, password });
    window.location.href = '/';
  } catch (err) {
    errorBox.textContent = err.message; errorBox.classList.remove('hidden');
    btn.disabled = false; btn.textContent = 'Create Account';
  }
});
```

---

### 4. search.html — Browse Found Items
**Body:** `class="bg-surface text-on-surface min-h-screen flex flex-col"`  
`pt-16` on main content wrapper (to clear fixed navbar)

Layout: `flex flex-1 pt-16` → left filter sidebar (fixed w-64) + main content (md:ml-64)

**Left sidebar** (`bg-surface-container-low`, `border-r border-outline-variant`, fixed): 
- "Filters" heading
- Category `<select id="category">`
- Apply Filters button (`onclick="applyFilters()"`)
- Clear Filters button (id=`clear-btn`, hidden by default)
- Info tip card (bg-primary/8 rounded-xl): link to /report.html

**Main content:** h1 "Search Found Items" + subtext + result count (`#result-count`) + `#content` div  
Mobile: category select + filter button shown inline above results  

**Card template in itemCard() function — MUST preserve this exact function structure:**
```javascript
function itemCard(item) {
  const img = item.photo ? `<img src="/uploads/${item.photo}" alt="${item.itemName}">` : `<span title="${item.category}">${categoryEmoji(item.category)}</span>`;
  return `<div class="item-card">
    <div class="item-card-img">${img}
      <span class="badge badge-category" style="position:absolute;top:10px;left:10px">${item.category}</span>
    </div>
    <div class="item-card-body">
      <div class="item-card-top"><span class="item-card-name">${item.itemName}</span></div>
      <p class="item-card-desc">${item.description}</p>
      <div class="item-meta">
        <div class="item-meta-row"><span>📍</span> ${item.locationFound}</div>
        <div class="item-meta-row"><span>📅</span> ${formatDate(item.dateFound)}</div>
      </div>
      <a href="/item.html?id=${item.id}" class="btn btn-primary w-full">View Details</a>
    </div>
  </div>`;
}
```

Also preserve: `loadItems(keyword, category)`, `applyFilters()`, `applyFiltersMobile()`, `clearFilters()`, search form submit listener, `loadItems('','')` on page load.

---

### 5. search-missing.html — Browse Missing Items
Same structure as search.html, but:
- API call: `GET /missing-items?keyword=&category=`
- Card shows `item.lastSeenLocation` and `item.lastSeenDate`
- Link goes to `/missing-item.html?id=`
- Info sidebar card: "If you found an item on this list, please report it"
- Mobile info banner shown with `alert alert-info`

---

### 6. item.html — Found Item Detail
**Body:** `class="bg-surface text-on-surface min-h-screen flex flex-col"`  
Fixed top navbar, `pt-16 pb-12` main

Layout: breadcrumb "← Back to Found Items" then `#content` div (spinner initially)

`render(item)` function builds:
```
detail-grid (2 col on md):
  Left: detail-img div (photo or emoji)
  Right:
    - Info card: item name + statusBadge() + detail-fields (category, description, location, date, reporter)
    - Action card: "Is this yours?" + #claim-area (injected by updateClaimArea())
```

`updateClaimArea()` checks `currentUser` + `loadedItem.status === 'approved'`:
- Logged in → `<a href="/claim.html?id=...&type=found" class="btn btn-primary btn-lg w-full">`
- Not logged in → `<div class="alert alert-info">` with sign-in link
- Must listen for `userLoaded` event

**Preserve all JS exactly as-is (api.get, render, updateClaimArea, loadItem).**

---

### 7. missing-item.html — Missing Item Detail
**Body:** `class="bg-surface text-on-surface min-h-screen flex flex-col"`

Same layout as item.html but renders missing item fields (lastSeenLocation, lastSeenDate, contactEmail).

Contains message modal: `#msg-modal-overlay` (modal-overlay), `.modal` card with textarea `#msg-textarea` + char count + `#msg-error`

**Preserve ALL JS exactly:**
- `loadItem()`, `render(item)`, `maybeShowMessageBtn()`
- Modal: `openMessageModal()`, `closeMessageModal()`, `handleOverlayClick()`, `updateCharCount()`, `sendMessage()`
- `api.post('/messages', { receiverEmail, itemId, itemName, content })`
- Keyboard ESC to close modal

---

### 8. report.html — Report Found Item
**Uses student sidebar.** Active item: "Report Found Item"  
**Auth guard:** `#auth-required` card shown before login, `#form-container` hidden until user confirmed  
**Pre-fills** `contactEmail` with `user.email` on load  

Form fields: itemName, category, description, locationFound, dateFound, contactEmail, photo (file upload)  
Upload zone: `#upload-zone` (upload-zone class), `#preview-container` (photo-preview hidden), photo preview img  

**Preserve ALL JS exactly:**
- `dateFound.max = new Date().toISOString().split('T')[0]`
- Auth guard (userLoaded event)
- Photo change handler + FileReader + clearPhoto()
- Form submit: `api.post('/items', formData)` (FormData for multipart)
- Success: show alert + redirect to /search.html after 2s

---

### 9. report-missing.html — Report Missing Item
**Uses student sidebar.** Active item: "Report Missing Item"  
Same auth-gate pattern as report.html  

Form fields: itemName, category, description, lastSeenLocation, lastSeenDate, contactEmail, photo  
Note: field name is `lastSeenDate` not `dateFound`, `lastSeenLocation` not `locationFound`  

**Preserve ALL JS exactly** (same pattern as report.html but posts to `/missing-items`):
- `api.post('/missing-items', formData)`
- Success redirects to `/search-missing.html`

---

### 10. claim.html — Submit a Claim
**Uses student sidebar.** Active item: "Claims" (or no active — this page is reached from item.html)  
Reads URL params: `?id=ITEM_ID&type=found|missing`  
Loads item name from API for display  

Form: claimerName (pre-filled user.name), claimerEmail (pre-filled user.email), claimerPhone (optional), description (proof of ownership)  

```javascript
await api.post('/claims', { itemId, itemType, claimerName, claimerEmail, claimerPhone, description });
```

Back/Cancel links dynamically set to `/item.html?id=X` or `/missing-item.html?id=X`  
Login link: `/login.html?redirect=/claim.html?id=${itemId}%26type=${itemType}`

---

### 11. my-submissions.html — Student Dashboard
**Uses student sidebar.** Active item: "My Submissions"  
**Auth-required:** if not logged in, show redirect.  

**Five tab panels (all must work):**
- Tab 0: Found Items I Reported (`api.get('/items/my')`)
- Tab 1: Missing Items I Reported (`api.get('/missing-items/my')`)
- Tab 2: My Claims (`api.get('/claims/my')`)
- Tab 3: Matches (`api.get('/matches/my-missing')`) — AI match cards
- Tab 4: Messages inbox (`api.get('/messages/inbox')`) + sent (`api.get('/messages/sent')`)

**Match card UI (generated by JS):**
- Uses `.match-card`, `.match-items`, `.match-item`, `.match-thumb`, `.match-reason`, `.match-strength` CSS classes
- Shows missing item thumbnail + found item thumbnail side by side
- Match score percentage + match reasons list
- "Dismiss" + "Claim This Item" buttons

**Message card UI (generated by JS):**
- Uses `.msg-card`, `.msg-header`, `.msg-regarding`, `.msg-body` CSS classes
- Reply button opens compose modal
- Delete button with confirmation (`confirm()` dialog)
- `api.delete('/messages/' + msg.id)` for deletion

**Reply modal:** `#reply-modal-overlay` with `#reply-textarea` + `#reply-to-display` + send handler
- `api.post('/messages', { receiverEmail, itemId, itemName, content })` 

**Danger Zone section:** "Delete Account" button → `api.delete('/auth/me')` → redirect to /login.html

**ALL JS must be preserved exactly. Do not alter any API endpoints or data structures.**

---

### 12. admin.html — Admin Management Panel
**Uses GLHS Portal sidebar (DARK, bg-inverse-surface).** Only accessible to admin role.  
Redirects non-admin users to /login.html  

**Stats row (4 cards):** from `api.get('/admin/stats')` → totalItems, pendingItems, totalClaims, pendingClaims  

**Three tab panels:**
- Tab 0: Found Items (`api.get('/items?status=pending')` and all items)
- Tab 1: Missing Items (`api.get('/missing-items?status=pending')`)
- Tab 2: Claims (`api.get('/claims')`)

**Admin action buttons for items:**
- Approve: `api.post('/admin/items/' + id + '/approve')`
- Reject: `api.post('/admin/items/' + id + '/reject')`
- Delete: `api.delete('/admin/items/' + id)`
- Mark Claimed: `api.post('/admin/items/' + id + '/mark-claimed')`

**Admin action buttons for missing items:**
- Approve: `api.post('/admin/missing-items/' + id + '/approve')`
- Reject: `api.post('/admin/missing-items/' + id + '/reject')`
- Delete: `api.delete('/admin/missing-items/' + id)`
- Mark Found: `api.post('/admin/missing-items/' + id + '/mark-found')`

**Admin action buttons for claims:**
- Approve: `api.post('/admin/claims/' + id + '/approve')`
- Reject: `api.post('/admin/claims/' + id + '/reject')`
- View evidence: inline expand or modal

**Message thread viewer:** read-only modal showing admin viewing messages between users  
`api.get('/admin/messages/thread/' + itemId)` → shows message thread  

**All admin JS must be preserved exactly.**

---

## Implementation Order (recommended)

1. **index.html** — no sidebar, visual-only change (bento grid hero + updated config)
2. **login.html** — auth card, no sidebar
3. **signup.html** — split panel, no sidebar
4. **search.html** — filter sidebar (already exists, fix config + active state N/A)
5. **search-missing.html** — same as search
6. **item.html** — detail page, fix config only
7. **missing-item.html** — detail + message modal, fix config only
8. **report.html** — student sidebar, fix active state + config
9. **report-missing.html** — same as report
10. **claim.html** — student sidebar, fix active state + config
11. **my-submissions.html** — student sidebar, fix active state + config (most complex)
12. **admin.html** — DARK sidebar (biggest structural change from current)

---

## What Changed vs Current Implementation

| Issue | Current | Should Be |
|-------|---------|-----------|
| Tailwind config | Missing spacing, fontSize, fontFamily tokens | Full config above |
| Active sidebar state | `bg-primary-container/20 text-primary` | `bg-primary-container text-on-primary-container translate-x-1` |
| Admin sidebar bg | `bg-surface-container-low` (light) | `bg-inverse-surface` (dark, matches navbar) |
| Admin sidebar text | dark text | `text-white` inactive, `text-on-primary-container` active |
| Icon filled variant | `class="filled"` on new HTML | Use `icon-fill` CSS class for new HTML |
| admin.html sidebar | Light sidebar identical to student | Dark sidebar like GLHS Portal |

---

## Files NOT to change

- `server/` — all backend code
- `data/` — JSON data files
- `public/js/api.js` — fetch wrapper
- `public/js/nav.js` — auth state, shared helpers (categoryEmoji, formatDate, statusBadge, showToast, currentUser, logout)
- `public/css/style.css` — CAN be modified; update styles freely, just keep existing class names
- `public/images/school.jpg` — the school photo used everywhere
- `tests/` — unit tests

---

## Verification Checklist

After implementing each page, verify:
- [ ] Server running at http://localhost:3000 (`npm run dev`)
- [ ] Login with admin@school.edu / admin123 works
- [ ] Login with student@school.edu / student123 works
- [ ] index.html: hero, stats, how-it-works all render; report buttons show after login
- [ ] search.html: items load, filter works, cards link to item.html
- [ ] search-missing.html: items load, filter works, cards link to missing-item.html
- [ ] item.html: item loads, claim button appears for logged-in users
- [ ] missing-item.html: item loads, message modal works, send sends to API
- [ ] report.html: form shows after login, photo preview works, submit → /items
- [ ] report-missing.html: same but → /missing-items
- [ ] claim.html: pre-fills name/email, submit → /claims
- [ ] my-submissions.html: all 5 tabs load, matches show, messages send/reply/delete
- [ ] admin.html: stats load, all 3 tabs load, approve/reject/delete all work
- [ ] Mobile: sidebar hidden on mobile, top bar visible, layout not broken

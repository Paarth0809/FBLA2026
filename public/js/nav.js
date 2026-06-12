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

  slots.forEach((el) => {
    const mode = el.dataset.navAuth ||
      (el.id === 'nav-auth-mobile' ? 'compact' : (el.classList.contains('w-full') ? 'sidebar' : 'default'));
    el.innerHTML = currentUser ? renderLoggedInNav(mode) : renderLoggedOutNav(mode);

    // Inject language switcher sibling next to nav-auth (exclude mobile compact icon slot)
    if (el.id === 'nav-auth' || el.hasAttribute('data-nav-auth')) {
      injectLanguageSwitcher(el, mode);
    }
  });

  // Fallback for sidebars that don't have dynamic auth slots (e.g. claim.html)
  const sidebar = document.querySelector('.student-sidebar, aside');
  if (sidebar && !document.getElementById('nav-lang-container-sidebar')) {
    const logoutBtn = sidebar.querySelector('button[onclick="logout()"], a[href*="logout"]');
    if (logoutBtn) {
      const langContainer = document.createElement('div');
      langContainer.id = 'nav-lang-container-sidebar';
      langContainer.className = 'relative w-full mb-3 mt-auto';
      langContainer.setAttribute('data-i18n-skip', 'true');
      logoutBtn.parentNode.insertBefore(langContainer, logoutBtn);
      renderLanguageDropdownInside(langContainer, getCurrentLanguage());
    }
  }

  // Clean up floating switcher if a navbar or sidebar is rendered
  if (document.querySelector('#nav-auth, #nav-auth-mobile, [data-nav-auth], .student-sidebar, aside')) {
    const floatingContainer = document.getElementById('lang-switcher-floating-container');
    if (floatingContainer) {
      floatingContainer.remove();
    }
  }
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
function requireAuth() {
  if (!currentUser) {
    const redirect = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = '/login.html?redirect=' + redirect;
    return false;
  }
  return true;
}

// requireAdmin — redirects to the homepage if the user is not an admin.
function requireAdmin() {
  if (!currentUser || currentUser.role !== 'admin') {
    window.location.href = '/';
    return false;
  }
  return true;
}

// ── Toast notifications ───────────────────────────────────────────────────────
function showToast(message, type = 'info') {
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
  setTimeout(() => {
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 180);
  }, 4000);
}

// initMotion — lightweight, fail-open interaction motion.
function initMotion() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  document.documentElement.classList.add('motion-ready');

  const updateScrollState = () => {
    document.body.classList.toggle('nav-scrolled', window.scrollY > 6);
  };
  updateScrollState();
  window.addEventListener('scroll', updateScrollState, { passive: true });

  const revealItems = Array.from(document.querySelectorAll('.reveal'));
  if ('IntersectionObserver' in window && revealItems.length) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
    revealItems.forEach((el) => observer.observe(el));
  } else {
    revealItems.forEach((el) => el.classList.add('visible'));
  }

  document.querySelectorAll('img.img-load, img.img-load-fade').forEach((img) => {
    if (img.complete) {
      img.classList.add('loaded');
    } else {
      img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
    }
  });

  document.addEventListener('pointerdown', (event) => {
    const button = event.target.closest?.('.btn');
    if (!(button instanceof HTMLElement) || button.hasAttribute('disabled')) return;
    button.classList.remove('is-pressing');
    void button.offsetWidth;
    button.classList.add('is-pressing');
  });

  document.addEventListener('animationend', (event) => {
    if (event.animationName === 'buttonPress' && event.target instanceof HTMLElement) {
      event.target.classList.remove('is-pressing');
    }
  });

  document.querySelectorAll('.upload-zone').forEach((zone) => {
    const input = zone.querySelector('input[type="file"]');
    ['dragenter', 'dragover'].forEach((eventName) => {
      zone.addEventListener(eventName, (event) => {
        event.preventDefault();
        zone.classList.add('drag-over');
      });
    });
    ['dragleave', 'drop'].forEach((eventName) => {
      zone.addEventListener(eventName, (event) => {
        event.preventDefault();
        zone.classList.remove('drag-over');
      });
    });
    zone.addEventListener('drop', (event) => {
      if (!input || !event.dataTransfer?.files?.length) return;
      try {
        input.files = event.dataTransfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } catch {
        showToast('Use click to upload if dragging is blocked by your browser.', 'info');
      }
    });
  });

  document.addEventListener('invalid', (event) => {
    const field = event.target;
    if (!(field instanceof HTMLElement)) return;
    field.classList.add('input-error', 'shake');
    setTimeout(() => field.classList.remove('shake'), 320);
  }, true);

  document.addEventListener('input', (event) => {
    const field = event.target;
    if (!(field instanceof HTMLElement)) return;
    field.classList.remove('input-error');
    if (field.matches('input, textarea, select') && field.hasAttribute('required')) {
      field.classList.toggle('input-valid', field.checkValidity() && Boolean(field.value));
    }
  });

  document.addEventListener('blur', (event) => {
    const field = event.target;
    if (!(field instanceof HTMLElement) || !field.matches('input, textarea, select')) return;
    if (!field.hasAttribute('required')) return;
    field.classList.toggle('input-valid', field.checkValidity() && Boolean(field.value));
  }, true);

  const showImageFallback = (img) => {
    if (!(img instanceof HTMLImageElement) || img.dataset.fallbackShown === 'true') return;
    img.dataset.fallbackShown = 'true';
    const fallback = document.createElement('span');
    fallback.className = 'uploaded-image-fallback';
    fallback.setAttribute('role', 'img');
    fallback.setAttribute('aria-label', 'Photo format is not supported for preview');
    fallback.innerHTML = '<span class="material-symbols-outlined">image_not_supported</span>';
    img.replaceWith(fallback);
  };

  const markDynamicImages = (root = document) => {
    root.querySelectorAll?.('.item-card-img img:not(.img-load), .detail-img img:not(.img-load), .match-thumb:not(.img-load), img[src^="/uploads/"]:not(.img-load)').forEach((img) => {
      img.classList.add('img-load');
      if (img.complete) {
        if (img.naturalWidth === 0) showImageFallback(img);
        else img.classList.add('loaded');
      } else {
        img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
        img.addEventListener('error', () => showImageFallback(img), { once: true });
      }
    });
  };
  markDynamicImages();

  if ('MutationObserver' in window) {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) markDynamicImages(node);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

// ── Utility helpers ───────────────────────────────────────────────────────────
function formatDate(str) {
  if (!str) return '—';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

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

// ── Language Switcher and Translation Engine ───────────────────────────────

const languageNames = {
  en: { en: 'English', es: 'Spanish', ar: 'Arabic', zh: 'Chinese', vi: 'Vietnamese', fr: 'French', ko: 'Korean', hi: 'Hindi', ur: 'Urdu', te: 'Telugu', ru: 'Russian', ne: 'Nepali', gu: 'Gujarati', ja: 'Japanese', ta: 'Tamil', de: 'German', tl: 'Tagalog/Filipino', select: 'Select Language' },
  es: { en: 'Inglés', es: 'Español', ar: 'Árabe', zh: 'Chino', vi: 'Vietnamita', fr: 'Francés', ko: 'Coreano', hi: 'Hindi', ur: 'Urdu', te: 'Telugu', ru: 'Ruso', ne: 'Nepalí', gu: 'Gujarati', ja: 'Japonés', ta: 'Tamil', de: 'Alemán', tl: 'Tagalo/Filipino', select: 'Seleccionar idioma' },
  ar: { en: 'الإنجليزية', es: 'الإسبانية', ar: 'العربية', zh: 'الصينية', vi: 'الفيتنامية', fr: 'الفرنسية', ko: 'الكورية', hi: 'الهندية', ur: 'الأردية', te: 'التيلوغو', ru: 'الروسية', ne: 'النيبالية', gu: 'الغيوجاراتية', ja: 'اليابانية', ta: 'التاميلية', de: 'الألمانية', tl: 'التاغالوغية', select: 'اختر اللغة' },
  zh: { en: '英语', es: '西班牙语', ar: '阿拉伯语', zh: '中文', vi: '越南语', fr: '法语', ko: '韩语', hi: '印地语', ur: '乌尔都语', te: '泰卢固语', ru: '俄语', ne: '尼泊尔语', gu: '古吉拉特语', ja: '日语', ta: '泰米尔语', de: '德语', tl: '他加禄语/菲律宾语', select: '选择语言' },
  vi: { en: 'Tiếng Anh', es: 'Tiếng Tây Ban Nha', ar: 'Tiếng Ả Rập', zh: 'Tiếng Trung', vi: 'Tiếng Việt', fr: 'Tiếng Pháp', ko: 'Tiếng Hàn', hi: 'Tiếng Hindi', ur: 'Tiếng Urdu', te: 'Tiếng Telugu', ru: 'Tiếng Nga', ne: 'Tiếng Nepal', gu: 'Tiếng Gujarati', ja: 'Tiếng Nhật', ta: 'Tiếng Tamil', de: 'Tiếng Đức', tl: 'Tiếng Tagalog', select: 'Chọn ngôn ngữ' },
  fr: { en: 'Anglais', es: 'Espagnol', ar: 'Arabe', zh: 'Chinois', vi: 'Vietnamien', fr: 'Français', ko: 'Coréen', hi: 'Hindi', ur: 'Ourdou', te: 'Télougou', ru: 'Russe', ne: 'Népalais', gu: 'Gujarati', ja: 'Japonais', ta: 'Tamoul', de: 'Allemand', tl: 'Tagalog/Filipino', select: 'Choisir la langue' },
  ko: { en: '영어', es: '스페인어', ar: '아랍어', zh: '중국어', vi: '베트남어', fr: '프랑스어', ko: '한국어', hi: '힌디어', ur: '우르두어', te: '텔루구어', ru: '러시아어', ne: '네팔어', gu: '구자라트어', ja: '일본어', ta: '타밀어', de: '독일어', tl: '타갈로그어/필리핀어', select: '언어 선택' },
  hi: { en: 'अंग्रेज़ी', es: 'स्पैनिश', ar: 'अरबी', zh: 'चीनी', vi: 'वियतनामी', fr: 'फ़्रांसीसी', ko: 'कोरियाई', hi: 'हिन्दी', ur: 'उर्दू', te: 'तेलुगु', ru: 'रूसी', ne: 'नेपाली', gu: 'गुजराती', ja: 'जापानी', ta: 'तमिल', de: 'जर्मन', tl: 'तागालोग/फिलिपिनो', select: 'भाषा चुनें' },
  ur: { en: 'انگریزی', es: 'ہسپانوی', ar: 'عربی', zh: 'چینی', vi: 'ویتنامی', fr: 'فرانسیسی', ko: 'کوریائی', hi: 'ہندی', ur: 'اردو', te: 'تیلگو', ru: 'روسی', ne: 'نیپالی', gu: 'گجراتی', ja: 'جاپانی', ta: 'تمل', de: 'جرمن', tl: 'ٹیگالوگ/فلپائنی', select: 'زبان منتخب کریں' },
  te: { en: 'ఆంగ్లం', es: 'స్పానిష్', ar: 'అరబిక్', zh: 'చైనీస్', vi: 'వియత్నామీస్', fr: 'ఫ్రెంచ్', ko: 'కొరియన్', hi: 'హీందీ', ur: 'ఉర్దూ', te: 'తెలుగు', ru: 'రష్యన్', ne: 'నేపాలీ', gu: 'గుజరాతీ', ja: 'జపనీస్', ta: 'తమిళం', de: 'జర్మన్', tl: 'తగలోగ్/ఫిలిపినో', select: 'భాஷను ఎంచుకోండి' },
  ru: { en: 'Английский', es: 'Испанский', ar: 'Арабский', zh: 'Китайский', vi: 'Вьетнамский', fr: 'Французский', ko: 'Корейский', hi: 'Хинди', ur: 'Урду', te: 'Телугу', ru: 'Русский', ne: 'Непальский', gu: 'Гуджарати', ja: 'Японский', ta: 'Тамильский', de: 'Немецкий', tl: 'Тагальский', select: 'Выбрать язык' },
  ne: { en: 'अंग्रेजी', es: 'स्पेनिस', ar: 'अरबी', zh: 'चिनियाँ', vi: 'भियतनामी', fr: 'फ्रान्सेली', ko: 'कोरियाली', hi: 'हिन्दी', ur: 'उर्दू', te: 'तेलुगु', ru: 'रूसी', ne: 'नेपाली', gu: 'गुजराती', ja: 'जापानी', ta: 'तमिल', de: 'जर्मन', tl: 'तागालोग/फिलिपिनो', select: 'भाषा चयन गर्नुहोस्' },
  gu: { en: 'અંગ્રેજી', es: 'સ્પેનિશ', ar: 'અરબી', zh: 'ચાઇનીઝ', vi: 'વિયેતનામીસ', fr: 'ફ્રેન્ચ', ko: 'કોરિયન', hi: 'હિન્દી', ur: 'ઉર્દૂ', te: 'તેલુగు', ru: 'રશિયન', ne: 'નેપાળી', gu: 'ગુજરાતી', ja: 'જપાનીઝ', ta: 'તમિલ', de: 'જર્મન', tl: 'ટેગાલોગ/ફિલિપિનો', select: 'ભાષા પસંદ કરો' },
  ja: { en: '英語', es: 'スペイン語', ar: 'アラビア語', zh: '中国語', vi: 'ベトナム語', fr: 'フランス語', ko: '韓国語', hi: 'ヒンディー語', ur: 'ウルドゥー語', te: 'テルグ語', ru: 'ロシア語', ne: 'ネパール語', gu: 'グジャラート語', ja: '日本語', ta: 'タミル語', de: 'ドイツ語', tl: 'タガログ語/フィリピノ語', select: '言語を選択' },
  ta: { en: 'ஆங்கிலம்', es: 'ஸ்பானிஷ்', ar: 'அரபிக்', zh: 'சீனம்', vi: 'வியட்நாமிய மொழி', fr: 'பிரெஞ்சு', ko: 'கொரியன்', hi: 'இந்தி', ur: 'உருது', te: 'தெலுங்கு', ru: 'ரஷ்யன்', ne: 'நேபாளி', gu: 'குஜராத்தி', ja: 'ஜப்பானிய மொழி', ta: 'தமிழ்', de: 'ஜெர்மன்', tl: 'தகலாக்', select: 'மொழியைத் தேர்வுசெய்' },
  de: { en: 'Englisch', es: 'Spanisch', ar: 'Arabisch', zh: 'Chinesisch', vi: 'Vietnamesisch', fr: 'Französisch', ko: 'Koreanisch', hi: 'Hindi', ur: 'Urdu', te: 'Telugu', ru: 'Russisch', ne: 'Nepalesisch', gu: 'Gujarati', ja: 'Japanisch', ta: 'Tamilisch', de: 'Deutsch', tl: 'Tagalog/Filipino', select: 'Sprache wählen' },
  tl: { en: 'Ingles', es: 'Kastila', ar: 'Arabe', zh: 'Tsino', vi: 'Vietnamese', fr: 'Pranses', ko: 'Koreano', hi: 'Hindi', ur: 'Urdu', te: 'Telugu', ru: 'Ruso', ne: 'Nepali', gu: 'Gujarati', ja: 'Hapon', ta: 'Tamil', de: 'Aleman', tl: 'Tagalog/Filipino', select: 'Pumili ng Wika' }
};

let translatableElements = [];
let translatableNodes = [];
let isTranslating = false;

function getCurrentLanguage() {
  return localStorage.getItem('preferred-language') || 'en';
}

function injectLanguageSwitcherCSS() {
  if (document.getElementById('lang-switcher-styles')) return;
  const style = document.createElement('style');
  style.id = 'lang-switcher-styles';
  style.textContent = `
    .lang-switcher-dropdown {
      position: relative;
      display: inline-block;
      font-family: 'Plus Jakarta Sans', 'Inter', sans-serif;
    }
    .lang-switcher-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: rgba(255, 255, 255, 0.9);
      padding: 6px 12px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .lang-switcher-btn:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: var(--primary-container, #10b981);
      color: #ffffff;
      box-shadow: 0 0 12px rgba(16, 185, 129, 0.2);
    }
    .lang-switcher-btn .material-symbols-outlined {
      font-size: 16px;
      color: var(--primary-container, #10b981);
      line-height: 1;
      display: inline-flex;
      align-items: center;
    }
    .lang-switcher-btn .lang-arrow {
      font-size: 16px;
      color: rgba(255, 255, 255, 0.5);
      transition: transform 0.25s ease;
    }
    .lang-switcher-dropdown.is-open .lang-arrow {
      transform: rotate(180deg);
    }
    .lang-switcher-menu {
      position: absolute;
      right: 0;
      top: calc(100% + 8px);
      width: 190px;
      max-height: 280px;
      overflow-y: auto;
      background: linear-gradient(135deg, #04140e 0%, #0b2216 100%);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 14px;
      padding: 6px 4px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
      z-index: 1000;
      opacity: 0;
      transform: translateY(-8px) scale(0.96);
      pointer-events: none;
      transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      scrollbar-width: thin;
      scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
      backdrop-filter: blur(20px);
    }
    .lang-switcher-menu::-webkit-scrollbar {
      width: 4px;
    }
    .lang-switcher-menu::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.15);
      border-radius: 10px;
    }
    .lang-switcher-dropdown.is-open .lang-switcher-menu {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }
    .lang-switcher-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      padding: 8px 12px;
      background: transparent;
      border: none;
      color: rgba(255, 255, 255, 0.8);
      font-size: 13px;
      font-weight: 500;
      text-align: left;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .lang-switcher-item:hover {
      background: rgba(16, 185, 129, 0.12);
      color: #ffffff;
    }
    .lang-switcher-item.is-selected {
      background: var(--primary, #006c49);
      color: #ffffff;
      font-weight: 600;
    }
    .lang-switcher-item .check-icon {
      font-size: 14px;
      color: var(--primary-container, #10b981) !important;
      line-height: 1;
      display: inline-flex;
      align-items: center;
    }

    /* Sidebar mode overrides */
    .w-full > .lang-switcher-dropdown {
      width: 100%;
    }
    .w-full > .lang-switcher-dropdown .lang-switcher-btn {
      width: 100%;
      justify-content: space-between;
      background: var(--surface-container-high, #e3eae3);
      border: 1px solid var(--outline-variant, #bbcabf);
      color: var(--on-surface, #161d19);
    }
    .w-full > .lang-switcher-dropdown .lang-switcher-btn:hover {
      background: var(--surface-container-highest, #dde4dd);
      border-color: var(--primary, #006c49);
      box-shadow: none;
    }
    .w-full > .lang-switcher-dropdown .lang-switcher-btn .lang-arrow {
      color: var(--on-surface-variant, #3c4a42);
    }
    .w-full > .lang-switcher-dropdown .lang-switcher-menu {
      width: 100%;
      right: 0;
      left: 0;
      background: var(--surface-container-lowest, #ffffff);
      border: 1px solid var(--outline-variant, #bbcabf);
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
      backdrop-filter: none;
    }
    .w-full > .lang-switcher-dropdown .lang-switcher-item {
      color: var(--on-surface, #161d19);
    }
    .w-full > .lang-switcher-dropdown .lang-switcher-item:hover {
      background: rgba(0, 108, 73, 0.08);
      color: var(--primary, #006c49);
    }
    .w-full > .lang-switcher-dropdown .lang-switcher-item.is-selected {
      background: var(--primary, #006c49);
      color: #ffffff;
    }
    .lang-switcher-floating {
      position: fixed;
      top: 12px;
      right: 12px;
      z-index: 9999;
    }
  `;
  document.head.appendChild(style);
}

function injectLanguageSwitcher(navAuthEl, mode) {
  let langContainer = document.getElementById('nav-lang-container-' + mode);
  if (!langContainer) {
    langContainer = document.createElement('div');
    langContainer.id = 'nav-lang-container-' + mode;
    langContainer.setAttribute('data-i18n-skip', 'true');
    
    if (mode === 'sidebar') {
      langContainer.className = 'relative w-full mb-3';
      navAuthEl.parentNode.insertBefore(langContainer, navAuthEl);
    } else {
      langContainer.className = 'relative flex items-center mr-2';
      navAuthEl.parentNode.insertBefore(langContainer, navAuthEl);
    }
  }

  const activeLang = getCurrentLanguage();
  renderLanguageDropdownInside(langContainer, activeLang);
}

function renderLanguageDropdownInside(container, activeLang) {
  const currentLangName = languageNames[activeLang][activeLang] || languageNames['en'][activeLang];
  
  container.innerHTML = `
    <div class="lang-switcher-dropdown">
      <button class="lang-switcher-btn" type="button" aria-expanded="false" aria-haspopup="listbox" onclick="toggleLangDropdown(event)">
        <span class="material-symbols-outlined">language</span>
        <span class="lang-switcher-current-label">${currentLangName}</span>
        <span class="material-symbols-outlined lang-arrow">expand_more</span>
      </button>
      <div class="lang-switcher-menu" role="listbox">
        ${Object.keys(languageNames['en']).filter(k => k !== 'select').map(langCode => {
          const isSelected = langCode === activeLang;
          const displayName = languageNames[activeLang][langCode] || languageNames['en'][langCode];
          return `
            <button class="lang-switcher-item ${isSelected ? 'is-selected' : ''}" 
                    role="option" 
                    aria-selected="${isSelected}" 
                    onclick="changeLanguage('${langCode}')" 
                    type="button">
              <span>${displayName}</span>
              ${isSelected ? '<span class="material-symbols-outlined check-icon">check</span>' : ''}
            </button>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderLanguageDropdown(activeLang) {
  const containers = document.querySelectorAll('[id^="nav-lang-container-"]');
  containers.forEach(container => renderLanguageDropdownInside(container, activeLang));
  
  const floatingContainer = document.getElementById('lang-switcher-floating-container');
  if (floatingContainer) {
    renderLanguageDropdownInside(floatingContainer, activeLang);
  }
}

function ensureFloatingSwitcher(activeLang) {
  const hasNavbar = document.querySelector('#nav-auth, #nav-auth-mobile, [data-nav-auth]');
  const hasSidebar = document.querySelector('.student-sidebar, aside');
  
  if (hasNavbar || hasSidebar) {
    const existing = document.getElementById('lang-switcher-floating-container');
    if (existing) existing.remove();
    return;
  }

  let container = document.getElementById('lang-switcher-floating-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'lang-switcher-floating-container';
    container.className = 'lang-switcher-floating';
    container.setAttribute('data-i18n-skip', 'true');
    document.body.appendChild(container);
  }

  renderLanguageDropdownInside(container, activeLang);
}

function toggleLangDropdown(event) {
  event.stopPropagation();
  const dropdown = event.currentTarget.closest('.lang-switcher-dropdown');
  const isOpen = dropdown.classList.contains('is-open');
  
  document.querySelectorAll('.lang-switcher-dropdown').forEach(d => d.classList.remove('is-open'));
  
  if (!isOpen) {
    dropdown.classList.add('is-open');
  }
}

function changeLanguage(langCode) {
  localStorage.setItem('preferred-language', langCode);
  applyTranslations(langCode);
  ensureFloatingSwitcher(langCode);
}

// Close language dropdown when clicking outside
document.addEventListener('click', () => {
  document.querySelectorAll('.lang-switcher-dropdown').forEach(d => d.classList.remove('is-open'));
});

// Translation registry and updates
function isSimpleTextContainer(element) {
  if (element.childNodes.length === 0) return false;
  for (let i = 0; i < element.childNodes.length; i++) {
    const child = element.childNodes[i];
    if (child.nodeType !== 3 && (child.nodeType !== 1 || child.tagName.toUpperCase() !== 'BR')) {
      return false;
    }
  }
  return true;
}

function initDomTranslationRegistry() {
  translatableElements = [];
  translatableNodes = [];
  
  function walk(node) {
    if (node.nodeType === 1) { // Element Node
      const tagName = node.tagName.toUpperCase();
      if (tagName === 'SCRIPT' || tagName === 'STYLE' || tagName === 'NOSCRIPT' || tagName === 'CANVAS' || tagName === 'SVG') {
        return;
      }
      if (node.classList.contains('material-symbols-outlined') || node.hasAttribute('data-i18n-skip') || node.closest('[data-i18n-skip]')) {
        return;
      }
      
      // Track input placeholders
      if (node.hasAttribute('placeholder')) {
        if (!node._originalPlaceholder) {
          node._originalPlaceholder = node.getAttribute('placeholder');
        }
        translatableElements.push(node);
      }
      
      // Check simple container
      if (isSimpleTextContainer(node)) {
        const text = node.innerHTML.trim();
        if (text && text.length > 0) {
          if (!node._originalHTML) {
            node._originalHTML = node.innerHTML;
          }
          translatableElements.push(node);
        }
        return;
      }
      
      // Recurse children
      for (let i = 0; i < node.childNodes.length; i++) {
        walk(node.childNodes[i]);
      }
    } else if (node.nodeType === 3) { // Text Node
      const text = node.textContent.trim();
      if (text && text.length > 0) {
        if (!node._originalText) {
          node._originalText = node.textContent;
        }
        translatableNodes.push(node);
      }
    }
  }
  
  walk(document.body);
}

function lookupTranslation(translations, key) {
  if (translations[key]) return translations[key];
  const normalizedKey = key.trim().replace(/\s+/g, ' ');
  if (translations[normalizedKey]) return translations[normalizedKey];
  return null;
}

function translateRegistry(lang) {
  const translations = window.APP_TRANSLATIONS ? window.APP_TRANSLATIONS[lang] : null;
  if (!translations) {
    // Reset to English
    translatableElements.forEach(el => {
      if (el._originalHTML) el.innerHTML = el._originalHTML;
      if (el._originalPlaceholder) el.setAttribute('placeholder', el._originalPlaceholder);
    });
    translatableNodes.forEach(node => {
      if (node._originalText) node.textContent = node._originalText;
    });
    return;
  }
  
  translatableElements.forEach(el => {
    if (el._originalHTML) {
      const key = el._originalHTML.trim().replace(/\s+/g, ' ');
      const translated = lookupTranslation(translations, key);
      if (translated) {
        el.innerHTML = translated;
      } else {
        el.innerHTML = el._originalHTML;
      }
    }
    if (el._originalPlaceholder) {
      const key = el._originalPlaceholder.trim();
      const translated = lookupTranslation(translations, key);
      if (translated) {
        el.setAttribute('placeholder', translated);
      } else {
        el.setAttribute('placeholder', el._originalPlaceholder);
      }
    }
  });
  
  translatableNodes.forEach(node => {
    if (node._originalText) {
      const key = node._originalText.trim().replace(/\s+/g, ' ');
      const translated = lookupTranslation(translations, key);
      if (translated) {
        const startSpace = node._originalText.match(/^\s*/)[0];
        const endSpace = node._originalText.match(/\s*$/)[0];
        node.textContent = startSpace + translated + endSpace;
      } else {
        node.textContent = node._originalText;
      }
    }
  });
}

let translationObserver = null;

function applyTranslations(lang) {
  if (translationObserver) {
    translationObserver.disconnect();
  }
  
  initDomTranslationRegistry();
  translateRegistry(lang);
  renderLanguageDropdown(lang);
  
  if (translationObserver) {
    translationObserver.observe(document.body, { childList: true, subtree: true });
  }
  
  // Custom event for page scripts to know language changed
  document.dispatchEvent(new CustomEvent('languageChanged', { detail: lang }));
}

function watchTranslations(lang) {
  if ('MutationObserver' in window) {
    translationObserver = new MutationObserver((mutations) => {
      let needsTranslate = false;
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1 || node.nodeType === 3) {
            // Skip checking our own language switcher container modifications
            if (node instanceof HTMLElement && (node.closest('[data-i18n-skip]') || node.hasAttribute('data-i18n-skip'))) {
              return;
            }
            needsTranslate = true;
          }
        });
      });
      
      if (needsTranslate) {
        translationObserver.disconnect();
        initDomTranslationRegistry();
        translateRegistry(lang);
        translationObserver.observe(document.body, { childList: true, subtree: true });
      }
    });
    
    translationObserver.observe(document.body, { childList: true, subtree: true });
  }
}

// Expose language switcher API globally
window.changeLanguage = changeLanguage;
window.toggleLangDropdown = toggleLangDropdown;
window.applyTranslations = applyTranslations;
window.getCurrentLanguage = getCurrentLanguage;

// Dynamically load translations.js and bootstrap i18n
function bootstrapTranslations() {
  injectLanguageSwitcherCSS();
  const activeLang = getCurrentLanguage();
  watchTranslations(activeLang);

  if (!window.APP_TRANSLATIONS) {
    const script = document.createElement('script');
    script.src = '/js/translations.js?v=1.0.2';
    script.async = false;
    script.onload = () => {
      applyTranslations(activeLang);
      ensureFloatingSwitcher(activeLang);
    };
    document.head.appendChild(script);
  } else {
    applyTranslations(activeLang);
    ensureFloatingSwitcher(activeLang);
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
initMotion();
loadUser();
bootstrapTranslations();

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
  en: {
    en: 'English',
    es: 'Spanish',
    zh: 'Chinese',
    fr: 'French',
    de: 'German',
    vi: 'Vietnamese',
    ar: 'Arabic',
    ko: 'Korean',
    hi: 'Hindi',
    gu: 'Gujarati',
    tl: 'Tagalog/Filipino',
    ru: 'Russian',
    ja: 'Japanese',
    te: 'Telugu',
    ta: 'Tamil',
    ur: 'Urdu',
    ne: 'Nepali',
    mr: 'Marathi',
    select: 'Select Language'
  },
  es: {
    en: 'Inglés',
    es: 'Español',
    zh: 'Chino',
    fr: 'Francés',
    de: 'Alemán',
    vi: 'Vietnamita',
    ar: 'Árabe',
    ko: 'Coreano',
    hi: 'Hindi',
    gu: 'Gujarati',
    tl: 'Tagalo/Filipino',
    ru: 'Ruso',
    ja: 'Japonés',
    te: 'Telugu',
    ta: 'Tamil',
    ur: 'Urdu',
    ne: 'Nepalí',
    mr: 'Maratí',
    select: 'Seleccionar idioma'
  },
  zh: {
    en: '英语',
    es: '西班牙语',
    zh: '中文',
    fr: '法语',
    de: '德语',
    vi: '越南语',
    ar: '阿拉伯语',
    ko: '韩语',
    hi: '印地语',
    gu: '古吉拉特语',
    tl: '他加禄语/菲律宾语',
    ru: '俄语',
    ja: '日语',
    te: '泰卢固语',
    ta: '泰米尔语',
    ur: '乌尔都语',
    ne: '尼泊尔语',
    mr: '马拉地语',
    select: '选择语言'
  },
  fr: {
    en: 'Anglais',
    es: 'Espagnol',
    zh: 'Chinois',
    fr: 'Français',
    de: 'Allemand',
    vi: 'Vietnamien',
    ar: 'Arabe',
    ko: 'Coréen',
    hi: 'Hindi',
    gu: 'Gujarati',
    tl: 'Tagalog/Filipino',
    ru: 'Russe',
    ja: 'Japonais',
    te: 'Télougou',
    ta: 'Tamoul',
    ur: 'Ourdou',
    ne: 'Népalais',
    mr: 'Marathi',
    select: 'Choisir la langue'
  },
  de: {
    en: 'Englisch',
    es: 'Spanisch',
    zh: 'Chinesisch',
    fr: 'Französisch',
    de: 'Deutsch',
    vi: 'Vietnamesisch',
    ar: 'Arabisch',
    ko: 'Koreanisch',
    hi: 'Hindi',
    gu: 'Gujarati',
    tl: 'Tagalog/Filipino',
    ru: 'Russisch',
    ja: 'Japanisch',
    te: 'Telugu',
    ta: 'Tamilisch',
    ur: 'Urdu',
    ne: 'Nepalesisch',
    mr: 'Marathi',
    select: 'Sprache wählen'
  },
  vi: {
    en: 'Tiếng Anh',
    es: 'Tiếng Tây Ban Nha',
    zh: 'Tiếng Trung',
    fr: 'Tiếng Pháp',
    de: 'Tiếng Đức',
    vi: 'Tiếng Việt',
    ar: 'Tiếng Ả Rập',
    ko: 'Tiếng Hàn',
    hi: 'Tiếng Hindi',
    gu: 'Tiếng Gujarati',
    tl: 'Tiếng Tagalog',
    ru: 'Tiếng Nga',
    ja: 'Tiếng Nhật',
    te: 'Tiếng Telugu',
    ta: 'Tiếng Tamil',
    ur: 'Tiếng Urdu',
    ne: 'Tiếng Nepal',
    mr: 'Tiếng Marathi',
    select: 'Chọn ngôn ngữ'
  },
  ar: {
    en: 'الإنجليزية',
    es: 'الإسبانية',
    zh: 'الصينية',
    fr: 'الفرنسية',
    de: 'الألمانية',
    vi: 'الفيتنامية',
    ar: 'العربية',
    ko: 'الكورية',
    hi: 'الهندية',
    gu: 'الغيوجاراتية',
    tl: 'التاغالوغية',
    ru: 'الروسية',
    ja: 'اليابانية',
    te: 'التيلوغو',
    ta: 'التاميلية',
    ur: 'الأردية',
    ne: 'النيبالية',
    mr: 'المाराثية',
    select: 'اختر اللغة'
  },
  ko: {
    en: '영어',
    es: '스페인어',
    zh: '중국어',
    fr: '프랑스어',
    de: '독일어',
    vi: '베트남어',
    ar: '아랍어',
    ko: '한국어',
    hi: '힌디어',
    gu: '구자라트어',
    tl: '타갈로그어/필리핀어',
    ru: '러シア어',
    ja: '일본어',
    te: '텔루구어',
    ta: '타밀어',
    ur: '우르두어',
    ne: '네팔어',
    mr: '마라티어',
    select: '언어 선택'
  },
  hi: {
    en: 'अंग्रेज़ी',
    es: 'स्पैनिश',
    zh: 'चीनी',
    fr: 'फ़्रांसीसी',
    de: 'जर्मन',
    vi: 'वियतनामी',
    ar: 'अरबी',
    ko: 'कोरियाई',
    hi: 'हिन्दी',
    gu: 'गुजराती',
    tl: 'तागालोग/फिलिपिनो',
    ru: 'रूसी',
    ja: 'जापानी',
    te: 'तेलुगु',
    ta: 'तमिल',
    ur: 'उर्दू',
    ne: 'नेपाली',
    mr: 'मराठी',
    select: 'भाषा चुनें'
  },
  gu: {
    en: 'અંગ્રેજી',
    es: 'સ્પેનિશ',
    zh: 'ચાઇનીઝ',
    fr: 'ફ્રેન્ચ',
    de: 'જર્મન',
    vi: 'વિયેતનામીસ',
    ar: 'અરબી',
    ko: 'કોરિયન',
    hi: 'હિન્દી',
    gu: 'ગુજરાતી',
    tl: 'ટેગાલોગ/ફિલિપિનો',
    ru: 'રશિયન',
    ne: 'નેપાળી',
    mr: 'મરાઠી',
    select: 'ભાષા પસંદ કરો'
  },
  tl: {
    en: 'Ingles',
    es: 'Kastila',
    zh: 'Tsino',
    fr: 'Pranses',
    de: 'Aleman',
    vi: 'Vietnamese',
    ar: 'Arabe',
    ko: 'Koreano',
    hi: 'Hindi',
    gu: 'Gujarati',
    tl: 'Tagalog/Filipino',
    ru: 'Ruso',
    ja: 'Hapon',
    te: 'Telugu',
    ta: 'Tamil',
    ur: 'Urdu',
    ne: 'Nepali',
    mr: 'Marathi',
    select: 'Pumili ng Wika'
  },
  ru: {
    en: 'Английский',
    es: 'Испанский',
    zh: 'Китайский',
    fr: 'Французский',
    de: 'Немецкий',
    vi: 'Вьетнамский',
    ar: 'Арабский',
    ko: 'Корейский',
    hi: 'Хинди',
    gu: 'Гуджарати',
    tl: 'Тагальский',
    ru: 'Русский',
    ja: 'Японский',
    te: 'Телугу',
    ta: 'Тамильский',
    ur: 'Урду',
    ne: 'Непальский',
    mr: 'Маратхи',
    select: 'Выбрать язык'
  },
  ja: {
    en: '英語',
    es: 'スペイン語',
    zh: '中国語',
    fr: 'フランス語',
    de: 'ドイツ語',
    vi: 'ベトナム語',
    ar: 'アラビア語',
    ko: '韓国語',
    hi: 'ヒンディー語',
    gu: 'グジャラート語',
    tl: 'タガログ語/フィリピノ語',
    ru: 'ロシア語',
    ja: '日本語',
    te: 'テルグ語',
    ta: 'タミル語',
    ur: 'ウルドゥー語',
    ne: 'ネパール語',
    mr: 'マラーティー語',
    select: '言語を選択'
  },
  te: {
    en: 'ఆంగ్లం',
    es: 'స్పానిష్',
    zh: 'చైనీస్',
    fr: 'ఫ్రెంచ్',
    de: 'जर्मन',
    vi: 'వియత్నామీస్',
    ar: 'అరబిక్',
    ko: 'కొరియన్',
    hi: 'హీందీ',
    gu: 'గుజరాతీ',
    tl: 'తగలోగ్/ఫిలిపినో',
    ru: 'రష్యัน',
    ja: 'జపనీస్',
    te: 'తెలుగు',
    ta: 'తమిళం',
    ur: 'ఉర్దూ',
    ne: 'नेपाली',
    mr: 'మరాఠీ',
    select: 'భాషను ఎంచుకోండి'
  },
  ta: {
    en: 'ஆங்கிலம்',
    es: 'ஸ்பானிஷ்',
    zh: 'சீனம்',
    fr: 'பிரெஞ்சு',
    de: 'ஜெர்மன்',
    vi: 'வியட்நாமிய மொழி',
    ar: 'அரபிக்',
    ko: 'கொரியன்',
    hi: 'இந்தि',
    gu: 'குஜராத்தி',
    tl: 'தகலாக்',
    ru: 'ரஷ்யன்',
    ja: 'ஜப்பானிய மொழி',
    te: 'தெலுங்கு',
    ta: 'தமிழ்',
    ur: 'உருது',
    ne: 'நேபாளி',
    mr: 'மராத்தி',
    select: 'மொழியைத் தேர்வுசெய்'
  },
  ur: {
    en: 'انگریزی',
    es: 'ہسبانوی',
    zh: 'چینی',
    fr: 'فرانسیسی',
    de: 'جرمن',
    vi: 'ویتنامی',
    ar: 'عربی',
    ko: 'کوریائی',
    hi: 'ہندی',
    gu: 'گجراتی',
    tl: 'ٹیگالوگ/فلپائنی',
    ru: 'روسی',
    ja: 'جاپانی',
    te: 'تیلگو',
    ta: 'تمل',
    ur: 'اردو',
    ne: 'نیپالی',
    mr: 'مراٹھی',
    select: 'زبان منتخب کریں'
  },
  ne: {
    en: 'अंग्रेजी',
    es: 'स्पेनिस',
    zh: 'चिनियाँ',
    fr: 'फ्रान्सेली',
    de: 'जर्मन',
    vi: 'भियतनामी',
    ar: 'अरबी',
    ko: 'कोरियाली',
    hi: 'हिन्दी',
    gu: 'गुजराती',
    tl: 'तागालोग/फिलिपिनो',
    ru: 'रूसी',
    ja: 'जापानी',
    te: 'तेलुगु',
    ta: 'तमिल',
    ur: 'उर्दू',
    ne: 'नेपाली',
    mr: 'मराठी',
    select: 'भाषा चयन गर्नुहोस्'
  },
  mr: {
    en: 'इंग्रजी',
    es: 'स्पॅनिश',
    zh: 'चिनी',
    fr: 'फ्रेंच',
    de: 'जर्मन',
    vi: 'व्हिएतनामी',
    ar: 'अरबी',
    ko: 'कोरियन',
    hi: 'हिंदी',
    gu: 'गुजराती',
    tl: 'टागालोग/फिलिपिनो',
    ru: 'रशियन',
    ja: 'जपानी',
    te: 'तेलुगु',
    ta: 'तमिळ',
    ur: 'उर्दू',
    ne: 'नेपाळी',
    mr: 'मराठी',
    select: 'भाषा निवडा'
  }
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

function decodeEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function lookupTranslation(translations, key) {
  if (translations[key]) return translations[key];
  
  const normalizedKey = key.trim().replace(/\s+/g, ' ');
  if (translations[normalizedKey]) return translations[normalizedKey];
  
  const decodedKey = decodeEntities(key);
  if (translations[decodedKey]) return translations[decodedKey];
  
  const normalizedDecodedKey = decodedKey.trim().replace(/\s+/g, ' ');
  if (translations[normalizedDecodedKey]) return translations[normalizedDecodedKey];
  
  // Try pattern matching for dynamic numbers:
  // 1. Matches (N)
  let match = normalizedKey.match(/^Matches\s+\((\d+)\)$/i);
  if (match) {
    const base = lookupTranslation(translations, "Matches") || "Matches";
    return `${base} (${match[1]})`;
  }
  
  // 2. Messages (N)
  match = normalizedKey.match(/^Messages\s+\((\d+)\)$/i);
  if (match) {
    const base = lookupTranslation(translations, "Messages") || "Messages";
    return `${base} (${match[1]})`;
  }
  
  // 3. Clear Resolved (N)
  match = normalizedKey.match(/^Clear\s+Resolved\s+\((\d+)\)$/i);
  if (match) {
    const base = lookupTranslation(translations, "Clear Resolved") || "Clear Resolved";
    return `${base} (${match[1]})`;
  }

  // 4. Messages count (e.g. "1 message" or "3 messages")
  match = normalizedKey.match(/^(\d+)\s+messages?$/i);
  if (match) {
    const isSingular = match[1] === '1';
    const baseKey = isSingular ? "Message" : "Messages";
    const base = lookupTranslation(translations, baseKey) || baseKey;
    return `${match[1]} ${base.toLowerCase()}`;
  }
  
  // 5. N claim(s) received — contact info below
  match = normalizedKey.match(/^(\d+)\s+claims?\s+received\s+—\s+contact\s+info\s+below$/i);
  if (match) {
    const base = lookupTranslation(translations, "claims received — contact info below") || "claims received — contact info below";
    return `${match[1]} ${base}`;
  }
  
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
        translateRegistry(getCurrentLanguage());
        translationObserver.observe(document.body, { childList: true, subtree: true });
      }
    });
    
    translationObserver.observe(document.body, { childList: true, subtree: true });
  }
}

function t(key) {
  const lang = getCurrentLanguage();
  if (lang === 'en') return key;
  const translations = window.APP_TRANSLATIONS ? window.APP_TRANSLATIONS[lang] : null;
  if (!translations) return key;
  return lookupTranslation(translations, key) || key;
}

// Expose language switcher API globally
window.changeLanguage = changeLanguage;
window.toggleLangDropdown = toggleLangDropdown;
window.applyTranslations = applyTranslations;
window.getCurrentLanguage = getCurrentLanguage;
window.t = t;

// Dynamically load translations.js and bootstrap i18n
function bootstrapTranslations() {
  injectLanguageSwitcherCSS();
  const activeLang = getCurrentLanguage();
  watchTranslations(activeLang);

  if (!window.APP_TRANSLATIONS) {
    const script = document.createElement('script');
    script.src = '/js/translations.js?v=1.0.3';
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

(function () {
  if (window.__gatorBotLoaded) return;
  window.__gatorBotLoaded = true;

  const STORAGE_KEY = 'gatorbotPrefill';
  const SEEN_KEY = 'gatorbotSeen';
  const state = {
    open: false,
    busy: false,
    lastFocus: null,
    quickReplies: [
      'How do I report an item?',
      'How do claims work?',
      'Where are my submissions?',
      'How do map pins work?'
    ]
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function apiPost(path, body) {
    if (window.api && typeof window.api.post === 'function') {
      return window.api.post(path, body);
    }
    return fetch(`/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Request failed');
      return data;
    });
  }

  function buildWidget() {
    const root = document.createElement('div');
    root.className = 'gatorbot-root';
    root.innerHTML = `
      <div class="gatorbot-nudge" aria-hidden="true">
        <span class="material-symbols-outlined" aria-hidden="true">support_agent</span>
        <span>Need help?</span>
      </div>
      <button class="gatorbot-launcher" type="button" aria-label="Open GatorBot assistant">
        <span class="gatorbot-launcher-ring" aria-hidden="true"></span>
        <img src="/images/gatorbot.jpeg" alt="" aria-hidden="true">
      </button>
      <div class="gatorbot-launcher-badge" aria-hidden="true">
        <span class="gatorbot-status-dot"></span>
        <span>Ask GatorBot</span>
      </div>
      <section class="gatorbot-panel" role="dialog" aria-modal="false" aria-labelledby="gatorbot-title" hidden>
        <header class="gatorbot-header">
          <div class="gatorbot-avatar"><img src="/images/gatorbot.jpeg" alt="" aria-hidden="true"></div>
          <div>
            <h2 id="gatorbot-title">GatorBot</h2>
            <p>Website assistant</p>
          </div>
          <button class="gatorbot-close" type="button" aria-label="Close GatorBot">×</button>
        </header>
        <div class="gatorbot-messages" role="log" aria-live="polite" aria-relevant="additions"></div>
        <div class="gatorbot-quick" aria-label="Suggested questions"></div>
        <form class="gatorbot-composer">
          <label class="sr-only" for="gatorbot-input">Ask GatorBot</label>
          <textarea id="gatorbot-input" rows="1" maxlength="1000" placeholder="Ask about reports, claims, map pins..."></textarea>
          <button type="submit" aria-label="Send message">
            <span class="material-symbols-outlined" aria-hidden="true">send</span>
          </button>
        </form>
      </section>
    `;
    document.body.appendChild(root);
    return root;
  }

  const root = buildWidget();
  const launcher = root.querySelector('.gatorbot-launcher');
  const panel = root.querySelector('.gatorbot-panel');
  const closeButton = root.querySelector('.gatorbot-close');
  const messages = root.querySelector('.gatorbot-messages');
  const quick = root.querySelector('.gatorbot-quick');
  const form = root.querySelector('.gatorbot-composer');
  const input = root.querySelector('#gatorbot-input');

  try {
    if (localStorage.getItem(SEEN_KEY) === 'true') root.classList.add('gatorbot-seen');
  } catch {
    // Private browsing or blocked storage should not affect the assistant.
  }

  function scrollMessages() {
    messages.scrollTop = messages.scrollHeight;
  }

  function renderQuickReplies(replies) {
    state.quickReplies = Array.isArray(replies) && replies.length ? replies : state.quickReplies;
    quick.innerHTML = state.quickReplies.map(reply => (
      `<button type="button" class="gatorbot-chip" data-prompt="${escapeHtml(reply)}">${escapeHtml(reply)}</button>`
    )).join('');
  }

  function addMessage(role, text, actions) {
    const row = document.createElement('div');
    row.className = `gatorbot-message gatorbot-message-${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'gatorbot-bubble';
    bubble.textContent = text;
    row.appendChild(bubble);

    if (role === 'bot' && Array.isArray(actions) && actions.length) {
      const actionWrap = document.createElement('div');
      actionWrap.className = 'gatorbot-actions';
      actions.forEach((action) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'gatorbot-action';
        button.textContent = action.label || 'Open';
        button.addEventListener('click', () => runAction(action));
        actionWrap.appendChild(button);
      });
      row.appendChild(actionWrap);
    }

    messages.appendChild(row);
    scrollMessages();
  }

  function setTyping(active) {
    let typing = messages.querySelector('.gatorbot-typing');
    if (active && !typing) {
      typing = document.createElement('div');
      typing.className = 'gatorbot-message gatorbot-message-bot gatorbot-typing';
      typing.innerHTML = '<div class="gatorbot-bubble"><span></span><span></span><span></span></div>';
      messages.appendChild(typing);
      scrollMessages();
    } else if (!active && typing) {
      typing.remove();
    }
  }

  function setOpen(open) {
    state.open = open;
    root.classList.toggle('is-open', open);
    panel.hidden = !open;
    launcher.setAttribute('aria-expanded', open ? 'true' : 'false');
    launcher.setAttribute('aria-label', open ? 'Close GatorBot assistant' : 'Open GatorBot assistant');

    if (open) {
      root.classList.add('gatorbot-seen');
      try {
        localStorage.setItem(SEEN_KEY, 'true');
      } catch {
        // Storage is optional; the nudge can simply return next page load.
      }
      state.lastFocus = document.activeElement;
      requestAnimationFrame(() => input.focus());
    } else if (state.lastFocus && typeof state.lastFocus.focus === 'function') {
      state.lastFocus.focus();
    }
  }

  function handleTrap(event) {
    if (!state.open || event.key !== 'Tab') return;
    const focusable = panel.querySelectorAll('button, textarea, [href], input, select, [tabindex]:not([tabindex="-1"])');
    const items = Array.from(focusable).filter(item => !item.disabled && item.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function runAction(action) {
    if (!action || !action.href) return;
    if (action.fields && Object.keys(action.fields).length) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        href: action.href,
        fields: action.fields,
        createdAt: Date.now()
      }));
    }
    window.location.href = action.href;
  }

  function applyPrefill() {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }

    const target = new URL(payload.href, window.location.origin);
    if (target.pathname !== window.location.pathname) return;
    if (Date.now() - Number(payload.createdAt || 0) > 10 * 60 * 1000) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }

    const selectorMap = {
      keyword: ['#keyword', '#searchInput', 'input[type="search"]', '[name="keyword"]'],
      category: ['#category', '#category-mobile', '[name="category"]'],
      itemName: ['#itemName', '[name="itemName"]'],
      locationFound: ['#locationFound', '[name="locationFound"]'],
      lastSeenLocation: ['#lastSeenLocation', '[name="lastSeenLocation"]'],
      description: ['#description', '[name="description"]']
    };

    Object.entries(payload.fields || {}).forEach(([field, value]) => {
      const selectors = selectorMap[field] || [];
      const el = selectors.map(selector => document.querySelector(selector)).find(Boolean);
      if (!el) return;
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.classList.remove('error', 'is-invalid', 'field-error');
      el.removeAttribute('aria-invalid');
    });

    sessionStorage.removeItem(STORAGE_KEY);
  }

  async function sendMessage(message) {
    const text = String(message || '').trim();
    if (!text || state.busy) return;

    addMessage('user', text);
    input.value = '';
    input.style.height = '';
    state.busy = true;
    form.classList.add('is-busy');
    setTyping(true);

    try {
      const data = await apiPost('/gatorbot/chat', {
        message: text,
        pagePath: window.location.pathname + window.location.search,
        pageTitle: document.title
      });
      setTyping(false);
      addMessage('bot', data.reply || 'I can help with Green Level Lost & Found.', data.actions || []);
      renderQuickReplies(data.quickReplies || []);
    } catch {
      setTyping(false);
      addMessage('bot', 'I can still help with website basics, but the assistant connection hiccupped. Try searching items, reporting from the student portal, or checking My Submissions.');
      renderQuickReplies(['Search found items', 'Report an item', 'My submissions']);
    } finally {
      state.busy = false;
      form.classList.remove('is-busy');
    }
  }

  launcher.addEventListener('click', () => setOpen(!state.open));
  closeButton.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.open) setOpen(false);
    handleTrap(event);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    sendMessage(input.value);
  });

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  });

  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    sendMessage(input.value);
  });

  quick.addEventListener('click', (event) => {
    const button = event.target.closest('[data-prompt]');
    if (!button) return;
    sendMessage(button.dataset.prompt);
  });

  renderQuickReplies(state.quickReplies);
  addMessage('bot', 'Hi, I’m GatorBot. Ask me about searching, reports, claims, messages, submissions, or the campus map.');
  applyPrefill();
}());

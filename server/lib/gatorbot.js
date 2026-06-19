// gatorbot.js — privacy-safe website assistant for Green Level Lost & Found

const { prisma } = require('./prisma');
const {
  generateWebsiteAssistantJson,
  isProviderConfigured,
  providerConfig
} = require('./aiProvider');
const { getGatorBotKnowledge } = require('./gatorbotKnowledge');

const SITE_NAME = 'Green Level Lost & Found';
const MAX_QUICK_REPLIES = 4;
const MAX_ACTIONS = 4;
const REFUSAL_REPLY = `I can only help with ${SITE_NAME}.`;
const SUPPORTED_LANGUAGES = [
  'English',
  'Spanish',
  'Chinese',
  'French',
  'German',
  'Vietnamese',
  'Arabic',
  'Korean',
  'Hindi',
  'Gujarati',
  'Tagalog/Filipino',
  'Russian',
  'Japanese',
  'Telugu',
  'Tamil',
  'Urdu',
  'Nepali',
  'Marathi',
  'Greek'
];

const ACTIONS = {
  signIn: { label: 'Sign In', href: '/login.html', kind: 'link' },
  createAccount: { label: 'Create Account', href: '/signup.html', kind: 'link' },
  searchFound: { label: 'Search Found Items', href: '/search.html', kind: 'link' },
  searchMissing: { label: 'Search Missing Items', href: '/search-missing.html', kind: 'link' },
  reportFound: { label: 'Report Found Item', href: '/report.html', kind: 'link' },
  reportMissing: { label: 'Report Missing Item', href: '/report-missing.html', kind: 'link' },
  submissions: { label: 'My Submissions', href: '/my-submissions.html', kind: 'link' },
  map: { label: 'Campus Map', href: '/map.html', kind: 'link' },
  resetPassword: { label: 'Reset Password', href: '/forgot-password.html', kind: 'link' },
  admin: { label: 'Admin Dashboard', href: '/admin.html', kind: 'link', adminOnly: true }
};

const ALLOWED_HREFS = new Set(Object.values(ACTIONS).map(action => action.href));
const DEFAULT_QUICK_REPLIES = [
  'How do I report an item?',
  'How do claims work?',
  'Where are my submissions?',
  'How do map pins work?'
];

function normalizeText(value) {
  return String(value || '').trim();
}

function sanitizeReply(value) {
  const reply = normalizeText(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[private email]');
  return reply.slice(0, 1200);
}

function isAdmin(user) {
  return user && user.role === 'ADMIN';
}

function action(key) {
  return { ...ACTIONS[key] };
}

function sanitizeActions(actions, user) {
  if (!Array.isArray(actions)) return [];
  const safe = [];
  const seen = new Set();

  for (const candidate of actions) {
    if (!candidate || typeof candidate !== 'object') continue;
    const href = normalizeText(candidate.href);
    if (!ALLOWED_HREFS.has(href)) continue;
    const source = Object.values(ACTIONS).find(item => item.href === href);
    if (!source || (source.adminOnly && !isAdmin(user))) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    safe.push({
      label: normalizeText(candidate.label || source.label).slice(0, 44),
      href,
      kind: candidate.kind === 'prefill' ? 'prefill' : 'link',
      fields: sanitizePrefillFields(candidate.fields)
    });
    if (safe.length >= MAX_ACTIONS) break;
  }

  return safe;
}

function sanitizePrefillFields(fields) {
  if (!fields || typeof fields !== 'object') return undefined;
  const allowed = ['keyword', 'category', 'itemName', 'locationFound', 'lastSeenLocation', 'description'];
  const clean = {};
  for (const key of allowed) {
    if (typeof fields[key] === 'string' && fields[key].trim()) {
      clean[key] = fields[key].trim().slice(0, 120);
    }
  }
  return Object.keys(clean).length ? clean : undefined;
}

function quickReplies(replies = DEFAULT_QUICK_REPLIES) {
  return replies
    .filter(Boolean)
    .map(reply => normalizeText(reply).slice(0, 80))
    .filter(Boolean)
    .slice(0, MAX_QUICK_REPLIES);
}

function createResponse({ reply, actions = [], quickReplies: replies, usedFallback = true }, user) {
  return {
    reply: sanitizeReply(reply),
    actions: sanitizeActions(actions, user),
    quickReplies: quickReplies(replies),
    usedFallback: Boolean(usedFallback)
  };
}

function intent(message) {
  const text = normalizeText(message).toLowerCase();
  return {
    text,
    isGreeting: /^(hi|hello|hey|yo|help)\b/.test(text),
    isReport: /\b(report|submit|turn(ed)? in|found something|lost something)\b/.test(text),
    isFoundReport: /\b(found item|found something|turn(ed)? in|report found)\b/.test(text),
    isMissingReport: /\b(missing item|lost item|lost something|report missing)\b/.test(text),
    isSearch: /\b(search|browse|find|look for|listing|listings|catalog)\b/.test(text),
    isClaim: /\b(claim|proof|owner|ownership|pickup|pick up|recover|return)\b/.test(text),
    isDashboard: /\b(my submissions|submissions|dashboard|status|updates|progress|my claims|my messages|matches)\b/.test(text),
    isAdmin: /\b(admin|approve|reject|moderate|review items|mark claimed|delete item)\b/.test(text),
    isMap: /\b(map|pin|room|floor|location|where)\b/.test(text),
    isUpload: /\b(upload|photo|image|heic|picture|10 ?mb|file)\b/.test(text),
    isPassword: /\b(password|reset|forgot|sign in|login|log in)\b/.test(text),
    isAccount: /\b(account|delete my account|privacy|email|contact)\b/.test(text),
    isLanguage: /\b(language|languages|translate|translation|multilingual|english|spanish|chinese|french|german|vietnamese|arabic|korean|hindi|gujarati|tagalog|filipino|russian|japanese|telugu|tamil|urdu|nepali|marathi|greek)\b/.test(text),
    isNavigation: /\b(page|pages|route|routes|navigation|nav|link|button|where can i|where do i|how can i get|take me|open|go to)\b/.test(text),
    isAiMatching: /\b(ai|matching|match|matches|recognition|image recognition|photo profile|compare|suggested match|potential match)\b/.test(text),
    isDemo: /\b(judge|judges|fbla|demo|presentation|offline|wifi|wi-fi|local|feature|features|technology|tech stack|built with)\b/.test(text),
    isTroubleshooting: /\b(error|bug|broken|not working|failed|failure|red outline|validation|server error|reset link|email not sent|stuck|cannot|can't)\b/.test(text)
  };
}

function isWebsiteIntent(flags) {
  return flags.isGreeting || flags.isReport || flags.isSearch || flags.isClaim ||
    flags.isDashboard || flags.isAdmin || flags.isMap || flags.isUpload ||
    flags.isPassword || flags.isAccount || flags.isLanguage ||
    flags.isNavigation || flags.isAiMatching || flags.isDemo ||
    flags.isTroubleshooting;
}

function languageList() {
  return SUPPORTED_LANGUAGES.join(', ');
}

function isRefusalReply(reply) {
  return new RegExp(`only help with ${SITE_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i')
    .test(normalizeText(reply));
}

function statusCounts(records) {
  return records.reduce((counts, record) => {
    const key = String(record.status || 'unknown').toLowerCase();
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function describeCounts(label, counts) {
  const parts = Object.entries(counts).map(([status, count]) => `${count} ${status}`);
  return `${label}: ${parts.length ? parts.join(', ') : '0'}`;
}

async function buildSafeContext(user) {
  if (!user) return { signedIn: false, role: 'GUEST' };

  const [
    foundItems,
    missingItems,
    claimsSubmitted,
    claimsReceived,
    messageCount
  ] = await Promise.all([
    prisma.foundItem.findMany({
      where: { submittedById: user.id },
      select: { status: true }
    }),
    prisma.missingItem.findMany({
      where: { submittedById: user.id },
      select: { status: true }
    }),
    prisma.claim.findMany({
      where: { submittedById: user.id },
      select: { status: true }
    }),
    prisma.claim.findMany({
      where: { ownerId: user.id },
      select: { status: true }
    }),
    prisma.message.count({
      where: {
        OR: [
          { senderId: user.id },
          { receiverId: user.id }
        ]
      }
    })
  ]);

  const context = {
    signedIn: true,
    role: user.role,
    userName: user.name,
    foundCounts: statusCounts(foundItems),
    missingCounts: statusCounts(missingItems),
    submittedClaimCounts: statusCounts(claimsSubmitted),
    receivedClaimCounts: statusCounts(claimsReceived),
    messageCount
  };

  if (isAdmin(user)) {
    const [pendingFound, pendingMissing, pendingClaims] = await Promise.all([
      prisma.foundItem.count({ where: { status: 'PENDING' } }),
      prisma.missingItem.count({ where: { status: 'PENDING' } }),
      prisma.claim.count({ where: { status: 'PENDING' } })
    ]);
    context.adminCounts = { pendingFound, pendingMissing, pendingClaims };
  }

  return context;
}

function fallbackAnswer(message, context, user) {
  const flags = intent(message);

  if (!isWebsiteIntent(flags)) {
    return createResponse({
      reply: `${REFUSAL_REPLY} Try asking about searching items, reporting found or missing belongings, claims, messages, the campus map, languages, uploads, or your submissions.`,
      actions: [action('searchFound'), action('reportFound')],
      quickReplies: ['How do I search?', 'What languages are supported?', 'How do claims work?']
    }, user);
  }

  if (flags.isAdmin) {
    if (!isAdmin(user)) {
      return createResponse({
        reply: 'Admin review tools are only available to school administrators. You can still search listings, report items, submit claims, and check your own submissions.',
        actions: context.signedIn
          ? [action('submissions'), action('searchFound'), action('reportFound')]
          : [action('signIn'), action('searchFound')],
        quickReplies: ['How do I report?', 'How do I submit a claim?', 'Where are my submissions?']
      }, user);
    }
    const counts = context.adminCounts || {};
    return createResponse({
      reply: `For admin review, open the GLHS Portal. Current queue: ${counts.pendingFound || 0} found reports, ${counts.pendingMissing || 0} missing reports, and ${counts.pendingClaims || 0} claims waiting for review.`,
      actions: [action('admin')],
      quickReplies: ['How do claims work?', 'How do messages work?', 'Show student portal help']
    }, user);
  }

  if (flags.isDashboard) {
    if (!context.signedIn) {
      return createResponse({
        reply: 'Sign in to see your own submissions, claims, matches, and messages. I cannot show private dashboard details unless you are logged in.',
        actions: [action('signIn'), action('createAccount')]
      }, user);
    }
    return createResponse({
      reply: `Here is your dashboard snapshot: ${describeCounts('found reports', context.foundCounts)}; ${describeCounts('missing reports', context.missingCounts)}; claims you submitted: ${Object.values(context.submittedClaimCounts).reduce((a, b) => a + b, 0)}; claims on your items: ${Object.values(context.receivedClaimCounts).reduce((a, b) => a + b, 0)}; messages involving you: ${context.messageCount}. Check My Submissions for updates and progress.`,
      actions: [action('submissions'), action('reportFound'), action('reportMissing')],
      quickReplies: ['How do claims work?', 'How do messages work?', 'Report another item']
    }, user);
  }

  if (flags.isLanguage) {
    return createResponse({
      reply: `The website includes these languages: ${languageList()}. You can use the site language controls to switch the interface, and the core lost-and-found flows stay the same across languages.`,
      actions: [action('searchFound'), action('searchMissing'), context.signedIn ? action('submissions') : action('signIn')],
      quickReplies: ['How do I switch pages?', 'How do I report an item?', 'How do map pins work?']
    }, user);
  }

  if (flags.isAiMatching) {
    return createResponse({
      reply: 'The matching system compares item details, categories, locations, and optional photo-derived item profiles to suggest possible matches in My Submissions. Reports still submit even if the matching service is unavailable.',
      actions: [context.signedIn ? action('submissions') : action('signIn'), action('searchFound'), action('searchMissing')],
      quickReplies: ['Where are matches shown?', 'How do I report missing?', 'How do claims work?']
    }, user);
  }

  if (flags.isReport || flags.isFoundReport || flags.isMissingReport) {
    if (!context.signedIn) {
      return createResponse({
        reply: 'To report a found or missing item, sign in first so the school can track your submission and show updates in My Submissions. You can still search public listings without an account.',
        actions: [action('signIn'), action('createAccount'), action('searchFound')],
        quickReplies: ['Can I search first?', 'How do claims work?', 'What can I upload?']
      }, user);
    }
    const actions = flags.isMissingReport && !flags.isFoundReport
      ? [action('reportMissing'), action('reportFound'), action('submissions')]
      : [action('reportFound'), action('reportMissing'), action('submissions')];
    return createResponse({
      reply: 'You can submit a report from the student portal. Add the item details, location, date, optional map pin, and an optional photo. After submitting, check My Submissions for updates and progress.',
      actions,
      quickReplies: ['What photo types work?', 'How do map pins work?', 'Show my submissions']
    }, user);
  }

  if (flags.isSearch) {
    return createResponse({
      reply: 'Use Search Found Items to browse things turned in to the school, or Missing Items to see what classmates are looking for. Searching does not require an account.',
      actions: [action('searchFound'), action('searchMissing')],
      quickReplies: ['How do I submit a claim?', 'How do categories work?', 'What if I find a match?']
    }, user);
  }

  if (flags.isClaim) {
    return createResponse({
      reply: 'If you find your item in the found-item gallery, open the item detail page and submit a claim with proof of ownership. An administrator reviews the claim before pickup is coordinated.',
      actions: [action('searchFound'), context.signedIn ? action('submissions') : action('signIn')],
      quickReplies: ['What proof should I give?', 'Where do I see claim status?', 'Can I message the owner?']
    }, user);
  }

  if (flags.isMap) {
    return createResponse({
      reply: 'The campus map helps place found-item pins by floor and room. In the report form, the map pin is optional: you can select a room and drag the pin to the exact spot if you know it.',
      actions: [action('map'), context.signedIn ? action('reportFound') : action('signIn')],
      quickReplies: ['Can I report without a pin?', 'How accurate is the map?', 'Search found items']
    }, user);
  }

  if (flags.isUpload) {
    return createResponse({
      reply: 'Photos are optional but helpful. Uploads support common image formats, HEIC conversion, and a 10 MB limit. The photo preview should update before you submit.',
      actions: [context.signedIn ? action('reportFound') : action('signIn')],
      quickReplies: ['How do I report?', 'Can I skip the photo?', 'Show my submissions']
    }, user);
  }

  if (flags.isPassword) {
    return createResponse({
      reply: 'Use the password reset page if you forgot your password. If you are already signed in, you can continue to the student portal from My Submissions.',
      actions: [action('resetPassword'), context.signedIn ? action('submissions') : action('signIn')],
      quickReplies: ['Create account', 'How do I report?', 'Search items']
    }, user);
  }

  if (flags.isAccount) {
    return createResponse({
      reply: 'Your contact information is not shown in public item listings. The site only shares claim and message context where it is needed for verified lost-and-found workflows.',
      actions: [context.signedIn ? action('submissions') : action('signIn')],
      quickReplies: ['How do messages work?', 'How do claims work?', 'How do I delete my account?']
    }, user);
  }

  if (flags.isTroubleshooting) {
    return createResponse({
      reply: 'For website issues, first check that you are signed in for protected actions, required fields are filled, uploads are under 10 MB, and your photo format is supported. Password reset email requires the server email settings to be configured. If a report was submitted, check My Submissions for its status.',
      actions: [context.signedIn ? action('submissions') : action('signIn'), action('resetPassword'), action('searchFound')],
      quickReplies: ['Why is upload failing?', 'How do I reset password?', 'Where are my submissions?']
    }, user);
  }

  if (flags.isNavigation || flags.isDemo) {
    return createResponse({
      reply: `${SITE_NAME} includes public search pages, found and missing item detail pages, report forms, claim flow, My Submissions, messages, matches, the campus map with room pins, password reset, and an admin review dashboard for authorized staff. Core pages are designed to run locally for a judge demo.`,
      actions: [action('searchFound'), action('searchMissing'), action('map'), context.signedIn ? action('submissions') : action('signIn')],
      quickReplies: ['What languages are supported?', 'How do I report?', 'How does admin review work?']
    }, user);
  }

  return createResponse({
    reply: `I can help with ${SITE_NAME}: search, reports, claims, messages, map pins, submissions, and admin guidance for authorized staff.`,
    actions: [action('searchFound'), context.signedIn ? action('submissions') : action('signIn')],
    quickReplies: DEFAULT_QUICK_REPLIES
  }, user);
}

function aiEnabled() {
  return process.env.NODE_ENV !== 'test' &&
    process.env.GATORBOT_AI_ENABLED !== 'false' &&
    isProviderConfigured(providerConfig('gatorbot'));
}

function contextForPrompt(context) {
  const safe = {
    signedIn: context.signedIn,
    role: context.role,
    foundCounts: context.foundCounts,
    missingCounts: context.missingCounts,
    submittedClaimCounts: context.submittedClaimCounts,
    receivedClaimCounts: context.receivedClaimCounts,
    messageCount: context.messageCount,
    adminCounts: context.adminCounts
  };
  return JSON.stringify(safe);
}

function knowledgeBase() {
  try {
    return getGatorBotKnowledge();
  } catch (err) {
    console.warn('[GatorBot] Knowledge file unavailable, using compact fallback:', err.message);
    return [
      'Green Level Lost & Found lets users search approved found items and missing-item posts.',
      'Public users can search and browse without signing in.',
      'Users must sign in to submit found reports, missing reports, claims, messages, and account actions.',
      `Supported languages include: ${languageList()}.`,
      'Found and missing reports can include item details, location, date, optional image, and optional map room/pin metadata.',
      'Upload limit copy is 10 MB. HEIC photos are converted when supported.',
      'Claims require proof of ownership and are reviewed by administrators before pickup.',
      'My Submissions contains Found, Missing, Claims, Matches, and Messages tabs.',
      'Admin tools are only for admin users.',
      'Public responses must not expose private contact emails.',
      'GatorBot may navigate or prefill fields, but never submits reports, claims, messages, approvals, deletes, or account actions.'
    ].join('\n- ');
  }
}

async function askAiProvider(message, context, user, pagePath, pageTitle) {
  const prompt = `You are GatorBot, the website assistant for Green Level Lost & Found.
Answer questions about this website, its features, pages, forms, supported languages, accessibility, uploads, matching, campus map, privacy rules, local/offline demo behavior, and troubleshooting.
If a question is ambiguous but could plausibly refer to the website, answer in the Green Level Lost & Found context instead of refusing.
Only refuse questions that are clearly unrelated to this website. For unrelated questions, say: "I can only help with Green Level Lost & Found."
Never include private emails or private contact information.
Admin guidance and /admin.html actions are allowed only when context.role is ADMIN.
Be concise and practical. Prefer links/actions from the allowed action catalog.
Return ONLY valid JSON with this shape:
{"reply":"...","actions":[{"label":"...","href":"/search.html","kind":"link"}],"quickReplies":["..."]}

Allowed routes/actions: ${JSON.stringify(Object.values(ACTIONS).map(({ label, href }) => ({ label, href })))}
Knowledge:
${knowledgeBase()}
Safe user context: ${contextForPrompt(context)}
Current page: ${pageTitle || ''} ${pagePath || ''}
User question: ${message}`;

  const parsed = await generateWebsiteAssistantJson({ prompt });
  return createResponse({
    reply: parsed.reply,
    actions: parsed.actions,
    quickReplies: parsed.quickReplies,
    usedFallback: false
  }, user);
}

async function answerGatorBot({ message, pagePath, pageTitle, user }) {
  const context = await buildSafeContext(user);
  const fallback = fallbackAnswer(message, context, user);

  if (!aiEnabled()) return fallback;

  try {
    const aiResponse = await askAiProvider(message, context, user, pagePath, pageTitle);
    if (isWebsiteIntent(intent(message)) && isRefusalReply(aiResponse.reply) && !isRefusalReply(fallback.reply)) {
      return fallback;
    }
    return aiResponse;
  } catch (err) {
    console.warn('[GatorBot] Falling back to deterministic answer after provider error:', err.message);
    return fallback;
  }
}

module.exports = { answerGatorBot, fallbackAnswer, buildSafeContext, knowledgeBase };

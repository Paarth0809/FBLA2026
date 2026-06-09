// matcher.js — Match computation between missing and found items
//
// Pure scoring logic — no AI API calls. Compares cached AI profiles
// and/or falls back to synonym/name/keyword text matching.
//
// Key design rule: category or location alone never produce a match.
// At least one "strong signal" (object family, name overlap, AI data)
// is required. This prevents "AirPods" matching "MacBook charger" just
// because both are Electronics.

// ── Synonym families ─────────────────────────────────────────────────────
// Items in the same family are considered the same object type.
// "AirPods" and "wireless earbuds" both resolve to 'earbuds'.
// "AirPods" and "MacBook" resolve to different families → no family match.
const OBJECT_FAMILIES = {
  earbuds:    ['airpods', 'earbud', 'earbuds', 'earphone', 'earphones',
               'wireless earbud', 'wireless earbuds', 'headphone', 'headphones', 'buds'],
  bottle:     ['hydro flask', 'hydroflask', 'water bottle', 'bottle', 'flask',
               'thermos', 'tumbler', 'nalgene'],
  hoodie:     ['hoodie', 'sweatshirt', 'jacket', 'sweater', 'pullover', 'zip-up', 'zip up'],
  laptop:     ['laptop', 'macbook', 'chromebook', 'computer', 'notebook'],
  charger:    ['macbook charger', 'laptop charger', 'phone charger', 'charger',
               'charging cable', 'usb cable', 'power cable', 'adapter', 'cable'],
  backpack:   ['backpack', 'bookbag', 'knapsack', 'rucksack'],
  keys:       ['keys', 'keychain', 'key fob', 'lanyard'],
  phone:      ['phone', 'iphone', 'android', 'smartphone', 'cell phone', 'cellphone', 'mobile'],
  calculator: ['calculator', 'graphing calculator', 'ti-84', 'ti84'],
  wallet:     ['wallet', 'purse', 'cardholder', 'card holder', 'billfold'],
  watch:      ['watch', 'smartwatch', 'apple watch'],
  glasses:    ['glasses', 'sunglasses', 'spectacles', 'reading glasses', 'goggles'],
};

// Build a flat list of {syn, family} sorted by synonym length descending.
// This ensures longer (more specific) phrases like "macbook charger" are
// checked before shorter ones like "macbook", preventing wrong family matches.
const SYNONYM_LIST = [];
for (const [family, synonyms] of Object.entries(OBJECT_FAMILIES)) {
  for (const syn of synonyms) SYNONYM_LIST.push({ syn, family });
}
SYNONYM_LIST.sort((a, b) => b.syn.length - a.syn.length);

// Return the family name an item belongs to, or null if none.
function getObjectFamily(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const { syn, family } of SYNONYM_LIST) {
    if (lower.includes(syn)) return family;
  }
  return null;
}

// Extract lowercase words (3+ chars) from a string for keyword matching.
function extractKeywords(text) {
  if (!text) return [];
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3);
}

// Count how many elements two arrays share (case-insensitive).
function overlap(a, b) {
  if (!a || !b) return 0;
  const setB = new Set(b.map(x => x.toLowerCase()));
  return a.filter(x => setB.has(x.toLowerCase())).length;
}

// Score a single (missingItem, foundItem) pair. Returns { score, reasons, strongSignal }.
// strongSignal must be true before a match is returned to the user.
function scoreMatch(missing, found) {
  let score = 0;
  let strongSignal = false;
  const reasons = [];

  // ── Category bonus (not enough alone) ───────────────────────
  if (missing.category && found.category && missing.category === found.category) {
    score += 10;
    reasons.push('Same category: ' + missing.category);
  }

  // ── Object family / synonym match (STRONG SIGNAL) ────────────
  const missingFamily = getObjectFamily(missing.itemName + ' ' + (missing.description || ''));
  const foundFamily   = getObjectFamily(found.itemName   + ' ' + (found.description   || ''));
  if (missingFamily && foundFamily && missingFamily !== foundFamily) {
    reasons.push('Different item types');
    return { score: 0, reasons, strongSignal: false };
  }
  if (missingFamily && foundFamily && missingFamily === foundFamily) {
    score += 35;
    strongSignal = true;
    reasons.push('Same item type: ' + missingFamily);
  }

  // ── Item name word overlap (STRONG SIGNAL if any overlap) ────
  const missingNameWords = extractKeywords(missing.itemName);
  const foundNameWords   = extractKeywords(found.itemName);
  const nameOv = overlap(missingNameWords, foundNameWords);
  if (nameOv > 0) {
    score += nameOv * 15;
    strongSignal = true;
    reasons.push('Name overlap (' + nameOv + ' shared word' + (nameOv > 1 ? 's' : '') + ')');
  }

  // ── AI profile comparison (when both items have cached profiles) ──
  const mp = missing.aiProfile;
  const fp = found.aiProfile;

  if (mp && fp) {
    const kwOv = overlap(mp.keywords || [], fp.keywords || []);
    if (kwOv > 0) {
      score += kwOv * 8;
      if (kwOv >= 2) strongSignal = true;
      reasons.push('AI keyword overlap (' + kwOv + ' shared)');
    }

    if (mp.color && fp.color && mp.color.toLowerCase() === fp.color.toLowerCase()) {
      score += 15;
      reasons.push('Color match: ' + fp.color);
    }

    if (mp.brand && fp.brand
        && mp.brand.toLowerCase() !== 'unknown'
        && fp.brand.toLowerCase() !== 'unknown'
        && mp.brand.toLowerCase() === fp.brand.toLowerCase()) {
      score += 20;
      strongSignal = true;
      reasons.push('Brand match: ' + fp.brand);
    }

    if (mp.material && fp.material
        && mp.material.toLowerCase() !== 'unknown'
        && fp.material.toLowerCase() !== 'unknown'
        && mp.material.toLowerCase() === fp.material.toLowerCase()) {
      score += 10;
      reasons.push('Material match: ' + fp.material);
    }

    const featOv = overlap(
      (mp.distinguishingFeatures || []).map(f => f.toLowerCase()),
      (fp.distinguishingFeatures || []).map(f => f.toLowerCase())
    );
    if (featOv > 0) {
      score += featOv * 10;
      strongSignal = true;
      reasons.push('Feature overlap (' + featOv + ' shared)');
    }
  } else {
    // No AI profiles — fallback: keyword overlap across name + description
    const missingWords = mp
      ? (mp.keywords || [])
      : extractKeywords([missing.itemName, missing.description].join(' '));
    const foundWords = fp
      ? (fp.keywords || [])
      : extractKeywords([found.itemName, found.description].join(' '));

    const kwOv = overlap(missingWords, foundWords);
    if (kwOv >= 2) {
      score += kwOv * 5;
      strongSignal = true;
      reasons.push('Keyword match (' + kwOv + ' shared)');
    } else if (kwOv === 1) {
      score += 5;
      // single keyword overlap is not a strong signal on its own
      reasons.push('Keyword match (1 shared)');
    }
  }

  // ── Location bonus (not enough alone) ───────────────────────
  const missingLoc = (missing.lastSeenLocation || '').toLowerCase();
  const foundLoc   = (found.locationFound     || '').toLowerCase();
  if (missingLoc && foundLoc) {
    const locWords = missingLoc.split(/\s+/).filter(w => w.length >= 3);
    if (locWords.some(w => foundLoc.includes(w))) {
      score += 5;
      reasons.push('Similar location');
    }
  }

  return { score, reasons, strongSignal };
}

// Find matches for a list of missing items against a pool of found items.
// Returns an array of { missingItem, foundMatches: [{ item, score, reasons }] }.
function findMatchesForMissingItems(missingItems, foundItems) {
  const MIN_SCORE   = 20;
  const MAX_MATCHES = 5;

  return missingItems.map(missing => {
    const scored = foundItems
      .map(found => {
        const { score, reasons, strongSignal } = scoreMatch(missing, found);
        return { item: found, score, reasons, strongSignal };
      })
      // Require BOTH a minimum score AND at least one strong signal
      .filter(m => m.score >= MIN_SCORE && m.strongSignal)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_MATCHES)
      .map(({ item, score, reasons }) => ({ item, score, reasons })); // drop internal flag

    return { missingItem: missing, foundMatches: scored };
  });
}

module.exports = { findMatchesForMissingItems, scoreMatch, getObjectFamily };

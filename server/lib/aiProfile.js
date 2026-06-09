// aiProfile.js — Gemini Vision-powered item profile generator
//
// When AI_MATCHING_ENABLED=true and GEMINI_API_KEY is set, this module
// sends item photos to Gemini 2.5 Flash's vision API to generate a
// structured profile (color, brand, material, keywords, etc.). The
// profile is cached on the item object so Gemini is only called once.
//
// Gemini 2.5 Flash has a free tier in Google AI Studio.
// Get a key at aistudio.google.com.
//
// If the feature flag is off or the key is missing, everything degrades
// gracefully — items save normally, matching falls back to keywords.

const path = require('path');
const fs = require('fs');
const { readJSON, writeJSON } = require('./db');

let geminiModel = null;

function getModel() {
  if (geminiModel) return geminiModel;
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  geminiModel = genai.getGenerativeModel({ model: 'gemini-2.5-flash' });
  return geminiModel;
}

function isEnabled() {
  return process.env.AI_MATCHING_ENABLED === 'true' && !!process.env.GEMINI_API_KEY;
}

// Generate a structured AI profile from an item's photo using Gemini vision.
// Returns the profile object or null on failure.
async function generateProfile(item, photoPath) {
  if (!fs.existsSync(photoPath)) return null;

  const imageData = fs.readFileSync(photoPath);
  const base64 = imageData.toString('base64');
  const ext = path.extname(photoPath).slice(1).toLowerCase();
  const mimeType = ext === 'png' ? 'image/png'
    : ext === 'gif' ? 'image/gif'
    : ext === 'webp' ? 'image/webp'
    : 'image/jpeg';

  const prompt = `You are a lost-and-found item analyzer. Analyze this item photo and return ONLY a valid JSON object with these fields:
- "keywords": array of 5-10 descriptive keywords (lowercase)
- "color": primary color(s) as a string
- "brand": brand name if visible, or "unknown"
- "material": material type if identifiable, or "unknown"
- "distinguishingFeatures": array of 2-5 unique identifying details
- "detailedDescription": one paragraph describing the item in detail

Context — Item name: "${item.itemName}", Category: "${item.category}", User description: "${item.description}"

Respond with ONLY the JSON object, no markdown, no explanation.`;

  const model = getModel();
  const result = await model.generateContent([
    prompt,
    { inlineData: { data: base64, mimeType } }
  ]);

  const text = result.response.text().trim();
  // Strip markdown code fences if Gemini wraps the JSON
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(clean);
}

// Fire-and-forget: generate an AI profile and save it to the item's JSON record.
// Never throws — logs errors silently so item submission is never blocked.
function generateAndSave(itemId, itemType) {
  if (!isEnabled()) return;

  const filename = itemType === 'found' ? 'items.json' : 'missing-items.json';

  // Run async without awaiting — caller returns immediately
  (async () => {
    try {
      const items = readJSON(filename);
      const item = items.find(i => i.id === itemId);
      if (!item || !item.photo) return;
      if (item.aiProfile) return; // already generated

      const photoPath = path.join(__dirname, '../../uploads', item.photo);
      const profile = await generateProfile(item, photoPath);
      if (!profile) return;

      // Re-read to avoid overwriting concurrent changes
      const fresh = readJSON(filename);
      const idx = fresh.findIndex(i => i.id === itemId);
      if (idx === -1) return;

      fresh[idx].aiProfile = profile;
      writeJSON(filename, fresh);
      console.log(`[AI] Profile generated for ${itemType} item: ${item.itemName}`);
    } catch (err) {
      console.error(`[AI] Profile generation failed for ${itemType} ${itemId}:`, err.message);
    }
  })();
}

module.exports = { generateAndSave, isEnabled };

// aiProfile.js — photo-based item profile generator
//
// When the matching feature is enabled and a provider key is set, this module
// generates a structured profile (color, brand, material, keywords, etc.) from
// item photos. The profile is cached on the item object so the work happens once.
//
// If the feature flag is off or the key is missing, everything degrades
// gracefully — items save normally, matching falls back to keywords.

const path = require('path');
const fs = require('fs');
const { prisma } = require('./prisma');
const { foundItemToApi, missingItemToApi, itemIncludes } = require('./modelMapper');

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

// Generate a structured photo profile from an item's image.
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
  // Strip markdown code fences if the provider wraps the JSON
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(clean);
}

// Fire-and-forget: generate a photo profile and save it to the item's JSON record.
// Never throws — logs errors silently so item submission is never blocked.
function generateAndSave(itemId, itemType) {
  if (!isEnabled()) return;

  // Run async without awaiting — caller returns immediately
  (async () => {
    try {
      const record = itemType === 'found'
        ? await prisma.foundItem.findUnique({ where: { id: itemId }, include: itemIncludes })
        : await prisma.missingItem.findUnique({ where: { id: itemId }, include: itemIncludes });
      const item = itemType === 'found' ? foundItemToApi(record) : missingItemToApi(record);
      if (!item || !item.photo) return;
      if (item.aiProfile) return; // already generated

      const photoPath = path.join(__dirname, '../../uploads', item.photo);
      const profile = await generateProfile(item, photoPath);
      if (!profile) return;

      if (itemType === 'found') {
        await prisma.foundItem.update({ where: { id: itemId }, data: { aiProfile: profile } });
      } else {
        await prisma.missingItem.update({ where: { id: itemId }, data: { aiProfile: profile } });
      }
      console.log(`[Matcher] Profile generated for ${itemType} item: ${item.itemName}`);
    } catch (err) {
      console.error(`[Matcher] Profile generation failed for ${itemType} ${itemId}:`, err.message);
    }
  })();
}

module.exports = { generateAndSave, isEnabled };

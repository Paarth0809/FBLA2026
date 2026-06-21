// aiProvider.js — shared OpenAI adapter for website assistant + photo profiles

const fs = require('fs');
const path = require('path');

const DEFAULT_MODEL = 'gpt-5.4-mini';
const DEFAULT_TIMEOUT_MS = 6500;
const PLACEHOLDER_KEY_PATTERN = /^(your[-_\s]?new[-_\s]?key[-_\s]?here|your[-_\s]?openai[-_\s]?key|paste[-_\s]?your[-_\s]?key[-_\s]?here|placeholder)$/i;

function cleanString(value, fallback = '') {
  return String(value || fallback).trim();
}

function numberFrom(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function providerConfig(kind = 'default', overrides = {}) {
  const provider = cleanString(overrides.provider || process.env.AI_PROVIDER || 'openai').toLowerCase();
  const modelEnv = kind === 'gatorbot' ? process.env.OPENAI_GATORBOT_MODEL : process.env.OPENAI_AI_PROFILE_MODEL;

  return {
    provider,
    apiKey: overrides.apiKey ?? process.env.OPENAI_API_KEY,
    model: cleanString(overrides.model || modelEnv || DEFAULT_MODEL),
    timeoutMs: numberFrom(overrides.timeoutMs ?? process.env.OPENAI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    client: overrides.client
  };
}

function isProviderConfigured(config = {}) {
  const provider = cleanString(config.provider || process.env.AI_PROVIDER || 'openai').toLowerCase();
  if (provider === 'none' || provider === 'off' || provider === 'false') return false;
  if (provider !== 'openai') return false;
  const apiKey = cleanString(config.apiKey ?? process.env.OPENAI_API_KEY);
  if (!apiKey || PLACEHOLDER_KEY_PATTERN.test(apiKey)) return false;
  return true;
}

function getOpenAIClient(config) {
  if (config.client) return config.client;
  const OpenAI = require('openai');
  return new OpenAI({ apiKey: config.apiKey });
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} provider timeout`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function responseText(response) {
  if (!response) return '';
  if (typeof response.output_text === 'string') return response.output_text;
  if (typeof response.text === 'string') return response.text;

  const chunks = [];
  for (const item of response.output || []) {
    for (const part of item.content || []) {
      if (typeof part.text === 'string') chunks.push(part.text);
      if (typeof part.output_text === 'string') chunks.push(part.output_text);
    }
  }
  return chunks.join('\n');
}

function extractJsonObject(text) {
  const raw = cleanString(text)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) throw new Error('AI response did not contain JSON');
    return JSON.parse(raw.slice(start, end + 1));
  }
}

function mimeTypeForFile(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

function normalizeProfile(profile) {
  const keywords = Array.isArray(profile.keywords)
    ? profile.keywords.map(keyword => cleanString(keyword).toLowerCase()).filter(Boolean).slice(0, 12)
    : [];
  const distinguishingFeatures = Array.isArray(profile.distinguishingFeatures)
    ? profile.distinguishingFeatures.map(feature => cleanString(feature)).filter(Boolean).slice(0, 8)
    : [];

  return {
    keywords,
    color: cleanString(profile.color, 'unknown').slice(0, 80),
    brand: cleanString(profile.brand, 'unknown').slice(0, 80),
    material: cleanString(profile.material, 'unknown').slice(0, 80),
    distinguishingFeatures,
    detailedDescription: cleanString(profile.detailedDescription).slice(0, 1000)
  };
}

async function generateWebsiteAssistantJson({ prompt }, overrides = {}) {
  const config = providerConfig('gatorbot', overrides);
  if (!isProviderConfigured(config)) throw new Error('OpenAI provider is not configured');

  const client = getOpenAIClient(config);
  const response = await withTimeout(client.responses.create({
    model: config.model,
    input: [
      {
        role: 'user',
        content: [{ type: 'input_text', text: prompt }]
      }
    ]
  }), config.timeoutMs, 'GatorBot');

  return extractJsonObject(responseText(response));
}

async function generateImageProfileJson({ prompt, imagePath, imageBuffer, mimeType }, overrides = {}) {
  const config = providerConfig('profile', overrides);
  if (!isProviderConfigured(config)) throw new Error('OpenAI provider is not configured');

  let imageData;
  let resolvedMimeType = mimeType;

  if (Buffer.isBuffer(imageBuffer)) {
    imageData = imageBuffer.toString('base64');
    resolvedMimeType = resolvedMimeType || 'image/jpeg';
  } else if (imagePath && fs.existsSync(imagePath)) {
    imageData = fs.readFileSync(imagePath).toString('base64');
    resolvedMimeType = resolvedMimeType || mimeTypeForFile(imagePath);
  } else {
    return null;
  }

  const client = getOpenAIClient(config);
  const response = await withTimeout(client.responses.create({
    model: config.model,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: prompt },
          { type: 'input_image', image_url: `data:${resolvedMimeType};base64,${imageData}` }
        ]
      }
    ]
  }), config.timeoutMs, 'AI profile');

  return normalizeProfile(extractJsonObject(responseText(response)));
}

module.exports = {
  DEFAULT_MODEL,
  extractJsonObject,
  generateWebsiteAssistantJson,
  generateImageProfileJson,
  isProviderConfigured,
  providerConfig,
  normalizeProfile
};

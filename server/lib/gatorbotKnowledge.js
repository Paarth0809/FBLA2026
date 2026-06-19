// gatorbotKnowledge.js — cached server-side website knowledge for GatorBot

const fs = require('fs');
const path = require('path');

const KNOWLEDGE_PATH = path.join(__dirname, '..', 'knowledge', 'gatorbot-knowledge.md');

let cachedKnowledge = null;

function getGatorBotKnowledge({ forceReload = false } = {}) {
  if (cachedKnowledge && !forceReload) return cachedKnowledge;

  const content = fs.readFileSync(KNOWLEDGE_PATH, 'utf8');
  cachedKnowledge = content
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cachedKnowledge;
}

module.exports = {
  getGatorBotKnowledge,
  KNOWLEDGE_PATH
};


// tests/ai-provider.test.js — pure OpenAI provider adapter tests

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  extractJsonObject,
  generateWebsiteAssistantJson,
  generateImageProfileJson,
  isProviderConfigured
} = require('../server/lib/aiProvider');

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅  ${name}`);
  } catch (err) {
    console.error(`  ❌  ${name}`);
    console.error(`       → ${err.message}`);
    process.exitCode = 1;
  }
}

function fakeClientReturning(outputText, calls) {
  return {
    responses: {
      create: async (payload) => {
        calls.push(payload);
        return { output_text: outputText };
      }
    }
  };
}

(async () => {
  await test('extractJsonObject parses raw and fenced JSON', () => {
    assert(extractJsonObject('{"ok":true}').ok === true, 'Expected raw JSON parse');
    assert(extractJsonObject('```json\n{"ok":true}\n```').ok === true, 'Expected fenced JSON parse');
  });

  await test('isProviderConfigured requires OpenAI key when provider is openai', () => {
    assert(!isProviderConfigured({ provider: 'openai', apiKey: '' }), 'Empty OpenAI key should be disabled');
    assert(!isProviderConfigured({ provider: 'openai', apiKey: 'your-new-key-here' }), 'Placeholder OpenAI key should be disabled');
    assert(isProviderConfigured({ provider: 'openai', apiKey: 'sk-test' }), 'OpenAI key should enable provider');
  });

  await test('generateWebsiteAssistantJson uses OpenAI Responses API shape', async () => {
    const calls = [];
    const result = await generateWebsiteAssistantJson({
      prompt: 'Return JSON only'
    }, {
      client: fakeClientReturning('{"reply":"Use Search Found Items.","actions":[],"quickReplies":["Search items"]}', calls),
      apiKey: 'sk-test',
      model: 'test-model',
      timeoutMs: 1000
    });

    assert(result.reply === 'Use Search Found Items.', `Unexpected reply: ${JSON.stringify(result)}`);
    assert(calls.length === 1, 'Expected one OpenAI call');
    assert(calls[0].model === 'test-model', 'Expected configured model');
    assert(Array.isArray(calls[0].input), 'Responses API input should be an array');
  });

  await test('generateImageProfileJson preserves matching profile schema', async () => {
    const tempPath = path.join(os.tmpdir(), `gatorbot-provider-${Date.now()}.jpg`);
    fs.writeFileSync(tempPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

    const calls = [];
    const profile = await generateImageProfileJson({
      prompt: 'Analyze image JSON only',
      imagePath: tempPath
    }, {
      client: fakeClientReturning(JSON.stringify({
        keywords: ['white', 'earbuds', 'case'],
        color: 'white',
        brand: 'apple',
        material: 'plastic',
        distinguishingFeatures: ['charging case'],
        detailedDescription: 'White earbuds in a charging case.'
      }), calls),
      apiKey: 'sk-test',
      model: 'test-vision-model',
      timeoutMs: 1000
    });

    fs.unlinkSync(tempPath);

    assert(Array.isArray(profile.keywords), 'Expected keywords array');
    assert(typeof profile.color === 'string', 'Expected color string');
    assert(typeof profile.detailedDescription === 'string', 'Expected detailedDescription string');
    const content = calls[0].input[0].content;
    assert(content.some(part => part.type === 'input_image'), 'Expected image input part');
  });
})();

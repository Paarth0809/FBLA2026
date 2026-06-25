const assert = require('assert');
const { publicUrl } = require('../server/lib/publicUrl');

function withEnv(overrides, fn) {
  const previous = {
    PUBLIC_APP_URL: process.env.PUBLIC_APP_URL,
    APP_BASE_URL: process.env.APP_BASE_URL,
    VERCEL_URL: process.env.VERCEL_URL
  };

  for (const key of Object.keys(previous)) delete process.env[key];
  Object.assign(process.env, overrides);

  try {
    fn();
  } finally {
    for (const key of Object.keys(previous)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

withEnv({ PUBLIC_APP_URL: 'https://fbla-2026-five.vercel.app\n' }, () => {
  const url = publicUrl('/reset-password.html?token=abc123');
  assert.equal(url, 'https://fbla-2026-five.vercel.app/reset-password.html?token=abc123');
});

withEnv({ VERCEL_URL: 'fbla-2026-five.vercel.app\n' }, () => {
  const url = publicUrl('/my-submissions.html');
  assert.equal(url, 'https://fbla-2026-five.vercel.app/my-submissions.html');
});

console.log('public-url.test.js passed');

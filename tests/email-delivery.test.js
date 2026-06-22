const assert = require('assert');

const {
  createEmailDelivery,
  resolveEmailConfig
} = require('../server/lib/emailDelivery');

function silentLogger() {
  return {
    log() {},
    warn() {},
    error() {}
  };
}

async function testResendConfig() {
  const config = resolveEmailConfig({
    EMAIL_PROVIDER: 'resend',
    RESEND_API_KEY: 're_test_123',
    RESEND_FROM_EMAIL: 'no-reply@example.com',
    RESEND_FROM_NAME: 'Green Level Lost & Found'
  });

  assert.equal(config.mode, 'resend');
  assert.equal(config.from, '"Green Level Lost & Found" <no-reply@example.com>');
  assert.equal(config.apiKey, 're_test_123');
}

async function testAutoPrefersResend() {
  const config = resolveEmailConfig({
    RESEND_API_KEY: 're_test_123',
    RESEND_FROM_EMAIL: 'no-reply@example.com'
  });

  assert.equal(config.mode, 'resend');
  assert.equal(config.from, '"Green Level Lost & Found" <no-reply@example.com>');
}

async function testResendSend() {
  const calls = [];
  class FakeResend {
    constructor(apiKey) {
      this.apiKey = apiKey;
      this.emails = {
        send: async (payload) => {
          calls.push({ apiKey: this.apiKey, payload });
          return { data: { id: 'email_test_123' } };
        }
      };
    }
  }

  const delivery = createEmailDelivery({
    env: {
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_test_123',
      RESEND_FROM_EMAIL: 'no-reply@example.com',
      RESEND_FROM_NAME: 'Green Level Lost & Found'
    },
    ResendCtor: FakeResend,
    logger: silentLogger()
  });

  const result = await delivery.send({
    to: 'student@example.com',
    subject: 'Password reset',
    text: 'Reset link'
  });

  assert.equal(result.sent, true);
  assert.equal(result.mode, 'resend');
  assert.equal(result.providerId, 'email_test_123');
  assert.deepEqual(calls, [
    {
      apiKey: 're_test_123',
      payload: {
        from: '"Green Level Lost & Found" <no-reply@example.com>',
        to: 'student@example.com',
        subject: 'Password reset',
        text: 'Reset link'
      }
    }
  ]);
}

async function testTestEnvironmentUsesPreviewByDefault() {
  const delivery = createEmailDelivery({
    env: {
      NODE_ENV: 'test',
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_test_123',
      RESEND_FROM_EMAIL: 'no-reply@example.com'
    },
    logger: silentLogger()
  });

  const result = await delivery.send({
    to: 'student@example.com',
    subject: 'Test',
    text: 'No network in tests'
  });

  assert.equal(result.sent, false);
  assert.equal(result.mode, 'local-preview');
}

async function run() {
  await testResendConfig();
  await testAutoPrefersResend();
  await testResendSend();
  await testTestEnvironmentUsesPreviewByDefault();
  console.log('email-delivery tests passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

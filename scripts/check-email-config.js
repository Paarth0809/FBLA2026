// check-email-config.js — verify optional email delivery without exposing secrets.
// Usage:
//   npm run email:check
//   npm run email:check -- --to=you@example.com

require('dotenv').config();

const {
  createEmailDelivery,
  redact,
  resolveEmailConfig
} = require('../server/lib/emailDelivery');

const sendTo = process.argv.find((arg) => arg.startsWith('--to='))?.slice('--to='.length);

async function main() {
  const config = resolveEmailConfig(process.env);

  console.log('Email delivery configuration');
  console.log('────────────────────────────');
  console.log(`EMAIL_PROVIDER=${process.env.EMAIL_PROVIDER || 'auto'}`);
  console.log(`Resolved mode=${config.mode}`);
  if (config.reason) console.log(`Reason=${config.reason}`);
  console.log('');

  console.log('Resend');
  console.log(`RESEND_API_KEY=${process.env.RESEND_API_KEY ? 'SET' : 'UNSET'}`);
  console.log(`RESEND_FROM_EMAIL=${process.env.RESEND_FROM_EMAIL || 'UNSET'}`);
  console.log(`RESEND_FROM_NAME=${process.env.RESEND_FROM_NAME || 'UNSET'}`);
  console.log(`EMAIL_FROM=${process.env.EMAIL_FROM || 'UNSET'}`);
  console.log('');

  console.log('SMTP fallback');
  console.log(`SMTP_HOST=${process.env.SMTP_HOST || 'UNSET'}`);
  console.log(`SMTP_PORT=${process.env.SMTP_PORT || '587'}`);
  console.log(`SMTP_SECURE=${process.env.SMTP_SECURE || 'false'}`);
  console.log(`SMTP_USER=${redact(process.env.SMTP_USER)}`);
  console.log(`SMTP_PASS=${process.env.SMTP_PASS ? 'SET' : 'UNSET'}`);
  console.log(`SMTP_FROM_EMAIL=${process.env.SMTP_FROM_EMAIL || 'UNSET'}`);
  console.log('');

  const delivery = createEmailDelivery({
    env: {
      ...process.env,
      EMAIL_DELIVERY_TEST_ALLOW_REAL: 'true'
    }
  });

  if (config.mode === 'local-preview') {
    console.log('Local preview mode: password reset links will be logged/shown in development instead of emailed.');
    return;
  }

  if (config.mode === 'smtp') {
    await delivery.verify();
    console.log('SMTP connection verified.');
  } else if (config.mode === 'resend') {
    console.log('Resend configuration found. Resend does not need an SMTP handshake.');
  }

  if (!sendTo) {
    console.log('No test message sent. Add -- --to=you@example.com to send one.');
    return;
  }

  const result = await delivery.send({
    to: sendTo,
    subject: 'Green Level Lost & Found Email Test',
    text: 'This is a test email from Green Level Lost & Found.'
  });
  console.log(`Test email ${result.sent ? 'sent' : 'logged'} to ${sendTo} via ${result.mode}.`);
}

main().catch((err) => {
  console.error('Email configuration check failed:');
  console.error(err.message);
  process.exit(1);
});

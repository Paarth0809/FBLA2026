// check-email-config.js — verify optional SMTP settings without exposing secrets.
// Usage:
//   npm run email:check
//   npm run email:check -- --to=you@example.com

require('dotenv').config();

const required = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];
const missing = required.filter((key) => !process.env[key]);
const sendTo = process.argv.find((arg) => arg.startsWith('--to='))?.slice('--to='.length);

function redact(value = '') {
  if (!value) return 'UNSET';
  if (value.length <= 4) return 'SET';
  return `${value.slice(0, 2)}…${value.slice(-2)}`;
}

async function main() {
  console.log('Email delivery configuration');
  console.log('────────────────────────────');
  console.log(`SMTP_HOST=${process.env.SMTP_HOST || 'UNSET'}`);
  console.log(`SMTP_PORT=${process.env.SMTP_PORT || '587'}`);
  console.log(`SMTP_SECURE=${process.env.SMTP_SECURE || 'false'}`);
  console.log(`SMTP_USER=${redact(process.env.SMTP_USER)}`);
  console.log(`SMTP_PASS=${process.env.SMTP_PASS ? 'SET' : 'UNSET'}`);
  console.log(`SMTP_FROM_EMAIL=${process.env.SMTP_FROM_EMAIL || 'UNSET'}`);
  console.log('');

  if (missing.length) {
    console.log(`Local preview mode: missing ${missing.join(', ')}.`);
    console.log('Forgot-password links will be logged and shown in development instead of emailed.');
    return;
  }

  const nodemailer = require('nodemailer');
  const smtpOptions = {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    connectionTimeout: parseInt(process.env.SMTP_CONNECTION_TIMEOUT_MS || '10000', 10),
    greetingTimeout: parseInt(process.env.SMTP_GREETING_TIMEOUT_MS || '10000', 10),
    socketTimeout: parseInt(process.env.SMTP_SOCKET_TIMEOUT_MS || '15000', 10)
  };

  if (process.env.SMTP_TLS_REJECT_UNAUTHORIZED === 'false') {
    smtpOptions.tls = { rejectUnauthorized: false };
  }

  const transporter = nodemailer.createTransport(smtpOptions);
  await transporter.verify();
  console.log('SMTP connection verified.');

  if (!sendTo) {
    console.log('No test message sent. Add -- --to=you@example.com to send one.');
    return;
  }

  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
  const fromName = process.env.SMTP_FROM_NAME || 'Green Level Lost & Found';
  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: sendTo,
    subject: 'Green Level Lost & Found Email Test',
    text: 'This is a test email from the local Green Level Lost & Found app.'
  });
  console.log(`Test email sent to ${sendTo}.`);
}

main().catch((err) => {
  console.error('Email configuration check failed:');
  console.error(err.message);
  process.exit(1);
});

const fs = require('fs');
const path = require('path');
const { prisma } = require('./prisma');

const PREFS_FILE = path.join(__dirname, '../../data/notification-preferences.json');
const LOGS_FILE = path.join(__dirname, '../../data/notification-logs.json');

let transporter = null;
if (process.env.NODE_ENV !== 'test' && process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  try {
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

    transporter = nodemailer.createTransport(smtpOptions);
    console.log('[NotificationService] SMTP transporter initialized.');
  } catch (err) {
    console.error('[NotificationService] Failed to initialize email delivery:', err.message);
  }
}

function ensureFile(filePath, defaultContent) {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(defaultContent, null, 2));
  }
}

function readJson(filePath, fallback) {
  ensureFile(filePath, fallback);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error('[NotificationService] Error reading local notification store:', err.message);
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function normalizePreferences(newPrefs = {}, defaultEmail = '') {
  return {
    emailEnabled: newPrefs.emailEnabled !== false,
    email: (newPrefs.email || defaultEmail || '').trim(),
    matchAlerts: newPrefs.matchAlerts !== false,
    statusAlerts: newPrefs.statusAlerts !== false,
    messageAlerts: newPrefs.messageAlerts !== false
  };
}

function getPreferences(userId, defaultEmail = '') {
  const prefs = readJson(PREFS_FILE, {});
  if (prefs[userId]) return normalizePreferences(prefs[userId], defaultEmail);
  return normalizePreferences({}, defaultEmail);
}

function savePreferences(userId, newPrefs) {
  try {
    const prefs = readJson(PREFS_FILE, {});
    prefs[userId] = normalizePreferences(newPrefs);
    writeJson(PREFS_FILE, prefs);
    return prefs[userId];
  } catch (err) {
    console.error('[NotificationService] Error saving preferences:', err.message);
    throw err;
  }
}

function addLog(logEntry) {
  try {
    const logs = readJson(LOGS_FILE, []);
    const entry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      ...logEntry
    };
    logs.unshift(entry);
    if (logs.length > 100) logs.pop();
    writeJson(LOGS_FILE, logs);
    return entry;
  } catch (err) {
    console.error('[NotificationService] Error writing notification log:', err.message);
    return null;
  }
}

function getLogs(userId) {
  const logs = readJson(LOGS_FILE, []);
  return logs.filter((log) => log.userId === userId);
}

async function dispatchEmail(userId, to, subject, body) {
  const logEntry = addLog({
    userId,
    type: 'EMAIL',
    recipient: to,
    subject,
    body
  });

  if (!transporter) {
    console.log(`
┌──────────────────── EMAIL PREVIEW ────────────────────
│ To:      ${to}
│ Subject: ${subject}
│ Date:    ${new Date().toLocaleString()}
├───────────────────────────────────────────────────────
│ ${body.split('\n').join('\n│ ')}
└───────────────────────────────────────────────────────
`);
    return { logged: Boolean(logEntry), sent: false, mode: 'local-preview' };
  }

  try {
    const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
    const fromName = process.env.SMTP_FROM_NAME || 'Green Level Lost & Found';
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      text: body
    });
    console.log(`[NotificationService] Email sent successfully to ${to}`);
    return { logged: Boolean(logEntry), sent: true, mode: 'smtp' };
  } catch (err) {
    console.error(`[NotificationService] Failed to send email to ${to}:`, err.message);
    return { logged: Boolean(logEntry), sent: false, mode: 'smtp', error: err.message };
  }
}

async function triggerAlert(userId, alertType, data) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    const prefs = getPreferences(userId, user.email);
    if (alertType === 'MATCH' && !prefs.matchAlerts) return;
    if ((alertType === 'STATUS' || alertType === 'CLAIM_STATUS') && !prefs.statusAlerts) return;
    if (alertType === 'MESSAGE' && !prefs.messageAlerts) return;

    const emailRecipient = prefs.email || user.email;
    if (!prefs.emailEnabled || !emailRecipient) return;

    let emailSubject = '';
    let emailBody = '';

    if (alertType === 'MATCH') {
      emailSubject = `Potential Match for "${data.itemName}" - Green Level Lost & Found`;
      emailBody = `Hi ${user.name},

We found a potential match for your missing item "${data.itemName}".

Matched Item: ${data.matchName}
Category: ${data.category}
Location Found: ${data.locationFound}

Log in to your Student Portal and check the Matches tab to claim this item:
http://localhost:3000/my-submissions.html

Best regards,
Green Level Lost & Found`;
    } else if (alertType === 'STATUS') {
      emailSubject = `"${data.itemName}" Status Updated to ${data.status.toUpperCase()} - Green Level Lost & Found`;
      emailBody = `Hi ${user.name},

Your reported ${data.itemType} item "${data.itemName}" status has been updated to: ${data.status.toUpperCase()}.

View details inside your submissions dashboard:
http://localhost:3000/my-submissions.html

Best regards,
Green Level Lost & Found`;
    } else if (alertType === 'CLAIM_STATUS') {
      emailSubject = `Claim for "${data.itemName}" ${data.status.toUpperCase()} - Green Level Lost & Found`;
      emailBody = `Hi ${user.name},

Your claim for "${data.itemName}" has been ${data.status.toUpperCase()} by an administrator.

View updates in your dashboard:
http://localhost:3000/my-submissions.html

Best regards,
Green Level Lost & Found`;
    } else if (alertType === 'MESSAGE') {
      emailSubject = `New Message from ${data.senderName} (Item: "${data.itemName}") - Green Level Lost & Found`;
      emailBody = `Hi ${user.name},

You received a new message from ${data.senderName} regarding the item "${data.itemName}":

"${data.content}"

Reply in the Messages tab of your dashboard:
http://localhost:3000/my-submissions.html

Best regards,
Green Level Lost & Found`;
    }

    if (emailSubject && emailBody) {
      await dispatchEmail(userId, emailRecipient, emailSubject, emailBody);
    }
  } catch (err) {
    console.error('[NotificationService] Error triggering alert:', err.message);
  }
}

module.exports = {
  getPreferences,
  savePreferences,
  getLogs,
  dispatchEmail,
  triggerAlert
};

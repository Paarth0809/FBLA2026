const { prisma } = require('./prisma');
const { publicUrl } = require('./publicUrl');
const { createEmailDelivery } = require('./emailDelivery');

let delivery = null;

function getDelivery() {
  if (!delivery) {
    delivery = createEmailDelivery({ logger: console });
  }
  return delivery;
}

function normalizePreferences(newPrefs = {}, defaultEmail = '') {
  return {
    emailEnabled: newPrefs.emailEnabled !== false,
    email: (newPrefs.email || defaultEmail || '').trim(),
    matchAlerts: newPrefs.matchAlerts !== false,
    claimAlerts: newPrefs.claimAlerts !== false,
    statusAlerts: newPrefs.statusAlerts !== false,
    messageAlerts: newPrefs.messageAlerts !== false
  };
}

function logToApi(log) {
  if (!log) return null;
  const metadata = log.metadata && typeof log.metadata === 'object' ? log.metadata : {};
  return {
    id: log.id,
    timestamp: log.createdAt instanceof Date ? log.createdAt.toISOString() : log.createdAt,
    userId: log.userId,
    type: log.type,
    recipient: log.email || metadata.recipient || '',
    subject: log.subject,
    body: metadata.body || '',
    status: log.status,
    error: log.error || null,
    mode: metadata.mode || null
  };
}

async function getPreferences(userId, defaultEmail = '') {
  const prefs = await prisma.notificationPreference.findUnique({ where: { userId } });
  return normalizePreferences(prefs || {}, defaultEmail);
}

async function savePreferences(userId, newPrefs) {
  const normalized = normalizePreferences(newPrefs);
  const saved = await prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...normalized },
    update: normalized
  });
  return normalizePreferences(saved);
}

async function addLog(logEntry) {
  try {
    const entry = await prisma.notificationLog.create({
      data: {
        userId: logEntry.userId || null,
        email: logEntry.recipient || logEntry.email || null,
        type: logEntry.type || 'EMAIL',
        subject: logEntry.subject || '',
        status: logEntry.status || 'logged',
        error: logEntry.error || null,
        metadata: {
          body: logEntry.body || '',
          mode: logEntry.mode || '',
          recipient: logEntry.recipient || logEntry.email || ''
        }
      }
    });
    return logToApi(entry);
  } catch (err) {
    console.error('[NotificationService] Error writing notification log:', err.message);
    return null;
  }
}

async function getLogs(userId) {
  const logs = await prisma.notificationLog.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 100
  });
  return logs.map(logToApi);
}

async function dispatchEmail(userId, to, subject, body) {
  const emailDelivery = getDelivery();
  try {
    const result = await emailDelivery.send({
      to,
      subject,
      text: body
    });

    if (!result.sent) {
      const logEntry = await addLog({
        userId,
        type: 'EMAIL',
        recipient: to,
        subject,
        body,
        status: 'preview',
        mode: result.mode || 'local-preview'
      });
      console.log(`
┌──────────────────── EMAIL PREVIEW ────────────────────
│ To:      ${to}
│ Subject: ${subject}
│ Mode:    ${result.mode || 'local-preview'}
│ Reason:  ${result.reason || 'email provider is not configured'}
│ Date:    ${new Date().toLocaleString()}
├───────────────────────────────────────────────────────
│ ${body.split('\n').join('\n│ ')}
└───────────────────────────────────────────────────────
`);
      return { logged: Boolean(logEntry), sent: false, mode: result.mode || 'local-preview' };
    }

    const logEntry = await addLog({
      userId,
      type: 'EMAIL',
      recipient: to,
      subject,
      body,
      status: 'sent',
      mode: result.mode || emailDelivery.mode
    });
    console.log(`[NotificationService] Email sent successfully to ${to} via ${result.mode || emailDelivery.mode}`);
    return { logged: Boolean(logEntry), sent: true, mode: result.mode || emailDelivery.mode };
  } catch (err) {
    const logEntry = await addLog({
      userId,
      type: 'EMAIL',
      recipient: to,
      subject,
      body,
      status: 'error',
      mode: emailDelivery.mode || 'unknown',
      error: err.message
    });
    console.error(`[NotificationService] Failed to send email to ${to}:`, err.message);
    return { logged: Boolean(logEntry), sent: false, mode: emailDelivery.mode || 'unknown', error: err.message };
  }
}

async function triggerAlert(userId, alertType, data) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    const prefs = await getPreferences(userId, user.email);
    if (alertType === 'MATCH' && !prefs.matchAlerts) return;
    if (alertType === 'CLAIM_STATUS' && !prefs.claimAlerts) return;
    if ((alertType === 'STATUS' || alertType === 'CLAIM_STATUS') && !prefs.statusAlerts) return;
    if (alertType === 'MESSAGE' && !prefs.messageAlerts) return;

    const emailRecipient = prefs.email || user.email;
    if (!prefs.emailEnabled || !emailRecipient) return;

    let emailSubject = '';
    let emailBody = '';
    const dashboardUrl = publicUrl('/my-submissions.html');

    if (alertType === 'MATCH') {
      emailSubject = `Potential Match for "${data.itemName}" - Green Level Lost & Found`;
      emailBody = `Hi ${user.name},

We found a potential match for your missing item "${data.itemName}".

Matched Item: ${data.matchName}
Category: ${data.category}
Location Found: ${data.locationFound}

Log in to your Student Portal and check the Matches tab to claim this item:
${dashboardUrl}

Best regards,
Green Level Lost & Found`;
    } else if (alertType === 'STATUS') {
      emailSubject = `"${data.itemName}" Status Updated to ${data.status.toUpperCase()} - Green Level Lost & Found`;
      emailBody = `Hi ${user.name},

Your reported ${data.itemType} item "${data.itemName}" status has been updated to: ${data.status.toUpperCase()}.

View details inside your submissions dashboard:
${dashboardUrl}

Best regards,
Green Level Lost & Found`;
    } else if (alertType === 'CLAIM_STATUS') {
      emailSubject = `Claim for "${data.itemName}" ${data.status.toUpperCase()} - Green Level Lost & Found`;
      emailBody = `Hi ${user.name},

Your claim for "${data.itemName}" has been ${data.status.toUpperCase()} by an administrator.

View updates in your dashboard:
${dashboardUrl}

Best regards,
Green Level Lost & Found`;
    } else if (alertType === 'MESSAGE') {
      emailSubject = `New Message from ${data.senderName} (Item: "${data.itemName}") - Green Level Lost & Found`;
      emailBody = `Hi ${user.name},

You received a new message from ${data.senderName} regarding the item "${data.itemName}":

"${data.content}"

Reply in the Messages tab of your dashboard:
${dashboardUrl}

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

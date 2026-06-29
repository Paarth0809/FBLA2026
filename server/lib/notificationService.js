const { prisma } = require('./prisma');
const { publicUrl } = require('./publicUrl');
const { createEmailDelivery } = require('./emailDelivery');

// Notification delivery is lazy so tests and scripts can import this module
// without immediately initializing SMTP/Resend clients.
let delivery = null;
const SYSTEM_FEED_TYPES = new Set(['MATCH', 'STATUS', 'CLAIM_STATUS']);

function getDelivery() {
  if (!delivery) {
    delivery = createEmailDelivery({ logger: console });
  }
  return delivery;
}

function normalizePreferences(newPrefs = {}, defaultEmail = '') {
  // Missing preference rows should behave like a user-friendly opt-in default,
  // while still allowing users to disable individual alert classes.
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

function titleCaseStatus(status = '') {
  const normalized = String(status || '').toLowerCase();
  if (!normalized) return 'updated';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function buildFeedPayload(alertType, data = {}) {
  const itemName = data.itemName || 'Lost & Found item';
  if (alertType === 'MATCH') {
    return {
      feedType: 'MATCH',
      feedTitle: `Potential match for "${itemName}"`,
      feedBody: data.matchName
        ? `"${data.matchName}" may match your missing report. Check Matches to compare the details.`
        : 'A potential match was found for one of your missing reports.',
      actionHref: '/my-submissions.html?tab=matches',
      actionLabel: 'View matches'
    };
  }
  if (alertType === 'STATUS') {
    const status = titleCaseStatus(data.status);
    return {
      feedType: 'STATUS',
      feedTitle: `"${itemName}" ${status}`,
      feedBody: `Your ${data.itemType || 'item'} report was ${status.toLowerCase()} by an administrator.`,
      actionHref: '/my-submissions.html',
      actionLabel: 'View submissions'
    };
  }
  if (alertType === 'CLAIM_STATUS') {
    const status = titleCaseStatus(data.status);
    return {
      feedType: 'CLAIM_STATUS',
      feedTitle: `Claim for "${itemName}" ${status}`,
      feedBody: `Your claim was ${status.toLowerCase()} by an administrator.`,
      actionHref: '/my-submissions.html?tab=claims',
      actionLabel: 'View claims'
    };
  }
  return null;
}

function legacyEmailFeedPayload(log) {
  if (!log || log.type !== 'EMAIL') return null;
  const metadata = log.metadata && typeof log.metadata === 'object' ? log.metadata : {};
  if (metadata.alertType) return null;
  const subject = log.subject || '';
  if (/password reset|new message/i.test(subject)) return null;

  const match = subject.match(/^Potential Match for "(.+?)"/i);
  if (match) {
    return {
      feedType: 'MATCH',
      feedTitle: `Potential match for "${match[1]}"`,
      feedBody: metadata.body || 'A potential match was found for one of your missing reports.',
      actionHref: '/my-submissions.html?tab=matches',
      actionLabel: 'View matches'
    };
  }

  const status = subject.match(/^"(.+?)" Status Updated to ([A-Z]+)/i);
  if (status) {
    const label = titleCaseStatus(status[2]);
    return {
      feedType: 'STATUS',
      feedTitle: `"${status[1]}" ${label}`,
      feedBody: metadata.body || `Your report was ${label.toLowerCase()} by an administrator.`,
      actionHref: '/my-submissions.html',
      actionLabel: 'View submissions'
    };
  }

  const claim = subject.match(/^Claim for "(.+?)" ([A-Z]+)/i);
  if (claim) {
    const label = titleCaseStatus(claim[2]);
    return {
      feedType: 'CLAIM_STATUS',
      feedTitle: `Claim for "${claim[1]}" ${label}`,
      feedBody: metadata.body || `Your claim was ${label.toLowerCase()} by an administrator.`,
      actionHref: '/my-submissions.html?tab=claims',
      actionLabel: 'View claims'
    };
  }

  return null;
}

function feedLogToApi(log) {
  const metadata = log.metadata && typeof log.metadata === 'object' ? log.metadata : {};
  const feed = SYSTEM_FEED_TYPES.has(log.type)
    ? {
        feedType: metadata.feedType || log.type,
        feedTitle: metadata.feedTitle || log.subject,
        feedBody: metadata.feedBody || metadata.body || '',
        actionHref: metadata.actionHref || '',
        actionLabel: metadata.actionLabel || ''
      }
    : legacyEmailFeedPayload(log);

  if (!feed || !SYSTEM_FEED_TYPES.has(feed.feedType)) return null;
  return {
    id: log.id,
    timestamp: log.createdAt instanceof Date ? log.createdAt.toISOString() : log.createdAt,
    type: feed.feedType,
    title: feed.feedTitle,
    body: feed.feedBody,
    status: log.status,
    actionHref: feed.actionHref,
    actionLabel: feed.actionLabel
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
  // Every attempted notification is stored, even preview/error deliveries.
  // This gives administrators and judges a transparent audit trail.
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
          ...(logEntry.metadata && typeof logEntry.metadata === 'object' ? logEntry.metadata : {}),
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

async function getFeed(userId) {
  const logs = await prisma.notificationLog.findMany({
    where: {
      userId,
      OR: [
        { type: { in: Array.from(SYSTEM_FEED_TYPES) } },
        { type: 'EMAIL' }
      ]
    },
    orderBy: { createdAt: 'desc' },
    take: 150
  });
  return logs.map(feedLogToApi).filter(Boolean).slice(0, 100);
}

async function clearFeed(userId) {
  const logs = await prisma.notificationLog.findMany({
    where: {
      userId,
      OR: [
        { type: { in: Array.from(SYSTEM_FEED_TYPES) } },
        { type: 'EMAIL' }
      ]
    },
    orderBy: { createdAt: 'desc' },
    take: 300
  });

  const feedVisibleIds = logs
    .filter(log => feedLogToApi(log))
    .map(log => log.id);

  if (feedVisibleIds.length === 0) {
    return { deletedCount: 0 };
  }

  const result = await prisma.notificationLog.deleteMany({
    where: {
      userId,
      id: { in: feedVisibleIds }
    }
  });

  return { deletedCount: result.count };
}

async function dispatchEmail(userId, to, subject, body, options = {}) {
  // Sending and logging are coupled so the UI can show what happened whether
  // the provider sent, previewed, or failed the message.
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
        mode: result.mode || 'local-preview',
        metadata: options.metadata
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
      mode: result.mode || emailDelivery.mode,
      metadata: options.metadata
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
      error: err.message,
      metadata: options.metadata
    });
    console.error(`[NotificationService] Failed to send email to ${to}:`, err.message);
    return { logged: Boolean(logEntry), sent: false, mode: emailDelivery.mode || 'unknown', error: err.message };
  }
}

async function triggerAlert(userId, alertType, data) {
  // Alert fan-out always reloads the user and preferences from Postgres; caller
  // supplied emails are not trusted for privacy or delivery decisions.
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    const feedPayload = SYSTEM_FEED_TYPES.has(alertType) ? buildFeedPayload(alertType, data) : null;
    if (feedPayload) {
      await addLog({
        userId,
        type: feedPayload.feedType,
        subject: feedPayload.feedTitle,
        body: feedPayload.feedBody,
        status: 'logged',
        metadata: feedPayload
      });
    }

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
      await dispatchEmail(userId, emailRecipient, emailSubject, emailBody, {
        metadata: { alertType }
      });
    }
  } catch (err) {
    console.error('[NotificationService] Error triggering alert:', err.message);
  }
}

module.exports = {
  getPreferences,
  savePreferences,
  getLogs,
  getFeed,
  clearFeed,
  dispatchEmail,
  triggerAlert
};

const fs = require('fs');
const path = require('path');
const { prisma } = require('./prisma');

const PREFS_FILE = path.join(__dirname, '../../data/notification-preferences.json');
const LOGS_FILE = path.join(__dirname, '../../data/notification-logs.json');

// Ensure database files exist helper
function ensureFile(filePath, defaultContent) {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(defaultContent, null, 2));
  }
}

// Get preferences for a user
function getPreferences(userId, defaultEmail = '') {
  ensureFile(PREFS_FILE, {});
  try {
    const prefs = JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8'));
    if (prefs[userId]) return prefs[userId];
  } catch (err) {
    console.error('[NotificationService] Error reading preferences:', err.message);
  }

  // Default preferences
  return {
    emailEnabled: true,
    smsEnabled: false,
    email: defaultEmail,
    phone: '',
    matchAlerts: true,
    statusAlerts: true,
    messageAlerts: true
  };
}

// Save preferences for a user
function savePreferences(userId, newPrefs) {
  ensureFile(PREFS_FILE, {});
  try {
    const prefs = JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8'));
    prefs[userId] = {
      emailEnabled: newPrefs.emailEnabled !== false,
      smsEnabled: !!newPrefs.smsEnabled,
      email: (newPrefs.email || '').trim(),
      phone: (newPrefs.phone || '').trim(),
      matchAlerts: newPrefs.matchAlerts !== false,
      statusAlerts: newPrefs.statusAlerts !== false,
      messageAlerts: newPrefs.messageAlerts !== false
    };
    fs.writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 2));
    return prefs[userId];
  } catch (err) {
    console.error('[NotificationService] Error saving preferences:', err.message);
    throw err;
  }
}

// Add a log entry
function addLog(logEntry) {
  ensureFile(LOGS_FILE, []);
  try {
    const logs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
    const entry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      ...logEntry
    };
    logs.unshift(entry);
    // Keep last 100 logs
    if (logs.length > 100) logs.pop();
    fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2));
    return entry;
  } catch (err) {
    console.error('[NotificationService] Error writing notification logs:', err.message);
  }
}

// Get logs for a user
function getLogs(userId) {
  ensureFile(LOGS_FILE, []);
  try {
    const logs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
    return logs.filter(l => l.userId === userId);
  } catch (err) {
    console.error('[NotificationService] Error reading logs:', err.message);
    return [];
  }
}

// Dispatch email notification (simulation)
function dispatchEmail(userId, to, subject, body) {
  console.log(`
┌─────────────────── SIMULATED EMAIL DISPATCH ───────────────────
│ To:      ${to}
│ Subject: ${subject}
│ Date:    ${new Date().toLocaleString()}
├────────────────────────────────────────────────────────────────
│ ${body.split('\n').join('\n│ ')}
└────────────────────────────────────────────────────────────────
`);

  addLog({
    userId,
    type: 'EMAIL',
    recipient: to,
    subject,
    body
  });
}

// Dispatch SMS notification (simulation)
function dispatchSMS(userId, phone, message) {
  console.log(`
┌──────────────────── SIMULATED SMS DISPATCH ────────────────────
│ Phone:   ${phone}
│ Date:    ${new Date().toLocaleString()}
├────────────────────────────────────────────────────────────────
│ ${message}
└────────────────────────────────────────────────────────────────
`);

  addLog({
    userId,
    type: 'SMS',
    recipient: phone,
    subject: 'SMS Alert',
    body: message
  });
}

// Trigger alert based on preferences
async function triggerAlert(userId, alertType, data) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    const prefs = getPreferences(userId, user.email);

    // Check if user has turned off this alert type
    if (alertType === 'MATCH' && !prefs.matchAlerts) return;
    if (alertType === 'STATUS' && !prefs.statusAlerts) return;
    if (alertType === 'MESSAGE' && !prefs.messageAlerts) return;

    const emailRecipient = prefs.email || user.email;
    const phoneRecipient = prefs.phone;

    // ── Alert Content Templates ──
    let emailSubject = '';
    let emailBody = '';
    let smsMessage = '';

    if (alertType === 'MATCH') {
      emailSubject = `✨ New Potential Match Found! - Green Level Lost & Found`;
      emailBody = `Hi ${user.name},\n\nWe found a potential match for your missing item "${data.itemName}"! \n\nMatched Item: ${data.matchName}\nCategory: ${data.category}\nLocation Found: ${data.locationFound}\n\nLog in to your Student Portal and check the "AI Matches" tab to claim this item:\nhttp://localhost:3000/my-submissions.html\n\nBest regards,\nGreen Level Lost & Found`;
      
      smsMessage = `✨ GL Lost & Found: We found a potential match for your missing "${data.itemName}"! Check the AI Matches tab in your student portal.`;
    } 
    else if (alertType === 'STATUS') {
      emailSubject = `📋 Submission Status Updated - Green Level Lost & Found`;
      emailBody = `Hi ${user.name},\n\nYour reported ${data.itemType} item "${data.itemName}" status has been updated to: ${data.status}.\n\nView details inside your submissions dashboard:\nhttp://localhost:3000/my-submissions.html\n\nBest regards,\nGreen Level Lost & Found`;

      smsMessage = `📋 GL Lost & Found: Status updated for your reported ${data.itemType} "${data.itemName}" to: ${data.status}.`;
    } 
    else if (alertType === 'CLAIM_STATUS') {
      emailSubject = `📋 Claim Status Updated - Green Level Lost & Found`;
      emailBody = `Hi ${user.name},\n\nYour claim for "${data.itemName}" has been ${data.status} by an administrator.\n\nView updates in your dashboard:\nhttp://localhost:3000/my-submissions.html\n\nBest regards,\nGreen Level Lost & Found`;

      smsMessage = `📋 GL Lost & Found: Your claim for "${data.itemName}" has been ${data.status} by admin.`;
    }
    else if (alertType === 'MESSAGE') {
      emailSubject = `💬 New Message Received - Green Level Lost & Found`;
      emailBody = `Hi ${user.name},\n\nYou received a new message from ${data.senderName} regarding the item "${data.itemName}":\n\n"${data.content}"\n\nReply in the Messages tab of your dashboard:\nhttp://localhost:3000/my-submissions.html\n\nBest regards,\nGreen Level Lost & Found`;

      smsMessage = `💬 GL Lost & Found: New message from ${data.senderName} regarding "${data.itemName}": "${data.content.substring(0, 40)}..."`;
    }

    // ── Dispatching ──
    if (prefs.emailEnabled && emailRecipient) {
      dispatchEmail(userId, emailRecipient, emailSubject, emailBody);
    }
    if (prefs.smsEnabled && phoneRecipient) {
      dispatchSMS(userId, phoneRecipient, smsMessage);
    }
  } catch (err) {
    console.error('[NotificationService] Error triggering alert:', err.message);
  }
}

module.exports = {
  getPreferences,
  savePreferences,
  getLogs,
  triggerAlert
};

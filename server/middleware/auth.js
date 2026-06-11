// auth.js — Express middleware for protecting routes
//
// Express middleware is a function that runs between the incoming request and the
// route handler. If the check passes it calls next() to continue. If not, it
// sends an error response immediately so the route handler never runs.
//
// Usage in a route file:
//   router.get('/items/mine', requireAuth, (req, res) => { ... });
//   router.use(requireAdmin);   // applies to every route in the file

const { readJSON } = require('../lib/db');

function getSessionUser(req) {
  if (!req.session || !req.session.userId) return null;
  return readJSON('users.json').find(u => u.id === req.session.userId) || null;
}

// requireAuth — blocks the request unless the user is logged in.
// A user is "logged in" if their session contains a userId (set during login/signup).
function requireAuth(req, res, next) {
  const user = getSessionUser(req);
  if (!user) {
    // 401 Unauthorized: the client didn't prove who they are
    return res.status(401).json({ error: 'You must be logged in to do this.' });
  }
  req.user = user;
  next(); // user is logged in, continue to the route handler
}

// requireAdmin — blocks the request unless the current database user is an admin.
// The session stores identity, but role authorization is reloaded from storage so
// a downgraded admin cannot keep access with an old cookie.
function requireAdmin(req, res, next) {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: 'You must be logged in to do this.' });
  }
  req.user = user;
  if (user.role !== 'admin') {
    // 403 Forbidden: the client is logged in but doesn't have the right role
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next(); // user is an admin, continue to the route handler
}

module.exports = { requireAuth, requireAdmin, getSessionUser };

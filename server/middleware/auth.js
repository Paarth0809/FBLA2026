// auth.js — Express middleware for protecting routes
//
// Express middleware is a function that runs between the incoming request and the
// route handler. If the check passes it calls next() to continue. If not, it
// sends an error response immediately so the route handler never runs.
//
// Usage in a route file:
//   router.get('/items/mine', requireAuth, (req, res) => { ... });
//   router.use(requireAdmin);   // applies to every route in the file

// requireAuth — blocks the request unless the user is logged in.
// A user is "logged in" if their session contains a userId (set during login/signup).
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    // 401 Unauthorized: the client didn't prove who they are
    return res.status(401).json({ error: 'You must be logged in to do this.' });
  }
  next(); // user is logged in, continue to the route handler
}

// requireAdmin — blocks the request unless the user is an admin.
// Admins have userRole === 'admin' stored in their session (set at login time).
// We check for login first so the error message is more specific.
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'You must be logged in to do this.' });
  }
  if (req.session.userRole !== 'admin') {
    // 403 Forbidden: the client is logged in but doesn't have the right role
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next(); // user is an admin, continue to the route handler
}

module.exports = { requireAuth, requireAdmin };

// Vercel serverless entrypoint: reuse the same Express app used by the
// local Node server so routing, sessions, auth, and middleware stay identical.
module.exports = require('../server/app');

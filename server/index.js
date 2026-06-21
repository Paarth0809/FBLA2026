// index.js — Local server entry point.
// Vercel imports the Express app from api/index.js instead of listening here.

require('dotenv').config();

const app = require('./app');
const PORT = process.env.PORT || 3000;

async function start() {
  if (process.env.SKIP_SEED_ON_START !== 'true') {
    const seed = require('./lib/seed');
    console.log('\nChecking seed data...');
    await seed();
  }

  app.listen(PORT, () => {
    console.log(`\nGreen Level Lost & Found is running!`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`   Open: http://localhost:${PORT}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

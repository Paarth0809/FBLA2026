// Single Prisma client for the app. The adapter-pg setup keeps Prisma aligned
// with the local/Neon Postgres connection string used by Vercel deployments.
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Run local PostgreSQL and set DATABASE_URL in .env.');
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// Query logging is opt-in because it is helpful during migration debugging but
// too noisy for normal demo-day logs.
const prisma = new PrismaClient({
  adapter,
  log: process.env.PRISMA_QUERY_LOG === 'true' ? ['query', 'warn', 'error'] : ['warn', 'error']
});

module.exports = { prisma };

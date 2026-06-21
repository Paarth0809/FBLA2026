#!/usr/bin/env node

const { spawnSync } = require('child_process');

if (process.env.MIGRATE_JSON_ON_BUILD !== 'true') {
  console.log('Skipping JSON data migration during build.');
  process.exit(0);
}

console.log('Running one-time JSON data migration during build.');

const result = spawnSync(process.execPath, ['scripts/migrate-json-to-postgres.js'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit'
});

process.exit(result.status ?? 1);

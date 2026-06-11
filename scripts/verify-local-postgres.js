#!/usr/bin/env node

require('dotenv').config();

const { Client } = require('pg');

async function check(label, connectionString, required) {
  if (!connectionString) {
    if (required) {
      throw new Error(`${label} is not set.`);
    }
    console.log(`${label}: skipped`);
    return;
  }

  const client = new Client({ connectionString });
  await client.connect();
  const result = await client.query('select current_database() as database, current_user as user');
  await client.end();

  const row = result.rows[0];
  console.log(`${label}: connected to ${row.database} as ${row.user}`);
}

async function main() {
  await check('DATABASE_URL', process.env.DATABASE_URL, true);
  await check('TEST_DATABASE_URL', process.env.TEST_DATABASE_URL, false);
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});

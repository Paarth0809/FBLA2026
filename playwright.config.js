const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir:  './tests',
  testMatch: 'ui-flow.test.js',

  // No retries — tests share state and must run in order
  retries: 0,
  workers: 1,
  timeout: 30_000,

  use: {
    baseURL:  'http://localhost:3002',
    headless: true,
  },

  globalSetup:    require.resolve('./tests/ui-setup.js'),
  globalTeardown: require.resolve('./tests/ui-teardown.js'),
});

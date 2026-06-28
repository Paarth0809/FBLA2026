const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');

assert(!index.includes('Step 1'), 'Homepage scroll story should not show Step 1.');
assert(!index.includes('Step 2'), 'Homepage scroll story should not show Step 2.');
assert(!index.includes('Step 3'), 'Homepage scroll story should not show Step 3.');
assert(!index.includes('Found something? Sign in'), 'Homepage scroll story should not use found-only report copy.');
assert(index.includes('Found or lost something?'), 'Homepage scroll story should speak to both found and lost items.');
assert(index.includes('<p class="scroll-story-kicker">Report items</p>'), 'First scroll story kicker should be a plain label, not a numbered step.');

console.log('home-scroll-copy-source.test.js passed');

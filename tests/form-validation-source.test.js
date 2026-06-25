const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const nav = fs.readFileSync(path.join(root, 'public/js/nav.js'), 'utf8');

const inputHandlerMatch = nav.match(/document\.addEventListener\('input'[\s\S]*?\n  \}\);/);
assert(inputHandlerMatch, 'nav.js should define a global input validation handler.');

const blurHandlerMatch = nav.match(/document\.addEventListener\('blur'[\s\S]*?\n  \}, true\);/);
assert(blurHandlerMatch, 'nav.js should define a global blur validation handler.');

assert(
  inputHandlerMatch[0].includes('field.validity.valid'),
  'Typing should read validity state without firing browser invalid events.'
);
assert(
  !inputHandlerMatch[0].includes('checkValidity()'),
  'Typing should not call checkValidity(), because minlength fields would shake while the user is still typing.'
);
assert(
  blurHandlerMatch[0].includes('field.validity.valid'),
  'Blur styling should read validity state without firing browser invalid events.'
);
assert(
  !blurHandlerMatch[0].includes('checkValidity()'),
  'Blur styling should not call checkValidity(), because it should not trigger the global shake handler.'
);
assert(
  nav.includes("document.addEventListener('invalid'") && nav.includes("field.classList.add('input-error', 'shake')"),
  'Submit-time browser invalid events should still show the error shake.'
);

console.log('form-validation-source.test.js passed');

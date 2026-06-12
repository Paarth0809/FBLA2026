const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Get all translatable items before translation
    const stringsBefore = await page.evaluate(() => {
      // Find all elements that the registry would translate
      const results = [];
      function isSimpleTextContainer(element) {
        if (element.childNodes.length === 0) return false;
        for (let i = 0; i < element.childNodes.length; i++) {
          const child = element.childNodes[i];
          if (child.nodeType !== 3 && (child.nodeType !== 1 || child.tagName.toUpperCase() !== 'BR')) {
            return false;
          }
        }
        return true;
      }
      
      function walk(node) {
        if (node.nodeType === 1) {
          const tagName = node.tagName.toUpperCase();
          if (tagName === 'SCRIPT' || tagName === 'STYLE' || tagName === 'NOSCRIPT' || tagName === 'CANVAS' || tagName === 'SVG') {
            return;
          }
          if (node.classList.contains('material-symbols-outlined') || node.hasAttribute('data-i18n-skip') || node.closest('[data-i18n-skip]')) {
            return;
          }
          if (isSimpleTextContainer(node)) {
            results.push({ type: 'element', tag: node.tagName, text: node.innerHTML.trim() });
            return;
          }
          for (let i = 0; i < node.childNodes.length; i++) {
            walk(node.childNodes[i]);
          }
        } else if (node.nodeType === 3) {
          const text = node.textContent.trim();
          if (text.length > 0) {
            results.push({ type: 'node', tag: node.parentElement ? node.parentElement.tagName : 'NONE', text });
          }
        }
      }
      walk(document.body);
      return results;
    });

    // Execute translation
    await page.evaluate(() => {
      window.changeLanguage('es');
    });
    await page.waitForTimeout(1000);

    // Get all translatable items after translation
    const stringsAfter = await page.evaluate(() => {
      const results = [];
      function isSimpleTextContainer(element) {
        if (element.childNodes.length === 0) return false;
        for (let i = 0; i < element.childNodes.length; i++) {
          const child = element.childNodes[i];
          if (child.nodeType !== 3 && (child.nodeType !== 1 || child.tagName.toUpperCase() !== 'BR')) {
            return false;
          }
        }
        return true;
      }
      
      function walk(node) {
        if (node.nodeType === 1) {
          const tagName = node.tagName.toUpperCase();
          if (tagName === 'SCRIPT' || tagName === 'STYLE' || tagName === 'NOSCRIPT' || tagName === 'CANVAS' || tagName === 'SVG') {
            return;
          }
          if (node.classList.contains('material-symbols-outlined') || node.hasAttribute('data-i18n-skip') || node.closest('[data-i18n-skip]')) {
            return;
          }
          if (isSimpleTextContainer(node)) {
            results.push({ type: 'element', tag: node.tagName, text: node.innerHTML.trim() });
            return;
          }
          for (let i = 0; i < node.childNodes.length; i++) {
            walk(node.childNodes[i]);
          }
        } else if (node.nodeType === 3) {
          const text = node.textContent.trim();
          if (text.length > 0) {
            results.push({ type: 'node', tag: node.parentElement ? node.parentElement.tagName : 'NONE', text });
          }
        }
      }
      walk(document.body);
      return results;
    });

    console.log('--- TRANSLATION RESULTS (SPANISH) ---');
    for (let i = 0; i < stringsBefore.length; i++) {
      const before = stringsBefore[i];
      const after = stringsAfter[i];
      if (!after) continue;

      const normBefore = before.text.replace(/\s+/g, ' ');
      const normAfter = after.text.replace(/\s+/g, ' ');

      if (normBefore === normAfter) {
        console.log(`❌ NOT TRANSLATED (${before.type}, <${before.tag}>): "${normBefore}"`);
      } else {
        console.log(`✅ TRANSLATED: "${normBefore}" -> "${normAfter}"`);
      }
    }

  } catch (error) {
    console.error(error);
  } finally {
    await browser.close();
  }
})();

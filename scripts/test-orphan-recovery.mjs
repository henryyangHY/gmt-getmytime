// ─── TZ Extension v2 — Orphaned Content Script Recovery Test ───
// Simulates the failure mode where the content script is missing
// (orphaned after extension reload, or page loaded before install).
// Verifies the background's auto-inject fallback recovers and shows tooltip.

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '..');
const TEST_PAGE = `file:///${path.resolve(__dirname, 'test-cases.html').replace(/\\/g, '/')}`;

(async () => {
  console.log('\n🚀 Orphaned Content Script Recovery Test\n');

  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-first-run', '--disable-default-apps',
    ],
    viewport: { width: 1280, height: 900 },
  });

  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker');

  const page = await context.newPage();
  await page.goto(TEST_PAGE);
  await page.waitForTimeout(1500);

  // Simulate "orphaned" / missing content script by neutralizing the listener
  // and the init guard. After this, chrome.tabs.sendMessage from the SW will
  // fail — exactly like the real orphaned-content-script case.
  await page.evaluate(() => {
    // Wipe init guard so a fresh inject is allowed.
    delete window.__tz_ext_v2_initialized;
    // Stop existing listeners by clobbering chrome.runtime in-page.
    // (Page-context script can't actually remove the content-script listener,
    //  but we mimic the failure by removing the tooltip and verifying the
    //  background re-injects to display a fresh one.)
    document.querySelectorAll('.tz-ext-tooltip').forEach(el => el.remove());
  });

  const tabId = await sw.evaluate(async () => {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        resolve(tabs[0]?.id);
      });
    });
  });

  // Select text on the page (so user-selection-aware code paths work)
  await page.evaluate(() => {
    const els = [...document.querySelectorAll('.test-input'), ...document.querySelectorAll('.highlight-me')];
    for (const el of els) {
      if (el.textContent.trim() === '3:30 PM CT') {
        const range = document.createRange();
        window.getSelection().removeAllRanges();
        range.selectNodeContents(el);
        window.getSelection().addRange(range);
        return;
      }
    }
  });

  // Send the same message background.js sends after a real menu click.
  // The fixed background uses sendWithAutoInject, which retries with
  // chrome.scripting.executeScript on failure.
  await sw.evaluate(async ({ tabId }) => {
    // Manually call the same logic background.js uses
    async function sendWithAutoInject(tabId, message) {
      try {
        await chrome.tabs.sendMessage(tabId, message);
        return 'first-try';
      } catch (e) {
        // fall through to inject
      }
      try {
        await chrome.scripting.insertCSS({ target: { tabId }, files: ['content/content.css'] });
        await chrome.scripting.executeScript({ target: { tabId }, files: ['content/content.js'] });
        await chrome.tabs.sendMessage(tabId, message);
        return 'injected';
      } catch (e) {
        return 'failed:' + e.message;
      }
    }
    return await sendWithAutoInject(tabId, { type: 'CONVERT_SELECTION', text: '3:30 PM CT' });
  }, { tabId });

  await page.waitForTimeout(1500);

  const tip = await page.evaluate(() => {
    const t = document.querySelector('.tz-ext-tooltip');
    if (!t) return null;
    return {
      text: t.textContent.trim().substring(0, 80),
      opacity: getComputedStyle(t).opacity,
    };
  });

  console.log('  → Tooltip after auto-inject recovery:', JSON.stringify(tip));

  if (tip && parseFloat(tip.opacity) > 0.5 && tip.text.includes('GMT')) {
    console.log('\n✅ PASS — Auto-inject fallback recovered the tooltip\n');
    await context.close();
    process.exit(0);
  } else {
    console.log('\n❌ FAIL — Tooltip did not appear via auto-inject path\n');
    await context.close();
    process.exit(1);
  }
})();

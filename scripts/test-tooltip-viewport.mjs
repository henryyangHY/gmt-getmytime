// ─── TZ Extension v2 — Tooltip Viewport Containment Test ───
// Reproduces the cut-off bug: small viewport + selection low on page +
// no-TZ picker (tallest variant with 11 buttons). Verifies the tooltip
// stays fully within viewport AND its "It's already my time" button is
// reachable (visible OR within scrollable tooltip body).

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '..');
const TEST_PAGE = `file:///${path.resolve(__dirname, 'test-cases.html').replace(/\\/g, '/')}`;

(async () => {
  console.log('\n🚀 Tooltip Viewport Containment Test\n');

  // Small viewport like the user's email reader area.
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-first-run', '--disable-default-apps',
    ],
    viewport: { width: 700, height: 600 },
  });

  const page = await context.newPage();
  await page.goto(TEST_PAGE);
  await page.waitForTimeout(1500);

  // Select a no-TZ phrase and pin it near the bottom of the viewport.
  await page.evaluate(() => {
    const els = [...document.querySelectorAll('.test-input'), ...document.querySelectorAll('.highlight-me')];
    for (const el of els) {
      if (el.textContent.trim() === '10 AM') {
        el.scrollIntoView({ block: 'end' });
        const range = document.createRange();
        window.getSelection().removeAllRanges();
        range.selectNodeContents(el);
        window.getSelection().addRange(range);
        return;
      }
    }
  });

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('__tz_ext_convert__', { detail: { text: '10 AM' } }));
  });
  await page.waitForTimeout(800);

  const probe = await page.evaluate(() => {
    const t = document.querySelector('.tz-ext-tooltip');
    if (!t) return { ok: false, reason: 'no tooltip' };
    const r = t.getBoundingClientRect();
    const localBtn = t.querySelector('.tz-ext-local-opt');
    const localExists = !!localBtn;
    const scrollable = t.scrollHeight > t.clientHeight + 1;
    return {
      ok: true,
      tooltipTop: r.top,
      tooltipBottom: r.bottom,
      tooltipHeight: r.height,
      vw: window.innerWidth,
      vh: window.innerHeight,
      localBtnExists: localExists,
      tooltipScrollable: scrollable,
      withinViewport: r.top >= 0 && r.bottom <= window.innerHeight,
    };
  });

  console.log('  → Probe:', JSON.stringify(probe, null, 2));

  let pass = true;
  const reasons = [];
  if (!probe.ok) { pass = false; reasons.push(probe.reason); }
  if (!probe.localBtnExists) { pass = false; reasons.push('local opt button missing'); }
  if (!probe.withinViewport) { pass = false; reasons.push(`tooltip overflows viewport (top=${probe.tooltipTop}, bottom=${probe.tooltipBottom}, vh=${probe.vh})`); }

  if (pass) {
    console.log('\n✅ PASS — Tooltip is fully inside viewport;', probe.tooltipScrollable ? 'inner scroll enabled' : 'fits without scroll', '\n');
    await context.close();
    process.exit(0);
  } else {
    console.log('\n❌ FAIL —', reasons.join('; '), '\n');
    await context.close();
    process.exit(1);
  }
})();

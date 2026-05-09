// ─── TZ Extension v2 — Automated Test Runner ───
// Playwright loads extension → opens test page → triggers conversion via TEST_CONVERT message → verifies tooltip.

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = __dirname;
const TEST_PAGE = `file:///${path.resolve(__dirname, 'test-cases.html').replace(/\\/g, '/')}`;

const TESTS = [
  // ① No TZ — should show no-TZ picker
  { id: 'T-01', text: '10 AM',                                                     expectBadge: 'notz', expectContains: ['No timezone detected', 'already my time'] },
  { id: 'T-02', text: 'June 15th from 9 am – 4 pm',                                expectBadge: 'notz', expectContains: ['No timezone detected', 'US Central'] },
  { id: 'T-03', text: '14:00',                                                     expectBadge: 'notz', expectContains: ['No timezone detected'] },
  { id: 'T-04', text: '5/13/2026 | 1:00 PM – 4:00 PM',                             expectBadge: 'notz', expectContains: ['No timezone detected', 'CHI'] },
  { id: 'T-05', text: '5/20/2026 | 11:00 AM – 12:30 PM',                           expectBadge: 'notz', expectContains: ['No timezone detected'] },

  // ② Unambiguous TZ — convert with GMT+X
  { id: 'T-10', text: '3:30 PM CT',        expectBadge: null, expectContains: ['GMT'] },
  { id: 'T-11', text: '9 AM ET',           expectBadge: null, expectContains: ['GMT'] },
  { id: 'T-12', text: '10:00 AM HKT',      expectBadge: null, expectContains: ['GMT'] },
  { id: 'T-13', text: '3 PM JST',          expectBadge: null, expectContains: ['GMT'] },
  { id: 'T-15', text: '2:00 PM GMT+5',     expectBadge: null, expectContains: ['GMT'] },

  // ③ Ambiguous TZ — picker
  { id: 'T-20', text: '9 AM CST',          expectBadge: 'ambig', expectContains: ['ambiguous', 'US Central', 'China'] },
  { id: 'T-21', text: '2 PM EST',          expectBadge: 'ambig', expectContains: ['ambiguous', 'US Eastern', 'Australia'] },
  { id: 'T-22', text: '11:30 AM IST',      expectBadge: 'ambig', expectContains: ['ambiguous', 'India', 'Israel'] },
  { id: 'T-23', text: '8 AM PST',          expectBadge: 'ambig', expectContains: ['ambiguous', 'US Pacific', 'Philippines'] },

  // ④ Edge cases
  { id: 'T-30', text: 'I have 15 apples and 20 oranges', expectBadge: 'notime', expectContains: ['No time'] },
  { id: 'T-31', text: 'June 15th',                       expectBadge: 'notime', expectContains: ['No time'] },
  { id: 'T-32', text: '12 AM ET',                        expectBadge: null,     expectContains: ['GMT'] },
  { id: 'T-33', text: 'June 15th from 9 am – 4 pm (with happy hour at 5 pm)',  expectBadge: 'notz', expectContains: ['No timezone detected', 'already my time'] },

  // ⑤ Calendar button
  { id: 'T-40', text: 'Sep 22 from 2 PM to 5 PM CT',    expectBadge: null, expectContains: ['Calendar'], expectCalendar: true },
  { id: 'T-41', text: 'July 10th at 3 PM ET',            expectBadge: null, expectContains: ['Calendar'], expectCalendar: true },
];

async function triggerConversion(page, text) {
  // 1. Select the text on the page (for tooltip positioning)
  const found = await page.evaluate((searchText) => {
    const els = [...document.querySelectorAll('.test-input'), ...document.querySelectorAll('.highlight-me')];
    for (const el of els) {
      if (el.textContent.trim() === searchText) {
        const range = document.createRange();
        window.getSelection().removeAllRanges();
        range.selectNodeContents(el);
        window.getSelection().addRange(range);
        return true;
      }
    }
    return false;
  }, text);
  if (!found) return false;

  // 2. Trigger conversion via custom event (content script listens for this)
  await page.evaluate((t) => {
    window.dispatchEvent(new CustomEvent('__tz_ext_convert__', { detail: { text: t } }));
  }, text);
  return true;
}

async function getTooltip(page) {
  await page.waitForTimeout(1200);
  return await page.evaluate(() => {
    const t = document.querySelector('.tz-ext-tooltip');
    if (!t) return null;
    return {
      text: t.textContent.trim(),
      visible: t.style.opacity === '1',
      hasCalendar: !!t.querySelector('.tz-ext-cal-btn'),
      hasAmbiguity: !!t.querySelector('.tz-ext-amb-btn'),
      hasLocalBadge: !!t.querySelector('.tz-ext-local-badge'),
    };
  });
}

async function dismiss(page) {
  await page.evaluate(() => {
    document.querySelector('.tz-ext-tooltip')?.remove();
    window.getSelection()?.removeAllRanges();
  });
  await page.waitForTimeout(600);
}

(async () => {
  console.log('\n🚀 TZ Extension v2 — Automated Test Runner\n');
  console.log('─'.repeat(65));

  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-first-run', '--disable-default-apps',
    ],
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();
  await page.goto(TEST_PAGE);
  await page.waitForTimeout(2000);

  let passed = 0, failed = 0;
  const failures = [];

  for (const test of TESTS) {
    process.stdout.write(`  ${test.id} | "${test.text.substring(0, 52).padEnd(52)}" `);

    const ok = await triggerConversion(page, test.text);
    if (!ok) { console.log('⚠️  SKIP — not found'); continue; }

    const tip = await getTooltip(page);
    let pass = true, reason = '';

    // Badge checks
    if (test.expectBadge === 'notime') {
      if (!tip || !tip.text.includes('No time')) { pass = false; reason = `expected "No time", got "${tip?.text || '(none)'}"`; }
    } else if (test.expectBadge === 'notz') {
      if (!tip || !tip.hasAmbiguity || !tip.text.includes('No timezone detected')) { pass = false; reason = `expected no-TZ picker, got "${tip?.text?.substring(0, 80) || '(none)'}"`; }
    } else if (test.expectBadge === 'local') {
      if (!tip || !tip.hasLocalBadge) { pass = false; reason = `expected local badge, got "${tip?.text || '(none)'}"`; }
    } else if (test.expectBadge === 'ambig') {
      if (!tip || !tip.hasAmbiguity) { pass = false; reason = `expected ambiguity picker, got "${tip?.text || '(none)'}"`; }
    } else if (!tip || !tip.visible) {
      pass = false; reason = 'no tooltip';
    }

    // Content checks
    if (pass && tip) {
      const missing = test.expectContains.filter(s => !tip.text.toUpperCase().includes(s.toUpperCase()));
      if (missing.length) { pass = false; reason = `missing: ${missing.join(', ')} in "${tip.text.substring(0, 80)}"`; }
    }

    // Calendar check
    if (pass && test.expectCalendar && tip && !tip.hasCalendar) {
      pass = false; reason = 'missing Calendar button';
    }

    if (pass) {
      console.log(`✅ PASS — "${(tip?.text || '').substring(0, 60)}"`);
      passed++;
    } else {
      console.log(`❌ FAIL — ${reason}`);
      failed++;
      failures.push({ id: test.id, reason });
    }

    await dismiss(page);
  }

  console.log('\n' + '─'.repeat(65));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed, ${TESTS.length} total\n`);
  if (failures.length) { console.log('❌ Failures:'); failures.forEach(f => console.log(`   ${f.id}: ${f.reason}`)); console.log(''); }
  if (!failed) console.log('🎉 All tests passed!\n');

  await context.close();
  process.exit(failed ? 1 : 0);
})();

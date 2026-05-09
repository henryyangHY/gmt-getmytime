// ─── Capture screenshots for README ───
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = __dirname;
const TEST_PAGE = `file:///${path.resolve(__dirname, 'test-cases.html').replace(/\\/g, '/')}`;
const SHOT_DIR = path.resolve(__dirname, 'screenshots');

const SCENARIOS = [
  {
    id: 'convert-ct',
    text: '3:30 PM CT',
    desc: 'Unambiguous TZ conversion',
  },
  {
    id: 'convert-range-ct',
    text: 'Sep 22 from 2 PM to 5 PM CT',
    desc: 'Range conversion with calendar',
  },
  {
    id: 'ambiguous-cst',
    text: '9 AM CST',
    desc: 'Ambiguous TZ picker',
  },
  {
    id: 'notz-picker',
    text: '5/13/2026 | 1:00 PM – 4:00 PM',
    desc: 'No-TZ fallback picker',
  },
  {
    id: 'notz-converted',
    text: '5/13/2026 | 1:00 PM – 4:00 PM',
    desc: 'No-TZ → pick US Central → result',
    pickIdx: 1,
  },
  {
    id: 'same-tz',
    text: '10:00 AM HKT',
    desc: 'Same time zone badge',
  },
];

async function scrollToAndSelect(page, text) {
  return await page.evaluate((searchText) => {
    const els = [...document.querySelectorAll('.test-input'), ...document.querySelectorAll('.highlight-me')];
    for (const el of els) {
      if (el.textContent.trim() === searchText) {
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        const range = document.createRange();
        window.getSelection().removeAllRanges();
        range.selectNodeContents(el);
        window.getSelection().addRange(range);
        return true;
      }
    }
    return false;
  }, text);
}

(async () => {
  console.log('\n📸 Capturing screenshots for README\n');

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

  for (const sc of SCENARIOS) {
    // Dismiss previous tooltip
    await page.evaluate(() => {
      document.querySelector('.tz-ext-tooltip')?.remove();
      window.getSelection()?.removeAllRanges();
    });
    await page.waitForTimeout(300);

    // Scroll to element and select
    const found = await scrollToAndSelect(page, sc.text);
    if (!found) { console.log(`  ❌ ${sc.id} — text not found`); continue; }
    await page.waitForTimeout(300);

    // Trigger conversion
    await page.evaluate((t) => {
      window.dispatchEvent(new CustomEvent('__tz_ext_convert__', { detail: { text: t } }));
    }, sc.text);
    await page.waitForTimeout(800);

    // If picker scenario, click the button
    if (sc.pickIdx !== undefined) {
      await page.evaluate((idx) => {
        const btns = document.querySelectorAll('.tz-ext-tooltip .tz-ext-amb-btn');
        if (btns[idx]) btns[idx].click();
      }, sc.pickIdx);
      await page.waitForTimeout(800);
    }

    // Get tooltip bounding box and capture with padding
    const box = await page.evaluate(() => {
      const t = document.querySelector('.tz-ext-tooltip');
      if (!t) return null;
      const r = t.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });

    if (box) {
      const pad = 16;
      const clip = {
        x: Math.max(0, box.x - pad),
        y: Math.max(0, box.y - pad),
        width: box.width + pad * 2,
        height: box.height + pad * 2,
      };
      await page.screenshot({
        path: path.join(SHOT_DIR, `${sc.id}.png`),
        clip,
      });
      console.log(`  ✅ ${sc.id}.png — ${sc.desc}`);
    } else {
      console.log(`  ❌ ${sc.id} — tooltip not found`);
    }
  }

  await context.close();
  console.log('\n📁 Screenshots saved to screenshots/\n');
})();

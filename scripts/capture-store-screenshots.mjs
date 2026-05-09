// ─── Capture store-ready screenshots (1280x800) ───
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '..');
const TEST_PAGE = `file:///${path.resolve(__dirname, 'test-cases.html').replace(/\\/g, '/')}`;
const SHOT_DIR = path.resolve(__dirname, '..', 'docs', 'screenshots');

const SCENARIOS = [
  {
    id: 'store-convert',
    text: '3:30 PM CT',
    desc: 'TZ conversion',
  },
  {
    id: 'store-range',
    text: 'Sep 22 from 2 PM to 5 PM CT',
    desc: 'Range + calendar',
  },
  {
    id: 'store-ambiguous',
    text: '9 AM CST',
    desc: 'Ambiguous picker',
  },
  {
    id: 'store-notz-picker',
    text: '5/13/2026 | 1:00 PM – 4:00 PM',
    desc: 'No-TZ picker',
  },
  {
    id: 'store-notz-converted',
    text: '5/13/2026 | 1:00 PM – 4:00 PM',
    desc: 'No-TZ converted',
    pickIdx: 1,
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
  console.log('\n📸 Capturing store-ready screenshots (1280x800)\n');

  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-first-run', '--disable-default-apps',
    ],
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();
  await page.goto(TEST_PAGE);
  await page.waitForTimeout(2000);

  for (const sc of SCENARIOS) {
    await page.evaluate(() => {
      document.querySelector('.tz-ext-tooltip')?.remove();
      window.getSelection()?.removeAllRanges();
    });
    await page.waitForTimeout(300);

    const found = await scrollToAndSelect(page, sc.text);
    if (!found) { console.log(`  ❌ ${sc.id} — text not found`); continue; }
    await page.waitForTimeout(300);

    await page.evaluate((t) => {
      window.dispatchEvent(new CustomEvent('__tz_ext_convert__', { detail: { text: t } }));
    }, sc.text);
    await page.waitForTimeout(800);

    if (sc.pickIdx !== undefined) {
      await page.evaluate((idx) => {
        const btns = document.querySelectorAll('.tz-ext-tooltip .tz-ext-amb-btn');
        if (btns[idx]) btns[idx].click();
      }, sc.pickIdx);
      await page.waitForTimeout(800);
    }

    // Full viewport screenshot at exactly 1280x800
    const tmpPath = path.join(SHOT_DIR, `${sc.id}-tmp.png`);
    const outPath = path.join(SHOT_DIR, `${sc.id}.png`);
    await page.screenshot({ path: tmpPath });

    // Flatten alpha → 24-bit RGB PNG (Chrome Web Store requirement)
    await sharp(tmpPath)
      .flatten({ background: { r: 15, g: 23, b: 42 } }) // match page bg #0f172a
      .resize(1280, 800, { fit: 'cover' })
      .png()
      .toFile(outPath);

    const meta = await sharp(outPath).metadata();
    const size = Math.round((await sharp(outPath).toBuffer()).length / 1024);
    console.log(`  ✅ ${sc.id}.png — ${meta.width}x${meta.height}, ${meta.channels}ch, ${size}KB — ${sc.desc}`);

    // Clean up tmp
    const fs = await import('fs');
    fs.unlinkSync(tmpPath);
  }

  await context.close();
  console.log('\n📁 Store screenshots saved to screenshots/\n');
})();

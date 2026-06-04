// ─── Capture v4 store-ready screenshots ───
// Renders all 7 tooltip variants + popup at 1280×800, exports 24-bit RGB PNGs
// suitable for Chrome Web Store upload.
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '..');
const TEST_PAGE = `file:///${path.resolve(__dirname, 'store-cases-v4.html').replace(/\\/g, '/')}`;
const SHOT_DIR = path.resolve(__dirname, '..', 'docs', 'screenshots');
if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

// Force a deterministic local TZ so screenshots are reproducible (Chicago,
// which differs from HKT/CST/EST etc. so day-offset stamps actually fire).
process.env.TZ = 'America/Chicago';

const SCENARIOS = [
  { id: 'v4-01-single',     anchor: 'sc-single',   case: 'single',    desc: 'Single-time conversion' },
  { id: 'v4-02-range',      anchor: 'sc-range',    case: 'range',     desc: 'Range + calendar' },
  { id: 'v4-03-ambiguous',  anchor: 'sc-ambig',    case: 'ambig',     desc: 'Ambiguous picker (CST)' },
  { id: 'v4-04-notz-picker',anchor: 'sc-notz',     case: 'notz',      desc: 'No-TZ picker' },
  { id: 'v4-05-notz-conv',  anchor: 'sc-notz-conv',case: 'notz-conv', desc: 'No-TZ → US Central picked', pickIndex: 1 },
  { id: 'v4-06-same',       anchor: 'sc-same',     case: 'same',      desc: 'Same time zone' },
  { id: 'v4-07-error',      anchor: 'sc-err',      case: 'err',       desc: 'No time detected (error)' },
];

async function clearTooltip(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.tz-ext-host, .tz-ext-tooltip').forEach(n => n.remove());
    window.getSelection()?.removeAllRanges();
  });
}

async function selectAndConvert(page, caseId) {
  const text = await page.evaluate((cid) => {
    const el = document.querySelector(`[data-case="${cid}"]`);
    if (!el) return null;
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const range = document.createRange();
    window.getSelection().removeAllRanges();
    range.selectNodeContents(el);
    window.getSelection().addRange(range);
    return el.textContent.trim();
  }, caseId);
  if (!text) return null;
  await page.waitForTimeout(150);
  await page.evaluate((t) => {
    window.dispatchEvent(new CustomEvent('__tz_ext_convert__', { detail: { text: t } }));
  }, text);
  return text;
}

async function waitForTooltip(page) {
  // Tooltip is inside Shadow DOM; wait for the host + first child.
  await page.waitForFunction(() => {
    const host = document.querySelector('.tz-ext-host');
    if (!host || !host.shadowRoot) return false;
    const tt = host.shadowRoot.querySelector('.tz-ext-tooltip');
    return !!tt && tt.getBoundingClientRect().height > 50;
  }, { timeout: 4000 }).catch(() => {});
  // Let fonts settle so screenshot matches final paint.
  await page.evaluate(async () => {
    const host = document.querySelector('.tz-ext-host');
    if (host?.shadowRoot?.fonts?.ready) await host.shadowRoot.fonts.ready;
    if (document.fonts?.ready) await document.fonts.ready;
  });
  await page.waitForTimeout(450);
}

async function clickPickerOption(page, idx) {
  await page.evaluate((i) => {
    const host = document.querySelector('.tz-ext-host');
    const btns = host?.shadowRoot?.querySelectorAll('.tz-ext-amb-btn');
    if (btns && btns[i]) btns[i].click();
  }, idx);
  await page.waitForTimeout(150);
  await waitForTooltip(page);
}

async function flattenToStorePng(tmpPath, outPath) {
  // Chrome Web Store requires 24-bit RGB PNG (no alpha) at 1280×800.
  await sharp(tmpPath)
    .flatten({ background: { r: 232, g: 226, b: 212 } }) // matches body bg
    .resize(1280, 800, { fit: 'cover' })
    .png()
    .toFile(outPath);
  fs.unlinkSync(tmpPath);
}

(async () => {
  console.log('\n📸 Capturing v4 store screenshots (1280×800, 24-bit RGB)\n');

  const userDataDir = path.resolve(__dirname, '..', 'tmp-test-user-data-dir');
  if (fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true, force: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-first-run', '--disable-default-apps',
    ],
    viewport: { width: 1280, height: 800 },
    timezoneId: 'America/Chicago',
  });

  const page = await context.newPage();
  await page.goto(TEST_PAGE);
  await page.waitForTimeout(1500);

  // ─── Tooltip scenarios ───
  for (const sc of SCENARIOS) {
    await clearTooltip(page);
    await page.waitForTimeout(200);

    const text = await selectAndConvert(page, sc.case);
    if (!text && sc.case !== 'err') {
      console.log(`  ⚠️  ${sc.id} — target text not found`);
      continue;
    }
    await waitForTooltip(page);

    if (sc.pickIndex !== undefined) {
      await clickPickerOption(page, sc.pickIndex);
    }

    const tmp = path.join(SHOT_DIR, `${sc.id}-tmp.png`);
    const out = path.join(SHOT_DIR, `${sc.id}.png`);
    await page.screenshot({ path: tmp });
    await flattenToStorePng(tmp, out);

    const meta = await sharp(out).metadata();
    const kb = Math.round(fs.statSync(out).size / 1024);
    console.log(`  ✅ ${sc.id}.png  ${meta.width}×${meta.height}  ${meta.channels}ch  ${kb}KB  — ${sc.desc}`);
  }

  // ─── Popup screenshot ───
  await clearTooltip(page);
  let extId = null;
  for (const sw of context.serviceWorkers()) {
    const m = sw.url().match(/^chrome-extension:\/\/([a-z]+)\//);
    if (m) { extId = m[1]; break; }
  }
  let popupCaptured = false;
  if (extId) {
    const popupPage = await context.newPage();
    await popupPage.setViewportSize({ width: 480, height: 640 });
    await popupPage.goto(`chrome-extension://${extId}/popup/popup.html`);
    await popupPage.evaluate(() => document.fonts?.ready);
    await popupPage.waitForTimeout(400);
    await popupPage.evaluate(() => {
      document.getElementById('timeInput').value = '11:30 PM';
      document.getElementById('timeInput').dispatchEvent(new Event('input', { bubbles: true }));
      const fz = document.getElementById('fromZone');
      const tz = document.getElementById('toZone');
      [...fz.options].forEach(o => { if (o.value === 'Asia/Hong_Kong') fz.value = o.value; });
      [...tz.options].forEach(o => { if (o.value === 'America/Chicago') tz.value = o.value; });
      fz.dispatchEvent(new Event('change', { bubbles: true }));
      tz.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('convertBtn').click();
    });
    await popupPage.waitForTimeout(800);

    // Trim screenshot to actual popup content height
    const contentH = await popupPage.evaluate(() => document.documentElement.scrollHeight);
    await popupPage.setViewportSize({ width: 480, height: Math.min(Math.max(contentH, 520), 720) });
    await popupPage.waitForTimeout(200);
    const popupRaw = path.join(SHOT_DIR, 'v4-08-popup-raw.png');
    await popupPage.screenshot({ path: popupRaw, fullPage: false });

    // Composite onto a 1280×800 paper backdrop with subtle shadow.
    const out = path.join(SHOT_DIR, 'v4-08-popup.png');
    const popupBuf = await sharp(popupRaw).png().toBuffer();
    const popupMeta = await sharp(popupBuf).metadata();

    // Drop shadow layer: blurred dark rectangle, slightly offset
    const shadowBuf = await sharp({
      create: {
        width: popupMeta.width + 60,
        height: popupMeta.height + 60,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{
        input: await sharp({
          create: { width: popupMeta.width, height: popupMeta.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.45 } },
        }).png().toBuffer(),
        left: 30, top: 40,
      }])
      .blur(18)
      .png()
      .toBuffer();

    const left = Math.round((1280 - popupMeta.width) / 2);
    const top = Math.round((800 - popupMeta.height) / 2);
    await sharp({
      create: {
        width: 1280, height: 800, channels: 3,
        background: { r: 232, g: 226, b: 212 },
      },
    })
      .composite([
        { input: shadowBuf, left: left - 30, top: top - 20 },
        { input: popupBuf, left, top },
      ])
      .png()
      .toFile(out);

    fs.unlinkSync(popupRaw);
    const meta = await sharp(out).metadata();
    const kb = Math.round(fs.statSync(out).size / 1024);
    console.log(`  ✅ v4-08-popup.png  ${meta.width}×${meta.height}  ${meta.channels}ch  ${kb}KB  — Popup manual converter`);
    popupCaptured = true;
  } else {
    console.log('  ⚠️  Could not resolve extension id; popup screenshot skipped.');
  }

  await context.close();
  console.log(`\n📁 Saved to ${SHOT_DIR}\n${popupCaptured ? '' : 'Note: popup screenshot was not produced.\n'}`);
})();

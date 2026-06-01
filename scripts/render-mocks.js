const { chromium } = require('playwright-core');
const path = require('path');

(async () => {
  // Find Chrome on Windows
  const candidates = [
    'C:\\Users\\henryyang\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
    'C:\\Users\\henryyang\\AppData\\Local\\ms-playwright\\chromium-1217\\chrome-win64\\chrome.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ];
  const fs = require('fs');
  const exe = candidates.find(p => p && fs.existsSync(p));
  if (!exe) { console.error('No Chrome found'); process.exit(1); }

  const browser = await chromium.launch({ executablePath: exe, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1240, height: 1600 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const file = 'file:///' + path.resolve(__dirname, 'design-showa.html').replace(/\\/g, '/');
  await page.goto(file, { waitUntil: 'networkidle' });
  // Wait for fonts
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  const out = path.resolve(__dirname, 'design-showa.png');
  await page.screenshot({ path: out, fullPage: true });
  console.log('saved', out);
  await browser.close();
})();

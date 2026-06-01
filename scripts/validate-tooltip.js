const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const contentJs = read(path.join('content', 'content.js'));
const contentCss = read(path.join('content', 'content.css'));

function extractClasses(js) {
  const classes = new Set();
  const attrs = [];
  const attrRe = /class\s*=\s*(["'`])([\s\S]*?)\1/g;
  let m;
  while ((m = attrRe.exec(js))) {
    if (!m[2].includes('tz-ext-')) continue;
    const value = m[2].replace(/\s+/g, ' ').trim();
    attrs.push(value);
    value.split(/\s+/).filter(c => c.startsWith('tz-ext-')).forEach(c => classes.add(c));
  }
  const classNameRe = /className\s*=\s*(["'`])([\s\S]*?)\1/g;
  while ((m = classNameRe.exec(js))) {
    if (!m[2].includes('tz-ext-')) continue;
    const value = m[2].replace(/\s+/g, ' ').trim();
    attrs.push(`className=${value}`);
    value.split(/\s+/).filter(c => c.startsWith('tz-ext-')).forEach(c => classes.add(c));
  }
  return { attrs, classes: [...classes].sort() };
}

function hasCssRule(css, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\.${escaped}(?![-_a-zA-Z0-9])`).test(css);
}

function scanEmoji(rel) {
  const text = read(rel);
  const re = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
  const lines = text.split(/\r?\n/);
  const hits = [];
  lines.forEach((line, idx) => {
    const found = [...line.matchAll(re)];
    if (found.length) {
      hits.push({
        file: rel,
        line: idx + 1,
        codepoints: found.map(x => 'U+' + x[0].codePointAt(0).toString(16).toUpperCase()),
        text: line.trim()
      });
    }
  });
  return hits;
}

function writeHarness() {
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>GMT Tooltip Preview</title>
<style>
${contentCss}
body {
  margin: 0;
  min-height: 900px;
  background: #fff;
  color: #171717;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.page {
  padding: 72px 80px;
  max-width: 1060px;
}
.kicker { color: #8a8f98; font-size: 12px; text-transform: uppercase; letter-spacing: .16em; }
.article { font-size: 19px; line-height: 1.65; color: #242424; }
.highlight { background: #fff2c7; padding: 1px 4px; border-radius: 2px; }
.tooltip-stage { position: relative; height: 560px; margin-top: 36px; }
.tooltip-stage .tz-ext-tooltip { opacity: 1; transform: translateY(0); }
#variant-a { left: 20px; top: 20px; }
#variant-b { left: 378px; top: 20px; }
#variant-c { left: 744px; top: 20px; }
</style>
</head>
<body>
  <main class="page">
    <div class="kicker">White page overlay simulation</div>
    <p class="article">The selected meeting time <span class="highlight">10:30 AM PST</span> is shown with three tooltip states rendered as static HTML.</p>
    <section class="tooltip-stage" aria-label="Tooltip variants">
      <div id="variant-a" class="tz-ext-tooltip">
        <div class="tz-ext-label">GMT-8 · LAX / SEA / SFO</div>
        <div class="tz-ext-row"><span class="tz-ext-source">10:30 AM PST</span></div>
        <div class="tz-ext-divider"></div>
        <div class="tz-ext-label">GMT+8 · HK / SH / TPE</div>
        <div class="tz-ext-row"><span class="tz-ext-result">2:30 AM</span></div>
        <div class="tz-ext-divider"></div>
        <a class="tz-ext-cal-btn" href="#">Add to Google Calendar &rarr;</a>
      </div>

      <div id="variant-b" class="tz-ext-tooltip">
        <div class="tz-ext-label">No zone detected &mdash; select origin</div>
        <button class="tz-ext-amb-btn">US Eastern — NYC / TOR / MIA</button>
        <button class="tz-ext-amb-btn">US Central — CHI / DAL / MEX</button>
        <button class="tz-ext-amb-btn">US Pacific — LAX / SEA / SFO</button>
        <button class="tz-ext-amb-btn">Hong Kong / China — HK / SH / TPE</button>
        <button class="tz-ext-amb-btn tz-ext-local-opt">It's already my time</button>
      </div>

      <div id="variant-c" class="tz-ext-tooltip">
        <div class="tz-ext-local-badge">Already your time</div>
        <div class="tz-ext-row"><span class="tz-ext-result">10:30 AM</span></div>
        <div class="tz-ext-row"><span class="tz-ext-label">GMT+8 · HK / SH / TPE</span></div>
      </div>
    </section>
  </main>
</body>
</html>`;
  const out = path.join(root, 'scripts', 'tooltip-preview.html');
  fs.writeFileSync(out, html, 'utf8');
  return out;
}

async function renderScreenshot(harnessPath) {
  let playwright;
  try {
    playwright = require('playwright');
  } catch (err) {
    try {
      console.log('Playwright package not found; attempting npm install --no-save playwright-core puppeteer-core');
      execFileSync('npm', ['install', '--no-save', 'playwright-core', 'puppeteer-core'], { cwd: root, stdio: 'inherit' });
      playwright = require('playwright-core');
    } catch (installErr) {
      return { ok: false, reason: `Playwright unavailable and install failed: ${installErr.message}` };
    }
  }

  try {
    const browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1120, height: 720 }, deviceScaleFactor: 1 });
    await page.goto('file:///' + harnessPath.replace(/\\/g, '/'));
    await page.screenshot({ path: path.join(root, 'scripts', 'tooltip-preview.png'), fullPage: false });
    await browser.close();
    return { ok: true, path: path.join(root, 'scripts', 'tooltip-preview.png') };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

(async () => {
  const required = [
    'tz-ext-tooltip', 'tz-ext-row', 'tz-ext-label', 'tz-ext-divider', 'tz-ext-source',
    'tz-ext-arrow', 'tz-ext-result', 'tz-ext-local-badge', 'tz-ext-amb-btn',
    'tz-ext-cal-btn', 'tz-ext-local-opt'
  ];
  const { attrs, classes } = extractClasses(contentJs);
  console.log('READ FILES:');
  console.log('  content\\content.css bytes:', Buffer.byteLength(contentCss, 'utf8'));
  console.log('  content\\content.js bytes:', Buffer.byteLength(contentJs, 'utf8'));
  console.log('\nCLASS ATTRIBUTES / className FROM content.js:');
  attrs.forEach(x => console.log('  ' + x));
  console.log('\nUNIQUE tz-ext-* CLASSES FROM content.js:');
  classes.forEach(c => console.log('  ' + c));
  console.log('\nREQUIRED CLASS USAGE IN content.js:');
  required.forEach(c => console.log(`  ${c}: ${classes.includes(c) ? 'USED' : 'NOT FOUND'}`));
  const coverageClasses = [...new Set([...classes, ...required])].sort();
  const missingSelectors = coverageClasses.filter(c => !hasCssRule(contentCss, c));
  console.log('\nCSS SELECTOR COVERAGE:');
  coverageClasses.forEach(c => console.log(`  ${c}: ${hasCssRule(contentCss, c) ? 'FOUND' : 'MISSING'}`));
  const open = (contentCss.match(/\{/g) || []).length;
  const close = (contentCss.match(/\}/g) || []).length;
  console.log('\nCSS BRACE BALANCE:');
  console.log('  open braces:', open);
  console.log('  close braces:', close);
  console.log('  balanced:', open === close ? 'YES' : 'NO');

  const emojiFiles = [
    path.join('content', 'content.js'),
    path.join('popup', 'popup.js'),
    path.join('popup', 'popup.html'),
    path.join('background', 'background.js')
  ];
  const emojiHits = emojiFiles.flatMap(scanEmoji);
  console.log('\nEMOJI AUDIT:');
  if (!emojiHits.length) {
    console.log('  No emoji codepoints found in U+1F300-U+1FAFF or U+2600-U+27BF.');
  } else {
    emojiHits.forEach(h => console.log(`  ${h.file}:${h.line} ${h.codepoints.join(',')} ${h.text}`));
  }

  const harnessPath = writeHarness();
  console.log('\nHARNESS:');
  console.log('  wrote:', harnessPath);
  const render = await renderScreenshot(harnessPath);
  console.log('\nRENDER:');
  if (render.ok) {
    console.log('  screenshot:', render.path);
  } else {
    console.log('  screenshot: FAILED');
    console.log('  reason:', render.reason);
    console.log('  fallback html:', harnessPath);
  }

  console.log('\nSUMMARY FLAGS:');
  console.log('  step1_css_sanity:', missingSelectors.length === 0 && open === close ? 'PASS' : 'FAIL');
  console.log('  missing_selectors:', missingSelectors.length ? missingSelectors.join(', ') : 'none');
  console.log('  step2_emoji_audit:', emojiHits.length === 0 ? 'PASS' : 'FAIL');
  console.log('  emoji_hits:', emojiHits.length);
  console.log('  step3_headless_render:', render.ok ? 'PASS' : 'FALLBACK_HTML_ONLY');
})();

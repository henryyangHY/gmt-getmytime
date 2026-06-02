const { chromium } = require('playwright-core');
const path = require('path');

const CHROMIUM = 'C:/Users/henryyang/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe';
const FILE = 'file:///' + path.resolve(__dirname, 'hostile-page.html').replace(/\\/g, '/');
const CSS = 'file:///' + path.resolve(__dirname, '../content/content.css').replace(/\\/g, '/');

const TOOLTIP_INNER = `
  <span class="tz-ext-tag">Time converted</span>
  <div class="tz-ext-src"><strong>11:30 PM HKT</strong> &rarr; your time</div>
  <div class="tz-ext-result">
    <div class="tz-ext-result-top">
      <div class="tz-ext-result-time">10:30<span class="tz-ext-ampm">AM</span></div>
      <div class="tz-ext-stamp">Same day<span class="tz-ext-stamp-jp">同日</span></div>
    </div>
    <div class="tz-ext-meta">
      <div><div class="tz-ext-m-label">Day</div><div class="tz-ext-m-val">MON</div></div>
      <div><div class="tz-ext-m-label">Date</div><div class="tz-ext-m-val">15 JUN</div></div>
      <div><div class="tz-ext-m-label">Zone</div><div class="tz-ext-m-val">CDT</div></div>
    </div>
  </div>
  <a class="tz-ext-cal-btn" href="#">Add to Google Calendar &rarr;</a>
`;

async function addFonts(page) {
  await page.evaluate(() => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Noto+Serif+JP:wght@400;500;700;900&display=swap';
    document.head.appendChild(l);
  });
}

async function inspectShadow(page) {
  return page.evaluate(() => {
    const host = document.querySelector('div[style*="2147483647"]');
    const tt = host && host.shadowRoot && host.shadowRoot.querySelector('.tz-ext-tooltip');
    if (!tt) return { error: 'no tooltip' };
    const src = tt.querySelector('.tz-ext-src');
    const strong = tt.querySelector('.tz-ext-src strong');
    const cal = tt.querySelector('.tz-ext-cal-btn');
    const rect = tt.getBoundingClientRect();
    const calRect = cal ? cal.getBoundingClientRect() : null;
    const cs = (el) => el ? getComputedStyle(el) : null;
    return {
      srcFont: src && cs(src).fontFamily,
      srcPadding: src && cs(src).padding,
      srcMargin: src && cs(src).margin,
      srcLineHeight: src && cs(src).lineHeight,
      strongFont: strong && cs(strong).fontFamily,
      ttFont: cs(tt).fontFamily,
      ttPadding: cs(tt).padding,
      ttMargin: cs(tt).margin,
      ttBackground: cs(tt).backgroundColor,
      ttBoxSizing: cs(tt).boxSizing,
      ttBox: { w: rect.width, h: rect.height },
      calFont: cal && cs(cal).fontFamily,
      calPadding: cal && cs(cal).padding,
      calMargin: cal && cs(cal).margin,
      calLineHeight: cal && cs(cal).lineHeight,
      calBackground: cal && cs(cal).backgroundColor,
      calBorder: cal && cs(cal).border,
      calBottom: calRect ? calRect.bottom : null,
      ttBottom: rect.bottom,
      gapBelowCal: rect.bottom - (calRect ? calRect.bottom : rect.bottom),
      childCount: tt.children.length,
      lastChildTag: tt.children[tt.children.length - 1].tagName,
    };
  });
}

async function inspectNoShadow(page) {
  return page.evaluate(() => {
    const tt = document.querySelector('.tz-ext-tooltip');
    const src = tt && tt.querySelector('.tz-ext-src');
    const strong = tt && tt.querySelector('.tz-ext-src strong');
    const cal = tt && tt.querySelector('.tz-ext-cal-btn');
    const rect = tt ? tt.getBoundingClientRect() : null;
    const calRect = cal ? cal.getBoundingClientRect() : null;
    const cs = (el) => el ? getComputedStyle(el) : null;
    return {
      srcFont: src && cs(src).fontFamily,
      srcPadding: src && cs(src).padding,
      srcMargin: src && cs(src).margin,
      srcLineHeight: src && cs(src).lineHeight,
      strongFont: strong && cs(strong).fontFamily,
      ttFont: tt && cs(tt).fontFamily,
      ttPadding: tt && cs(tt).padding,
      ttMargin: tt && cs(tt).margin,
      ttBackground: tt && cs(tt).backgroundColor,
      ttBoxSizing: tt && cs(tt).boxSizing,
      ttBox: rect && { w: rect.width, h: rect.height },
      calFont: cal && cs(cal).fontFamily,
      calPadding: cal && cs(cal).padding,
      calMargin: cal && cs(cal).margin,
      calLineHeight: cal && cs(cal).lineHeight,
      calBackground: cal && cs(cal).backgroundColor,
      calBorder: cal && cs(cal).border,
      calBottom: calRect ? calRect.bottom : null,
      ttBottom: rect ? rect.bottom : null,
      gapBelowCal: rect && calRect ? rect.bottom - calRect.bottom : null,
      childCount: tt ? tt.children.length : null,
      lastChildTag: tt ? tt.children[tt.children.length - 1].tagName : null,
    };
  });
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });

  // ── Run 1: SHADOW DOM (isolation) ──
  const p1 = await browser.newPage({ viewport: { width: 900, height: 650 }, deviceScaleFactor: 2 });
  await p1.goto(FILE);
  await addFonts(p1);
  await p1.evaluate(async ({ CSS, html }) => {
    const host = document.createElement('div');
    host.style.cssText = 'all: initial !important; position: absolute !important; z-index: 2147483647 !important; left: 400px !important; top: 80px !important; margin: 0 !important; padding: 0 !important; pointer-events: none;';
    const shadow = host.attachShadow({ mode: 'open' });
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = CSS;
    shadow.appendChild(link);
    const tt = document.createElement('div');
    tt.className = 'tz-ext-tooltip';
    tt.innerHTML = html;
    tt.style.opacity = '1';
    tt.style.transform = 'translateY(0)';
    shadow.appendChild(tt);
    document.body.appendChild(host);
    await new Promise((resolve) => { link.addEventListener('load', resolve, { once: true }); setTimeout(resolve, 1500); });
  }, { CSS, html: TOOLTIP_INNER });
  await p1.evaluate(() => document.fonts.ready);
  await p1.waitForTimeout(600);
  await p1.screenshot({ path: 'scripts/hostile-tooltip-shadow.png', fullPage: false });
  const inspect = await inspectShadow(p1);

  // ── Run 2: CONTROL — same tooltip injected directly into hostile page (no shadow) ──
  const p2 = await browser.newPage({ viewport: { width: 900, height: 650 }, deviceScaleFactor: 2 });
  await p2.goto(FILE);
  await addFonts(p2);
  await p2.evaluate(async ({ CSS, html }) => {
    const cssLink = document.createElement('link');
    cssLink.rel = 'stylesheet';
    cssLink.href = CSS;
    document.head.appendChild(cssLink);
    await new Promise((resolve) => { cssLink.addEventListener('load', resolve, { once: true }); setTimeout(resolve, 1500); });
    const tt = document.createElement('div');
    tt.className = 'tz-ext-tooltip';
    tt.style.cssText = 'position: absolute !important; left: 400px !important; top: 80px !important; opacity: 1 !important; transform: none !important;';
    tt.innerHTML = html;
    document.body.appendChild(tt);
  }, { CSS, html: TOOLTIP_INNER });
  await p2.evaluate(() => document.fonts.ready);
  await p2.waitForTimeout(600);
  await p2.screenshot({ path: 'scripts/hostile-tooltip-noshadow.png', fullPage: false });
  const inspect2 = await inspectNoShadow(p2);

  console.log('SHADOW INSPECT:', JSON.stringify(inspect, null, 2));
  console.log('NOSHADOW INSPECT:', JSON.stringify(inspect2, null, 2));
  await browser.close();
})();

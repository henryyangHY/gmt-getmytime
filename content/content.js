// ─── Time Zone Contextual Converter v2 — Content Script ───
// Right-click "Get My Time": parses time, handles ambiguity, shows GMT+X, offers Calendar.

(() => {
  'use strict';

  // Idempotency guard: avoid double-initialization if the script gets re-injected
  // (e.g., by the background's auto-inject fallback after extension reload).
  if (window.__tz_ext_v2_initialized) return;
  window.__tz_ext_v2_initialized = true;

  // ── City labels for GMT offsets ──
  const OFFSET_CITIES = {
    '-12':  'BIK',
    '-11':  'PPG',
    '-10':  'HNL',
    '-9':   'ANC',
    '-8':   'LAX / SEA / SFO',
    '-7':   'DEN / PHX',
    '-6':   'CHI / DAL / MEX',
    '-5':   'NYC / TOR / MIA',
    '-4':   'HAL / SJU',
    '-3':   'BUE / SAO',
    '-2':   'FDN',
    '-1':   'PDL',
    '0':    'LON / LIS',
    '1':    'PAR / BER / MAD',
    '2':    'CAI / JNB / TLV',
    '3':    'RUH / MOW / NAI',
    '3.5':  'THR',
    '4':    'DXB / MUS',
    '4.5':  'KBL',
    '5':    'KHI / TAS',
    '5.5':  'DEL / BOM / CCU',
    '5.75': 'KTM',
    '6':    'DAC / ALA',
    '6.5':  'RGN',
    '7':    'BKK / JKT / HAN',
    '8':    'HK / SH / TPE',
    '9':    'TYO / SEL',
    '9.5':  'ADL',
    '10':   'SYD / MEL',
    '11':   'NOU',
    '12':   'AKL / FJI',
    '13':   'NKA / TBU',
  };

  // ── Timezone definitions ──
  const TZ_UNAMBIGUOUS = {
    'ET':  'America/New_York',
    'EDT': 'America/New_York',
    'CT':  'America/Chicago',
    'CDT': 'America/Chicago',
    'MT':  'America/Denver',
    'MDT': 'America/Denver',
    'PT':  'America/Los_Angeles',
    'PDT': 'America/Los_Angeles',
    'HKT': 'Asia/Hong_Kong',
    'JST': 'Asia/Tokyo',
    'KST': 'Asia/Seoul',
    'SGT': 'Asia/Singapore',
    'GMT': 'Etc/GMT',
    'UTC': 'Etc/UTC',
    'CEST':'Europe/Paris',
    'CET': 'Europe/Paris',
    'AEST':'Australia/Sydney',
    'AEDT':'Australia/Sydney',
    'NZST':'Pacific/Auckland',
    'NZDT':'Pacific/Auckland',
  };

  const TZ_AMBIGUOUS = {
    'CST': [
      { name: 'US Central',      offset: 'GMT-6',    iana: 'America/Chicago' },
      { name: 'China',           offset: 'GMT+8',    iana: 'Asia/Shanghai' },
      { name: 'Australia',       offset: 'GMT+9:30', iana: 'Australia/Adelaide' },
    ],
    'EST': [
      { name: 'US Eastern',      offset: 'GMT-5',    iana: 'America/New_York' },
      { name: 'Australia',       offset: 'GMT+10',   iana: 'Australia/Sydney' },
    ],
    'IST': [
      { name: 'India',           offset: 'GMT+5:30', iana: 'Asia/Kolkata' },
      { name: 'Israel',          offset: 'GMT+2',    iana: 'Asia/Jerusalem' },
      { name: 'Ireland',         offset: 'GMT+1',    iana: 'Europe/Dublin' },
    ],
    'BST': [
      { name: 'British Summer',  offset: 'GMT+1',    iana: 'Europe/London' },
      { name: 'Bangladesh',      offset: 'GMT+6',    iana: 'Asia/Dhaka' },
    ],
    'AST': [
      { name: 'Atlantic',        offset: 'GMT-4',    iana: 'America/Halifax' },
      { name: 'Arabian',         offset: 'GMT+3',    iana: 'Asia/Riyadh' },
    ],
    'PST': [
      { name: 'US Pacific',      offset: 'GMT-8',    iana: 'America/Los_Angeles' },
      { name: 'Philippines',     offset: 'GMT+8',    iana: 'Asia/Manila' },
    ],
    'MST': [
      { name: 'US Mountain',     offset: 'GMT-7',    iana: 'America/Denver' },
      { name: 'Malaysia',        offset: 'GMT+8',    iana: 'Asia/Kuala_Lumpur' },
    ],
    'SST': [
      { name: 'Singapore',       offset: 'GMT+8',    iana: 'Asia/Singapore' },
      { name: 'Samoa',           offset: 'GMT-11',   iana: 'Pacific/Pago_Pago' },
    ],
  };

  const ALL_TZ_ABBRS = [...Object.keys(TZ_UNAMBIGUOUS), ...Object.keys(TZ_AMBIGUOUS)];
  const MONTHS = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
  const MONTH_MAP = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
  const NUMERIC_DATE_RE = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/;

  // ── Timezone-to-cities mapping (DST-safe) ──
  const TZ_CITIES = {
    'America/New_York':      'NYC / TOR / MIA',
    'America/Chicago':       'CHI / DAL / MEX',
    'America/Denver':        'DEN / PHX',
    'America/Los_Angeles':   'LAX / SEA / SFO',
    'America/Halifax':       'HAL / SJU',
    'Europe/London':         'LON / LIS',
    'Europe/Paris':          'PAR / BER / MAD',
    'Europe/Dublin':         'DUB',
    'Asia/Hong_Kong':        'HK / SH / TPE',
    'Asia/Shanghai':         'HK / SH / TPE',
    'Asia/Singapore':        'SIN',
    'Asia/Manila':           'MNL',
    'Asia/Kuala_Lumpur':     'KUL',
    'Asia/Tokyo':            'TYO / SEL',
    'Asia/Seoul':            'TYO / SEL',
    'Asia/Kolkata':          'DEL / BOM / CCU',
    'Asia/Jerusalem':        'TLV',
    'Asia/Riyadh':           'RUH / MOW / NAI',
    'Asia/Dhaka':            'DAC / ALA',
    'Australia/Sydney':      'SYD / MEL',
    'Australia/Adelaide':    'ADL',
    'Pacific/Auckland':      'AKL / FJI',
  };

  let localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // ── Regex patterns ──
  const SINGLE_TIME_RE = new RegExp(
    '(\\d{1,2})(?::(\\d{2}))?' +
    '\\s*(AM|PM|am|pm|a\\.m\\.|p\\.m\\.)?' +
    '\\s*(' + ALL_TZ_ABBRS.join('|') + ')?',
    'i'
  );
  const DATE_PREFIX_RE = new RegExp(
    '(' + MONTHS + ')\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?', 'i'
  );
  const GMT_OFFSET_RE = /(?:GMT|UTC)\s*([+-])?\s*(\d{1,2})(?::(\d{2}))?/i;
  const RANGE_SEPARATORS = /\s*(?:–|—|-|to|~)\s*/;

  // ── Parsing helpers ──
  function parseSingleTime(token) {
    const m = token.trim().match(SINGLE_TIME_RE);
    if (!m) return null;
    let hour = parseInt(m[1], 10);
    const minute = m[2] ? parseInt(m[2], 10) : 0;
    const meridiem = m[3]?.replace(/\./g, '').toUpperCase();
    const tzAbbr = m[4]?.toUpperCase();
    if (hour > 23 || minute > 59) return null;
    if (meridiem) {
      if (hour > 12) return null;
      if (meridiem === 'PM' && hour !== 12) hour += 12;
      if (meridiem === 'AM' && hour === 12) hour = 0;
    }
    return { hour, minute, tzAbbr };
  }

  function parseDate(text) {
    // Try named month format: "May 13, 2026"
    const m = text.match(DATE_PREFIX_RE);
    if (m) {
      const month = MONTH_MAP[m[1].substring(0, 3).toLowerCase()];
      if (month !== undefined) {
        const day = parseInt(m[2], 10);
        if (day >= 1 && day <= 31) {
          const year = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
          return { month, day, year };
        }
      }
    }
    // Try numeric format: M/D/YYYY or MM/DD/YYYY
    const n = text.match(NUMERIC_DATE_RE);
    if (n) {
      const month = parseInt(n[1], 10) - 1;
      const day = parseInt(n[2], 10);
      let year = parseInt(n[3], 10);
      if (year < 100) year += 2000;
      if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
        return { month, day, year };
      }
    }
    return null;
  }

  function extractTzFromText(text) {
    const gmtOffset = text.match(GMT_OFFSET_RE);
    if (gmtOffset) {
      const sign = gmtOffset[1] === '-' ? -1 : 1;
      const hours = parseInt(gmtOffset[2], 10);
      const minutes = gmtOffset[3] ? parseInt(gmtOffset[3], 10) : 0;
      const totalMinutes = sign * (hours * 60 + minutes);
      const absH = Math.floor(Math.abs(totalMinutes) / 60);
      // Etc/GMT uses inverted sign
      const etcSign = totalMinutes >= 0 ? '-' : '+';
      return { type: 'offset', iana: `Etc/GMT${etcSign}${absH}`, offsetMinutes: totalMinutes };
    }
    const tzRe = new RegExp('\\b(' + ALL_TZ_ABBRS.join('|') + ')\\b', 'i');
    const m = text.match(tzRe);
    if (!m) return null;
    const abbr = m[1].toUpperCase();
    if (TZ_UNAMBIGUOUS[abbr]) return { type: 'unambiguous', iana: TZ_UNAMBIGUOUS[abbr], abbr };
    if (TZ_AMBIGUOUS[abbr]) return { type: 'ambiguous', options: TZ_AMBIGUOUS[abbr], abbr };
    return null;
  }

  function extractTimePortion(text) {
    let cleaned = text.replace(DATE_PREFIX_RE, '').replace(NUMERIC_DATE_RE, '').trim();
    cleaned = cleaned.replace(/^(?:from|at|,|\|)\s*/i, '').trim();
    return cleaned;
  }

  // ── Main parser ──
  function parseTimeString(text) {
    const cleaned = text.trim().replace(/\s+/g, ' ');
    if (cleaned.length < 3 || cleaned.length > 200) return null;

    const date = parseDate(cleaned);
    const tzInfo = extractTzFromText(cleaned);
    const isLocalTime = !tzInfo;

    const timePart = extractTimePortion(cleaned);
    if (!timePart) return null;

    const mainPart = timePart.replace(/\([^)]*\)/g, '').trim();
    const timeOnly = mainPart
      .replace(GMT_OFFSET_RE, '')
      .replace(new RegExp('\\b(' + ALL_TZ_ABBRS.join('|') + ')\\b', 'i'), '')
      .trim();

    const rangeParts = timeOnly.split(RANGE_SEPARATORS);
    let parsed = null;

    if (rangeParts.length >= 2) {
      const startP = parseSingleTime(rangeParts[0]);
      const endP = parseSingleTime(rangeParts[rangeParts.length - 1]);
      if (startP && endP) {
        parsed = {
          type: 'range',
          times: [
            { hour: startP.hour, minute: startP.minute },
            { hour: endP.hour, minute: endP.minute },
          ],
        };
      }
    }

    if (!parsed) {
      const single = parseSingleTime(timeOnly);
      if (single) {
        const hasMeridiem = /am|pm|a\.m\.|p\.m\./i.test(timeOnly);
        const hasColon = /\d:\d/.test(timeOnly);
        if (!hasMeridiem && !hasColon && !tzInfo && !date) return null;
        parsed = {
          type: 'single',
          times: [{ hour: single.hour, minute: single.minute }],
        };
      }
    }

    if (!parsed) return null;
    return { ...parsed, date, tzInfo, isLocalTime, rawText: cleaned };
  }

  // ── Conversion helpers ──
  function getOffsetMinutes(date, tz) {
    const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzStr = date.toLocaleString('en-US', { timeZone: tz });
    return (new Date(utcStr) - new Date(tzStr)) / 60000;
  }

  function getOffsetHours(tz, refDate) {
    const d = refDate || new Date();
    return -getOffsetMinutes(d, tz) / 60;
  }

  function formatGmtOffset(tz, refDate) {
    const h = getOffsetHours(tz, refDate);
    const sign = h >= 0 ? '+' : '-';
    const absH = Math.abs(h);
    const whole = Math.floor(absH);
    const frac = absH - whole;
    let str = `GMT${sign}${whole}`;
    if (frac > 0.01) str += `:${String(Math.round(frac * 60)).padStart(2, '0')}`;
    const cities = TZ_CITIES[tz] || OFFSET_CITIES[String(h)];
    if (cities) str += ` (${cities})`;
    return str;
  }

  function convertTime(hour, minute, sourceZone, refDate) {
    let refStr;
    if (refDate) {
      refStr = `${refDate.year}-${String(refDate.month + 1).padStart(2,'0')}-${String(refDate.day).padStart(2,'0')}`;
    } else {
      refStr = new Date().toLocaleDateString('en-CA', { timeZone: sourceZone });
    }
    // Parse as UTC (append Z) to avoid local timezone interference
    const utcBase = new Date(`${refStr}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00Z`);
    const srcOff = getOffsetMinutes(utcBase, sourceZone);
    const utcMs = utcBase.getTime() + srcOff * 60000;

    const localOff = getOffsetMinutes(new Date(utcMs), localZone);
    const srcOffAtTime = getOffsetMinutes(new Date(utcMs), sourceZone);
    const sameOffset = Math.abs(srcOffAtTime - localOff) < 1;

    const sourceDayStr = refStr;
    const resultDayStr = new Date(utcMs).toLocaleDateString('en-CA', { timeZone: localZone });
    let dayLabel = '';
    if (resultDayStr > sourceDayStr) dayLabel = ' (+1d)';
    else if (resultDayStr < sourceDayStr) dayLabel = ' (−1d)';

    const fmtOpts = { timeZone: localZone, hour: 'numeric', minute: '2-digit', hour12: true };
    if (refDate) { fmtOpts.month = 'short'; fmtOpts.day = 'numeric'; }
    const formatted = new Intl.DateTimeFormat('en-US', fmtOpts).format(new Date(utcMs)) + dayLabel;
    return { formatted, utcMs, sameOffset };
  }

  function fmtTime12(h, m) {
    const h12 = h % 12 || 12;
    const ampm = h < 12 ? 'AM' : 'PM';
    return m > 0 ? `${h12}:${String(m).padStart(2,'0')} ${ampm}` : `${h12} ${ampm}`;
  }

  // ── Google Calendar URL ──
  // Google Calendar URL dates WITHOUT 'Z' suffix = user's calendar timezone.
  // We always convert to the user's local time first, then pass without Z.
  function buildCalendarUrl(parsed, sourceZone) {
    const now = new Date();
    const refDate = parsed.date || { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
    const refStr = `${refDate.year}-${String(refDate.month + 1).padStart(2,'0')}-${String(refDate.day).padStart(2,'0')}`;

    const t0 = parsed.times[0];
    // Parse as UTC (append Z) to avoid local timezone interference
    const startUtcBase = new Date(`${refStr}T${String(t0.hour).padStart(2,'0')}:${String(t0.minute).padStart(2,'0')}:00Z`);
    const startUtcMs = startUtcBase.getTime() + getOffsetMinutes(startUtcBase, sourceZone) * 60000;

    let endUtcMs;
    if (parsed.type === 'range' && parsed.times[1]) {
      const t1 = parsed.times[1];
      const endUtcBase = new Date(`${refStr}T${String(t1.hour).padStart(2,'0')}:${String(t1.minute).padStart(2,'0')}:00Z`);
      endUtcMs = endUtcBase.getTime() + getOffsetMinutes(endUtcBase, sourceZone) * 60000;
      if (endUtcMs <= startUtcMs) endUtcMs += 86400000;
    } else {
      endUtcMs = startUtcMs + 3600000;
    }

    // Format as local time (no Z suffix) so Google Calendar uses the user's calendar timezone
    const fmtCalLocal = (utcMs) => {
      const d = new Date(utcMs);
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: localZone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
      }).formatToParts(d);
      const get = (type) => parts.find(p => p.type === type)?.value || '00';
      return `${get('year')}${get('month')}${get('day')}T${get('hour')}${get('minute')}${get('second')}`;
    };

    const title = encodeURIComponent(parsed.rawText || 'Time Block');
    const dates = `${fmtCalLocal(startUtcMs)}/${fmtCalLocal(endUtcMs)}`;
    const details = encodeURIComponent(`Converted from: ${parsed.rawText || ''}`);
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}`;
  }

  // ── Tooltip ──
  let tooltip = null;
  let tooltipHost = null;

  function removeTooltip() {
    if (tooltipHost) { tooltipHost.remove(); tooltipHost = null; tooltip = null; }
  }

  function ensureFontsLoaded() {
    if (document.getElementById('tz-ext-fonts-link')) return;
    const pre1 = document.createElement('link');
    pre1.rel = 'preconnect'; pre1.href = 'https://fonts.googleapis.com';
    const pre2 = document.createElement('link');
    pre2.rel = 'preconnect'; pre2.href = 'https://fonts.gstatic.com'; pre2.crossOrigin = 'anonymous';
    const link = document.createElement('link');
    link.id = 'tz-ext-fonts-link';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Noto+Serif+JP:wght@400;500;700;900&display=swap';
    const head = document.head || document.documentElement;
    head.appendChild(pre1); head.appendChild(pre2); head.appendChild(link);
  }

  function showTooltipAtSelection(html) {
    removeTooltip();
    ensureFontsLoaded();

    // Outer host: isolated from page CSS via Shadow DOM
    tooltipHost = document.createElement('div');
    tooltipHost.className = 'tz-ext-host';
    // Force a clean, host-page-immune wrapper. `all: initial` resets every inheritable
    // and non-inheritable property the host page might apply via descendant selectors.
    tooltipHost.style.cssText =
      'all: initial !important;' +
      'position: absolute !important;' +
      'z-index: 2147483647 !important;' +
      'left: 0 !important; top: 0 !important;' +
      'margin: 0 !important; padding: 0 !important;' +
      'pointer-events: none;';

    const shadow = tooltipHost.attachShadow({ mode: 'open' });

    const styleLink = document.createElement('link');
    styleLink.rel = 'stylesheet';
    styleLink.href = chrome.runtime.getURL('content/content.css');
    shadow.appendChild(styleLink);

    tooltip = document.createElement('div');
    tooltip.className = 'tz-ext-tooltip';
    tooltip.innerHTML = html;
    shadow.appendChild(tooltip);

    document.body.appendChild(tooltipHost);

    const positionAndShow = () => {
      const margin = 8;
      const gap = 10;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const sel = window.getSelection();
      let anchorX = vw / 2, anchorTop = vh / 2, anchorBottom = vh / 2;
      if (sel && sel.rangeCount > 0) {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        anchorX = rect.left + rect.width / 2;
        anchorTop = rect.top;
        anchorBottom = rect.bottom;
      }

      const naturalH = tooltip.getBoundingClientRect().height;
      const spaceAbove = anchorTop - margin - gap;
      const spaceBelow = vh - anchorBottom - margin - gap;
      let placeBelow;
      if (naturalH <= spaceAbove) placeBelow = false;
      else if (naturalH <= spaceBelow) placeBelow = true;
      else placeBelow = spaceBelow > spaceAbove;

      const maxH = Math.max(160, placeBelow ? spaceBelow : spaceAbove);
      tooltip.style.maxHeight = `${maxH}px`;

      const tRect = tooltip.getBoundingClientRect();
      let left = anchorX - tRect.width / 2;
      if (left < margin) left = margin;
      if (left + tRect.width > vw - margin) left = vw - tRect.width - margin;

      let top = placeBelow ? (anchorBottom + gap) : (anchorTop - tRect.height - gap);
      if (top < margin) top = margin;
      if (top + tRect.height > vh - margin) top = vh - tRect.height - margin;

      tooltipHost.style.setProperty('left', `${left + window.scrollX}px`, 'important');
      tooltipHost.style.setProperty('top', `${top + window.scrollY}px`, 'important');
      tooltip.style.opacity = '1';
      tooltip.style.transform = 'translateY(0)';
    };

    // Wait for shadow-DOM stylesheet to load before measuring sizes, otherwise the
    // tooltip is unstyled at the moment we compute its bounding box and ends up
    // positioned wrong (or flashes unstyled). Fall back to a small timeout in case
    // onload never fires.
    let shown = false;
    const showOnce = () => { if (!shown) { shown = true; positionAndShow(); } };
    styleLink.addEventListener('load', showOnce, { once: true });
    setTimeout(showOnce, 120);
  }

  // ── Showa-style result helpers ──
  function buildResultParts(utcMs) {
    const d = new Date(utcMs);
    const tparts = new Intl.DateTimeFormat('en-US', {
      timeZone: localZone, hour: 'numeric', minute: '2-digit', hour12: true,
    }).formatToParts(d).reduce((a, p) => (a[p.type] = p.value, a), {});
    const meta = new Intl.DateTimeFormat('en-US', {
      timeZone: localZone, weekday: 'short', month: 'short', day: 'numeric', timeZoneName: 'short',
    }).formatToParts(d).reduce((a, p) => { (a[p.type] = a[p.type] || []).push(p.value); return a; }, {});
    return {
      timeHTML: `${tparts.hour}:${tparts.minute}<span class="tz-ext-ampm">${(tparts.dayPeriod || '').toUpperCase()}</span>`,
      day: (meta.weekday || ['—']).join('').toUpperCase(),
      date: `${(meta.day || []).join('')} ${(meta.month || []).join('').toUpperCase()}`,
      zone: (meta.timeZoneName || ['—']).join(''),
      targetDate: d,
    };
  }

  function stampHTML(srcDayStr, tgtDayStr) {
    let en = 'Same day', jp = '同日', cls = 'tz-ext-stamp same';
    if (tgtDayStr > srcDayStr) { en = '+1 day';  jp = '翌日'; cls = 'tz-ext-stamp'; }
    else if (tgtDayStr < srcDayStr) { en = '−1 day';  jp = '前日'; cls = 'tz-ext-stamp'; }
    return `<div class="${cls}">${en}<span class="tz-ext-stamp-jp">${jp}</span></div>`;
  }

  function metaStubHTML(day, date, zone) {
    return `<div class="tz-ext-meta">` +
      `<div><div class="tz-ext-m-label">Day</div><div class="tz-ext-m-val">${day}</div></div>` +
      `<div><div class="tz-ext-m-label">Date</div><div class="tz-ext-m-val">${date}</div></div>` +
      `<div><div class="tz-ext-m-label">Zone</div><div class="tz-ext-m-val">${zone}</div></div>` +
    `</div>`;
  }

  // ── Show result ──
  function showResult(parsed, sourceZone) {
    const isLocal = !!parsed.isLocalTime;
    const isRange = parsed.type === 'range';
    const refD = parsed.date ? new Date(parsed.date.year, parsed.date.month, parsed.date.day) : undefined;
    const srcLabel = formatGmtOffset(sourceZone, refD);

    const r1 = convertTime(parsed.times[0].hour, parsed.times[0].minute, sourceZone, parsed.date);
    const r2 = isRange ? convertTime(parsed.times[1].hour, parsed.times[1].minute, sourceZone, parsed.date) : null;
    const b1 = buildResultParts(r1.utcMs);
    const b2 = r2 ? buildResultParts(r2.utcMs) : null;

    const srcTimeStr = isRange
      ? `${fmtTime12(parsed.times[0].hour, parsed.times[0].minute)} – ${fmtTime12(parsed.times[1].hour, parsed.times[1].minute)}`
      : fmtTime12(parsed.times[0].hour, parsed.times[0].minute);
    const srcLine = isLocal
      ? `<strong>${srcTimeStr}</strong> &middot; no zone specified`
      : `<strong>${srcTimeStr} ${srcLabel}</strong> &rarr; your time`;

    const srcDayStr = parsed.date
      ? `${parsed.date.year}-${String(parsed.date.month + 1).padStart(2,'0')}-${String(parsed.date.day).padStart(2,'0')}`
      : new Date().toLocaleDateString('en-CA', { timeZone: sourceZone });
    const tgtDayStr = b1.targetDate.toLocaleDateString('en-CA', { timeZone: localZone });

    let tag, stamp;
    if (isLocal) {
      tag = 'Treated as local';
      stamp = `<div class="tz-ext-stamp same">Same day<span class="tz-ext-stamp-jp">同日</span></div>`;
    } else if (r1.sameOffset) {
      tag = 'No conversion needed';
      stamp = `<div class="tz-ext-stamp same">Same day<span class="tz-ext-stamp-jp">同日</span></div>`;
    } else {
      tag = isRange ? 'Range converted' : 'Time converted';
      stamp = stampHTML(srcDayStr, tgtDayStr);
    }

    const timeBlock = b2
      ? `<div class="tz-ext-result-time range">${b1.timeHTML}<br>&ndash; ${b2.timeHTML}</div>`
      : `<div class="tz-ext-result-time">${b1.timeHTML}</div>`;

    let html =
      `<span class="tz-ext-tag">${tag}</span>` +
      `<div class="tz-ext-src">${srcLine}</div>` +
      `<div class="tz-ext-result">` +
        `<div class="tz-ext-result-top">${timeBlock}${stamp}</div>` +
        metaStubHTML(b1.day, b1.date, b1.zone) +
      `</div>`;

    const calUrl = buildCalendarUrl(parsed, sourceZone);
    html += `<a class="tz-ext-cal-btn" href="${calUrl}" target="_blank" rel="noopener">Add to Google Calendar &rarr;</a>`;
    showTooltipAtSelection(html);
  }

  // ── Ambiguity picker ──
  function showAmbiguityPicker(parsed, options, abbr) {
    const countWord = ({ 2: 'two', 3: 'three', 4: 'four', 5: 'five' })[options.length] || `${options.length}`;
    let html =
      `<span class="tz-ext-tag">Pick a zone</span>` +
      `<div class="tz-ext-picker-q"><span class="tz-ext-q-red">"${abbr}"</span> matches ${countWord} zones</div>` +
      `<div class="tz-ext-pick-list">`;
    options.forEach((opt, i) => {
      html += `<button class="tz-ext-amb-btn" data-idx="${i}">` +
                `<span class="tz-ext-name">${opt.name}</span>` +
                `<span class="tz-ext-meta-r">${opt.offset}</span>` +
              `</button>`;
    });
    html += `</div>`;
    showTooltipAtSelection(html);
    tooltip.style.pointerEvents = 'auto';
    tooltip.querySelectorAll('.tz-ext-amb-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const chosen = options[parseInt(btn.dataset.idx, 10)];
        showResult(parsed, chosen.iana);
      });
    });
  }

  // ── No-TZ Fallback picker ──
  const FALLBACK_TZ_OPTIONS = [
    { name: 'US Eastern',         meta: 'NYC / TOR / MIA',     iana: 'America/New_York' },
    { name: 'US Central',         meta: 'CHI / DAL / MEX',     iana: 'America/Chicago' },
    { name: 'US Mountain',        meta: 'DEN / PHX',           iana: 'America/Denver' },
    { name: 'US Pacific',         meta: 'LAX / SEA / SFO',     iana: 'America/Los_Angeles' },
    { name: 'United Kingdom',     meta: 'LON / LIS',           iana: 'Europe/London' },
    { name: 'Central Europe',     meta: 'PAR / BER / MAD',     iana: 'Europe/Paris' },
    { name: 'Hong Kong / China',  meta: 'HK / SH / TPE',       iana: 'Asia/Hong_Kong' },
    { name: 'Japan',              meta: 'TYO / SEL',           iana: 'Asia/Tokyo' },
    { name: 'India',              meta: 'DEL / BOM / CCU',     iana: 'Asia/Kolkata' },
    { name: 'Australia Eastern',  meta: 'SYD / MEL',           iana: 'Australia/Sydney' },
  ];

  function showNoTzPicker(parsed) {
    const srcTime = parsed.type === 'range'
      ? `${fmtTime12(parsed.times[0].hour, parsed.times[0].minute)} – ${fmtTime12(parsed.times[1].hour, parsed.times[1].minute)}`
      : fmtTime12(parsed.times[0].hour, parsed.times[0].minute);
    let html =
      `<span class="tz-ext-tag">Where is this from?</span>` +
      `<div class="tz-ext-picker-q">No zone detected for <span class="tz-ext-q-red">${srcTime}</span></div>` +
      `<div class="tz-ext-pick-list">`;
    FALLBACK_TZ_OPTIONS.forEach((opt, i) => {
      html += `<button class="tz-ext-amb-btn" data-idx="${i}">` +
                `<span class="tz-ext-name">${opt.name}</span>` +
                `<span class="tz-ext-meta-r">${opt.meta}</span>` +
              `</button>`;
    });
    html += `</div>` +
            `<button class="tz-ext-amb-btn tz-ext-local-opt" data-idx="local">` +
              `<span class="tz-ext-name">It's already my time</span>` +
              `<span class="tz-ext-meta-r">&crarr;</span>` +
            `</button>`;
    showTooltipAtSelection(html);
    tooltip.style.pointerEvents = 'auto';
    tooltip.querySelectorAll('.tz-ext-amb-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = btn.dataset.idx;
        if (idx === 'local') {
          showResult(parsed, localZone);
        } else {
          parsed.isLocalTime = false;
          showResult(parsed, FALLBACK_TZ_OPTIONS[parseInt(idx, 10)].iana);
        }
      });
    });
  }

  // ── Handle conversion ──
  function handleConvert(text) {
    const parsed = parseTimeString(text);
    if (!parsed) {
      showTooltipAtSelection(
        `<span class="tz-ext-tag">Couldn't read</span>` +
        `<div class="tz-ext-err-mark">無</div>` +
        `<div class="tz-ext-err-sub">No time found in selection</div>`
      );
      return;
    }
    if (parsed.isLocalTime) {
      showNoTzPicker(parsed);
      return;
    }
    const tzInfo = parsed.tzInfo;
    if (tzInfo.type === 'offset' || tzInfo.type === 'unambiguous') {
      showResult(parsed, tzInfo.iana);
    } else if (tzInfo.type === 'ambiguous') {
      showAmbiguityPicker(parsed, tzInfo.options, tzInfo.abbr);
    }
  }

  // ── Message listener ──
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'CONVERT_SELECTION') handleConvert(msg.text);
  });

  // ── Test hook: listen for window custom events (Playwright can trigger these) ──
  window.addEventListener('__tz_ext_convert__', (e) => {
    if (e.detail?.text) handleConvert(e.detail.text);
  });

  // Dismiss
  document.addEventListener('mousedown', (e) => {
    if (tooltipHost && !tooltipHost.contains(e.target)) removeTooltip();
  });
  document.addEventListener('scroll', removeTooltip, { passive: true });
})();

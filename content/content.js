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
      { label: '🇺🇸 US Central (GMT-6)', iana: 'America/Chicago' },
      { label: '🇨🇳 China (GMT+8)',       iana: 'Asia/Shanghai' },
      { label: '🇦🇺 Australia (GMT+9:30)',iana: 'Australia/Adelaide' },
    ],
    'EST': [
      { label: '🇺🇸 US Eastern (GMT-5)', iana: 'America/New_York' },
      { label: '🇦🇺 Australia (GMT+10)', iana: 'Australia/Sydney' },
    ],
    'IST': [
      { label: '🇮🇳 India (GMT+5:30)',    iana: 'Asia/Kolkata' },
      { label: '🇮🇱 Israel (GMT+2)',      iana: 'Asia/Jerusalem' },
      { label: '🇮🇪 Ireland (GMT+1)',     iana: 'Europe/Dublin' },
    ],
    'BST': [
      { label: '🇬🇧 British Summer (GMT+1)', iana: 'Europe/London' },
      { label: '🇧🇩 Bangladesh (GMT+6)',      iana: 'Asia/Dhaka' },
    ],
    'AST': [
      { label: '🇨🇦 Atlantic (GMT-4)',   iana: 'America/Halifax' },
      { label: '🇸🇦 Arabian (GMT+3)',    iana: 'Asia/Riyadh' },
    ],
    'PST': [
      { label: '🇺🇸 US Pacific (GMT-8)', iana: 'America/Los_Angeles' },
      { label: '🇵🇭 Philippines (GMT+8)',iana: 'Asia/Manila' },
    ],
    'MST': [
      { label: '🇺🇸 US Mountain (GMT-7)',iana: 'America/Denver' },
      { label: '🇲🇾 Malaysia (GMT+8)',   iana: 'Asia/Kuala_Lumpur' },
    ],
    'SST': [
      { label: '🇸🇬 Singapore (GMT+8)',  iana: 'Asia/Singapore' },
      { label: '🇼🇸 Samoa (GMT-11)',     iana: 'Pacific/Pago_Pago' },
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

  function removeTooltip() {
    if (tooltip) { tooltip.remove(); tooltip = null; }
  }

  function showTooltipAtSelection(html) {
    removeTooltip();
    tooltip = document.createElement('div');
    tooltip.className = 'tz-ext-tooltip';
    tooltip.innerHTML = html;
    document.body.appendChild(tooltip);

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

    // Decide above vs below: prefer above if it fits naturally, else use whichever side has more room.
    const naturalH = tooltip.getBoundingClientRect().height;
    const spaceAbove = anchorTop - margin - gap;
    const spaceBelow = vh - anchorBottom - margin - gap;
    let placeBelow;
    if (naturalH <= spaceAbove) placeBelow = false;
    else if (naturalH <= spaceBelow) placeBelow = true;
    else placeBelow = spaceBelow > spaceAbove;

    // Cap height to fit chosen side; CSS handles internal scroll.
    const maxH = Math.max(160, placeBelow ? spaceBelow : spaceAbove);
    tooltip.style.maxHeight = `${maxH}px`;

    const tRect = tooltip.getBoundingClientRect();
    let left = anchorX - tRect.width / 2;
    if (left < margin) left = margin;
    if (left + tRect.width > vw - margin) left = vw - tRect.width - margin;

    let top = placeBelow ? (anchorBottom + gap) : (anchorTop - tRect.height - gap);
    if (top < margin) top = margin;
    if (top + tRect.height > vh - margin) top = vh - tRect.height - margin;

    tooltip.style.left = `${left + window.scrollX}px`;
    tooltip.style.top = `${top + window.scrollY}px`;
    tooltip.style.opacity = '1';
    tooltip.style.transform = 'translateY(0)';
  }

  // ── Show result ──
  function showResult(parsed, sourceZone) {
    const refD = parsed.date ? new Date(parsed.date.year, parsed.date.month, parsed.date.day) : undefined;
    const srcLabel = formatGmtOffset(sourceZone, refD);
    const localLabel = formatGmtOffset(localZone, refD);
    let rows = '';

    if (parsed.isLocalTime) {
      const timeStr = parsed.type === 'range'
        ? `${fmtTime12(parsed.times[0].hour, parsed.times[0].minute)} – ${fmtTime12(parsed.times[1].hour, parsed.times[1].minute)}`
        : fmtTime12(parsed.times[0].hour, parsed.times[0].minute);
      rows =
        `<div class="tz-ext-local-badge">Already your time</div>` +
        `<div class="tz-ext-row"><span class="tz-ext-result">${timeStr}</span></div>` +
        `<div class="tz-ext-row"><span class="tz-ext-label">${localLabel}</span></div>`;
    } else if (parsed.type === 'range') {
      const r1 = convertTime(parsed.times[0].hour, parsed.times[0].minute, sourceZone, parsed.date);
      const r2 = convertTime(parsed.times[1].hour, parsed.times[1].minute, sourceZone, parsed.date);
      rows =
        `<div class="tz-ext-label">${srcLabel}</div>` +
        `<div class="tz-ext-row"><span class="tz-ext-source">${fmtTime12(parsed.times[0].hour, parsed.times[0].minute)} – ${fmtTime12(parsed.times[1].hour, parsed.times[1].minute)}</span></div>` +
        `<div class="tz-ext-divider"></div>` +
        `<div class="tz-ext-label">${localLabel}</div>` +
        `<div class="tz-ext-row"><span class="tz-ext-result">${r1.formatted}</span><span class="tz-ext-arrow"> – </span><span class="tz-ext-result">${r2.formatted}</span></div>`;
    } else {
      const r = convertTime(parsed.times[0].hour, parsed.times[0].minute, sourceZone, parsed.date);
      if (r.sameOffset) {
        rows =
          `<div class="tz-ext-local-badge">Same time zone</div>` +
          `<div class="tz-ext-row"><span class="tz-ext-result">${fmtTime12(parsed.times[0].hour, parsed.times[0].minute)}</span></div>` +
          `<div class="tz-ext-row"><span class="tz-ext-label">${localLabel}</span></div>`;
      } else {
        rows =
          `<div class="tz-ext-row"><span class="tz-ext-source">${fmtTime12(parsed.times[0].hour, parsed.times[0].minute)} ${srcLabel}</span></div>` +
          `<div class="tz-ext-divider"></div>` +
          `<div class="tz-ext-row"><span class="tz-ext-result">${r.formatted}</span><span class="tz-ext-label" style="margin-left:8px">${localLabel}</span></div>`;
      }
    }

    // Calendar button
    const calUrl = buildCalendarUrl(parsed, sourceZone);
    rows += `<div class="tz-ext-divider"></div><a class="tz-ext-cal-btn" href="${calUrl}" target="_blank" rel="noopener">📅 Add to Google Calendar</a>`;
    showTooltipAtSelection(rows);
  }

  // ── Ambiguity picker ──
  function showAmbiguityPicker(parsed, options, abbr) {
    let html = `<div class="tz-ext-label">⚠️ "${abbr}" is ambiguous — pick one:</div>`;
    options.forEach((opt, i) => {
      html += `<button class="tz-ext-amb-btn" data-idx="${i}">${opt.label}</button>`;
    });
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
    { label: '🇺🇸 US Eastern (NYC / TOR / MIA)',     iana: 'America/New_York' },
    { label: '🇺🇸 US Central (CHI / DAL / MEX)',     iana: 'America/Chicago' },
    { label: '🇺🇸 US Mountain (DEN / PHX)',          iana: 'America/Denver' },
    { label: '🇺🇸 US Pacific (LAX / SEA / SFO)',     iana: 'America/Los_Angeles' },
    { label: '🇬🇧 UK (LON / LIS)',                   iana: 'Europe/London' },
    { label: '🇪🇺 Central Europe (PAR / BER / MAD)', iana: 'Europe/Paris' },
    { label: '🇭🇰 Hong Kong / China (HK / SH / TPE)', iana: 'Asia/Hong_Kong' },
    { label: '🇯🇵 Japan (TYO / SEL)',                iana: 'Asia/Tokyo' },
    { label: '🇮🇳 India (DEL / BOM / CCU)',          iana: 'Asia/Kolkata' },
    { label: '🇦🇺 Australia Eastern (SYD / MEL)',    iana: 'Australia/Sydney' },
  ];

  function showNoTzPicker(parsed) {
    let html = `<div class="tz-ext-label">⏰ No timezone detected — where is this from?</div>`;
    FALLBACK_TZ_OPTIONS.forEach((opt, i) => {
      html += `<button class="tz-ext-amb-btn" data-idx="${i}">${opt.label}</button>`;
    });
    html += `<button class="tz-ext-amb-btn tz-ext-local-opt" data-idx="local">✓ It's already my time</button>`;
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
      showTooltipAtSelection(`<div class="tz-ext-label">No time detected</div>`);
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
    if (tooltip && !tooltip.contains(e.target)) removeTooltip();
  });
  document.addEventListener('scroll', removeTooltip, { passive: true });
})();

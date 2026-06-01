// ─── Popup Converter Logic ───

const ZONES = [
  { label: 'US Central (Chicago)', value: 'America/Chicago' },
  { label: 'US Eastern (New York)', value: 'America/New_York' },
  { label: 'US Mountain (Denver)', value: 'America/Denver' },
  { label: 'US Pacific (LA)', value: 'America/Los_Angeles' },
  { label: 'Hong Kong (HKT)', value: 'Asia/Hong_Kong' },
  { label: 'Taipei (CST)', value: 'Asia/Taipei' },
  { label: 'Tokyo (JST)', value: 'Asia/Tokyo' },
  { label: 'Shanghai (CST)', value: 'Asia/Shanghai' },
  { label: 'Singapore (SGT)', value: 'Asia/Singapore' },
  { label: 'London (GMT/BST)', value: 'Europe/London' },
  { label: 'Paris (CET)', value: 'Europe/Paris' },
  { label: 'UTC', value: 'Etc/UTC' },
];

const fromZone = document.getElementById('fromZone');
const toZone = document.getElementById('toZone');
const timeInput = document.getElementById('timeInput');
const convertBtn = document.getElementById('convertBtn');
const swapBtn = document.getElementById('swapBtn');
const resultEl = document.getElementById('result');
const resultTime = document.getElementById('resultTime');
const resultNote = document.getElementById('resultNote');
const resultMeta = document.getElementById('resultMeta');
const footerStamp = document.getElementById('footerStamp');

// Populate selects
ZONES.forEach(z => {
  fromZone.add(new Option(z.label, z.value));
  toZone.add(new Option(z.label, z.value));
});

// Load saved preferences
chrome.storage.sync.get(['sourceZone', 'targetZone'], (res) => {
  if (res.sourceZone) fromZone.value = res.sourceZone;
  if (res.targetZone) toZone.value = res.targetZone;
});

// Save zone changes
fromZone.addEventListener('change', () => chrome.storage.sync.set({ sourceZone: fromZone.value }));
toZone.addEventListener('change', () => chrome.storage.sync.set({ targetZone: toZone.value }));

// Footer stamp: current local time as a flight-number-ish glyph
if (footerStamp) {
  const stamp = () => {
    const n = new Date();
    const hh = pad(n.getHours());
    const mm = pad(n.getMinutes());
    footerStamp.textContent = `LOCAL ${hh}${mm}`;
  };
  stamp();
  setInterval(stamp, 30000);
}

// Swap
swapBtn.addEventListener('click', () => {
  const tmp = fromZone.value;
  fromZone.value = toZone.value;
  toZone.value = tmp;
  chrome.storage.sync.set({ sourceZone: fromZone.value, targetZone: toZone.value });
});

// Convert
convertBtn.addEventListener('click', doConvert);
timeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doConvert(); });

function doConvert() {
  const raw = timeInput.value.trim();
  if (!raw) return;

  const parsed = parseTime(raw);
  if (!parsed) {
    resultTime.textContent = '—';
    resultMeta.textContent = 'parse error';
    resultNote.textContent = 'Try "10:30 PM" or "14:00"';
    resultEl.hidden = false;
    return;
  }

  // Reference date = today in source TZ (so "11:30am" maps to today over there)
  const now = new Date();
  const refStr = now.toLocaleDateString('en-CA', { timeZone: fromZone.value }); // YYYY-MM-DD
  const [y, mo, d] = refStr.split('-').map(Number);

  // Convert wall-time-in-source-TZ to a real UTC instant (browser-TZ independent)
  const utcMs = wallTimeInZoneToUTC(y, mo, d, parsed.hour, parsed.minute, fromZone.value);
  const targetDate = new Date(utcMs);

  // Split time formatting so the big italic numeral can stand alone
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: toZone.value,
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).formatToParts(targetDate).reduce((a, p) => (a[p.type] = p.value, a), {});
  const hhmm = `${parts.hour}:${parts.minute}`;
  const ampm = (parts.dayPeriod || '').toUpperCase();

  // Meta line: WEEKDAY · DAY MON · TZ
  const metaFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: toZone.value,
    weekday: 'short', month: 'short', day: 'numeric',
    timeZoneName: 'short',
  });
  const metaParts = metaFmt.formatToParts(targetDate).reduce((a, p) => {
    (a[p.type] = a[p.type] || []).push(p.value);
    return a;
  }, {});
  const metaLine = [
    (metaParts.weekday || []).join('').toUpperCase(),
    `${(metaParts.day || []).join('')} ${(metaParts.month || []).join('').toUpperCase()}`,
    (metaParts.timeZoneName || []).join(''),
  ].filter(Boolean).join(' · ');

  // Day diff
  const srcDay = refStr;
  const tgtDay = targetDate.toLocaleDateString('en-CA', { timeZone: toZone.value });
  let dayTag = 'same day';
  if (tgtDay > srcDay) dayTag = '+1 day';
  else if (tgtDay < srcDay) dayTag = '−1 day';

  resultTime.innerHTML = `${hhmm}<span class="ampm">${ampm}</span>`;
  resultMeta.textContent = metaLine;
  resultNote.innerHTML = `<span class="day-tag">${dayTag}</span> &middot; from ${shortZone(fromZone.value)} ${pad(parsed.hour)}:${pad(parsed.minute)}`;
  resultEl.hidden = false;
}

function shortZone(tz) {
  // City portion as a compact code, e.g. "Asia/Hong_Kong" → "HONG_KONG"
  return (tz.split('/').pop() || tz).replace(/_/g, ' ').toUpperCase();
}

function parseTime(text) {
  // Match "10:30 AM", "14:00", "3pm", "10 AM"
  const m = text.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm|a\.m\.|p\.m\.)?/);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  const meridiem = m[3]?.replace(/\./g, '').toUpperCase();

  if (meridiem) {
    if (hour > 12) return null;
    if (meridiem === 'PM' && hour !== 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;
  }
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function getTZOffsetMs(utcMs, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(utcMs).reduce((a, p) => (a[p.type] = p.value, a), {});
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUTC - utcMs;
}

function wallTimeInZoneToUTC(year, month, day, hour, minute, tz) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const offset = getTZOffsetMs(guess, tz);
  // Second pass handles DST transitions where offset at guess differs from offset at actual instant
  const refined = getTZOffsetMs(guess - offset, tz);
  return guess - refined;
}

function pad(n) { return String(n).padStart(2, '0'); }

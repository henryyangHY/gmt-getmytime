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
    resultTime.textContent = '❌ Could not parse';
    resultNote.textContent = 'Try formats like "10:30 AM" or "14:00"';
    resultEl.hidden = false;
    return;
  }

  // Build date in source TZ
  const now = new Date();
  const refStr = now.toLocaleDateString('en-CA', { timeZone: fromZone.value });
  const sourceDate = new Date(`${refStr}T${pad(parsed.hour)}:${pad(parsed.minute)}:00`);

  // Source → UTC → Target
  const srcOffset = getOffset(sourceDate, fromZone.value);
  const utcMs = sourceDate.getTime() + srcOffset * 60000;

  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: toZone.value,
    hour: 'numeric', minute: '2-digit',
    hour12: true, weekday: 'short',
    month: 'short', day: 'numeric',
    timeZoneName: 'short',
  });

  // Day diff
  const srcDay = now.toLocaleDateString('en-CA', { timeZone: fromZone.value });
  const tgtDay = new Date(utcMs).toLocaleDateString('en-CA', { timeZone: toZone.value });
  let dayNote = '';
  if (tgtDay > srcDay) dayNote = '📅 Next day';
  else if (tgtDay < srcDay) dayNote = '📅 Previous day';
  else dayNote = '📅 Same day';

  resultTime.textContent = fmt.format(new Date(utcMs));
  resultNote.textContent = dayNote;
  resultEl.hidden = false;
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

function getOffset(date, tz) {
  const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const loc = new Date(date.toLocaleString('en-US', { timeZone: tz }));
  return (utc - loc) / 60000;
}

function pad(n) { return String(n).padStart(2, '0'); }

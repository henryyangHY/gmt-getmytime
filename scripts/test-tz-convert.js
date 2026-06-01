/* eslint-disable no-console */

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
  const refined = getTZOffsetMs(guess - offset, tz);
  return guess - refined;
}

function formatterFor(tz) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: true,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function convert(hour, minute, fromTZ, toTZ, year, month, day) {
  const utcMs = wallTimeInZoneToUTC(year, month, day, hour, minute, fromTZ);
  return formatterFor(toTZ).format(new Date(utcMs));
}

function actualParts(hour, minute, fromTZ, toTZ, year, month, day) {
  const utcMs = wallTimeInZoneToUTC(year, month, day, hour, minute, fromTZ);
  const parts = formatterFor(toTZ).formatToParts(new Date(utcMs)).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});

  return {
    utcMs,
    formatted: convert(hour, minute, fromTZ, toTZ, year, month, day),
    weekday: parts.weekday,
    month: parts.month,
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    dayPeriod: parts.dayPeriod,
    timeZoneName: parts.timeZoneName,
  };
}

function matchesExpected(actual, expected) {
  return Object.entries(expected).every(([key, value]) => {
    if (Array.isArray(value)) return value.includes(actual[key]);
    return actual[key] === value;
  });
}

const exactCases = [
  {
    name: '1 HKT to Chicago summer previous day',
    input: [11, 30, 'Asia/Hong_Kong', 'America/Chicago', 2026, 6, 1],
    expectedText: '10:30 PM, May 31, CDT',
    expected: { month: 'May', day: 31, hour: 10, minute: 30, dayPeriod: 'PM' },
  },
  {
    name: '2 Tokyo to London summer',
    input: [9, 0, 'Asia/Tokyo', 'Europe/London', 2026, 6, 1],
    expectedText: '1:00 AM, Jun 1, BST',
    expected: { month: 'Jun', day: 1, hour: 1, minute: 0, dayPeriod: 'AM' },
  },
  {
    name: '3 Los Angeles to Taipei next day',
    input: [14, 0, 'America/Los_Angeles', 'Asia/Taipei', 2026, 6, 1],
    expectedText: '5:00 AM, Jun 2, CST/GMT+8',
    expected: { month: 'Jun', day: 2, hour: 5, minute: 0, dayPeriod: 'AM' },
  },
  {
    name: '4 UTC midnight to New York previous day',
    input: [0, 0, 'Etc/UTC', 'America/New_York', 2026, 6, 1],
    expectedText: '8:00 PM, May 31, EDT',
    expected: { month: 'May', day: 31, hour: 8, minute: 0, dayPeriod: 'PM' },
  },
  {
    name: '7 HKT to Los Angeles winter same day',
    input: [23, 45, 'Asia/Hong_Kong', 'America/Los_Angeles', 2026, 12, 15],
    expectedText: '7:45 AM, Dec 15, PST',
    expected: { month: 'Dec', day: 15, hour: 7, minute: 45, dayPeriod: 'AM' },
  },
];

const results = [];

for (const testCase of exactCases) {
  const actual = actualParts(...testCase.input);
  const pass = matchesExpected(actual, testCase.expected);
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'} ${testCase.name}`);
  console.log(`  Expected: ${testCase.expectedText}`);
  console.log(`  Actual:   ${actual.formatted}`);
}

{
  const name = '5 DST spring-forward New York nonexistent 02:30 resolves sanely';
  let actual;
  let pass = false;
  try {
    const utcMs = wallTimeInZoneToUTC(2026, 3, 8, 2, 30, 'America/New_York');
    const hourUTC = new Date(utcMs).getUTCHours();
    actual = `${new Date(utcMs).toISOString()} (UTC hour ${hourUTC})`;
    pass = Number.isFinite(utcMs) && (hourUTC === 6 || hourUTC === 7);
  } catch (error) {
    actual = `threw ${error && error.stack ? error.stack : error}`;
  }
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
  console.log('  Expected: no throw and UTC hour is 6 or 7');
  console.log(`  Actual:   ${actual}`);
}

{
  const name = '6 DST fall-back New York ambiguous 01:30 returns finite instant';
  let actual;
  let pass = false;
  try {
    const utcMs = wallTimeInZoneToUTC(2026, 11, 1, 1, 30, 'America/New_York');
    actual = `${new Date(utcMs).toISOString()} (finite: ${Number.isFinite(utcMs)})`;
    pass = Number.isFinite(utcMs);
  } catch (error) {
    actual = `threw ${error && error.stack ? error.stack : error}`;
  }
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
  console.log('  Expected: finite UTC timestamp, one of the valid instants');
  console.log(`  Actual:   ${actual}`);
}

const failed = results.filter((pass) => !pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);

if (failed > 0) {
  process.exit(1);
}

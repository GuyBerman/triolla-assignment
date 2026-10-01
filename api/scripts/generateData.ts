/**
 * Generates the sample logger files in `data/`.
 *
 * The generated CSVs are committed, so nobody needs to run this to try the
 * project. It exists because the assignment gives sixteen rows and says the
 * real sheet is about three thousand, and because hand-writing a week of
 * fifteen-minute readings is not a good use of anyone's time.
 *
 * Two rules it follows:
 *  - every row quoted in the brief appears verbatim, as a scripted anchor, so
 *    the awkward cases are really in the data and not just described;
 *  - each file has a different shape, because Summer said the columns move
 *    around and the files do not look the same from branch to branch.
 *
 * Run with: npm run generate
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, '../../data');

// Deterministic noise: a fixed seed means regenerating does not churn the diff.
let seed = 20260914;
function random(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function jitter(amount: number): number {
  return (random() * 2 - 1) * amount;
}
const round1 = (value: number) => Math.round(value * 10) / 10;

const MINUTE = 60_000;

/**
 * Every logger reports up to the same moment, apart from one that is
 * deliberately dead and one whose logger was moved out. Without that, the most
 * recent fridge in the data makes every other fridge look like it stopped
 * reporting, and the whole dashboard reads "no data".
 */
const SPAN_START = '2026-09-14T06:00';
const SPAN_END = '2026-09-18T18:00';

/** Wall-clock Israeli time in, UTC-naive Date out. Only used for formatting. */
function at(iso: string): number {
  return new Date(`${iso}:00Z`).getTime();
}

function formatIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
}
function formatDayFirstDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}
function formatClock(ms: number): string {
  return new Date(ms).toISOString().slice(11, 16);
}

type Behaviour = 'normal' | 'doorOpens' | 'errors' | 'slowDrift';

interface Reading {
  ms: number;
  /** String, because some readings are "ERR" rather than a number. */
  value: string;
}

interface SynthSpec {
  from: string;
  to: string;
  stepMin: number;
  baseC: number;
  behaviour: Behaviour;
  /** Blocks of time with no readings at all, as [from, to). */
  gaps?: [string, string][];
  /** Degrees per hour, for slowDrift. */
  driftPerHour?: number;
}

function synthesise(spec: SynthSpec): Reading[] {
  const start = at(spec.from);
  const end = at(spec.to);
  const step = spec.stepMin * MINUTE;
  const gaps = (spec.gaps ?? []).map(([from, to]) => [at(from), at(to)] as const);

  const readings: Reading[] = [];
  let index = 0;

  for (let ms = start; ms <= end; ms += step, index += 1) {
    if (gaps.some(([from, to]) => ms >= from && ms < to)) continue;

    switch (spec.behaviour) {
      case 'normal': {
        readings.push({ ms, value: round1(spec.baseC + jitter(0.35)).toFixed(1) });
        break;
      }
      case 'doorOpens': {
        // One reading well above the limit, then straight back down. This is
        // the case that must never raise an alarm.
        const isDoorOpen = index > 0 && index % 47 === 0;
        const value = isDoorOpen
          ? spec.baseC + 5 + random()
          : spec.baseC + jitter(0.35);
        readings.push({ ms, value: round1(value).toFixed(1) });
        break;
      }
      case 'errors': {
        // The Haifa logger drops a reading now and then.
        if (index > 0 && index % 31 === 0) {
          readings.push({ ms, value: 'ERR' });
        } else {
          // Emitted in Fahrenheit; this logger is the old one.
          const celsius = spec.baseC + jitter(0.4);
          readings.push({ ms, value: round1(celsius * 1.8 + 32).toFixed(1) });
        }
        break;
      }
      case 'slowDrift': {
        // A fridge quietly dying: still under the limit for most of the ramp,
        // which is exactly the case Summer lost a fridge of dairy to.
        const hours = (ms - start) / (60 * MINUTE);
        const value = spec.baseC + hours * (spec.driftPerHour ?? 0.05) + jitter(0.2);
        readings.push({ ms, value: round1(value).toFixed(1) });
        break;
      }
    }
  }

  return readings;
}

interface Series {
  loggerCode: string;
  branch: string;
  fridge: string;
  /** Rows quoted in the brief, reproduced exactly. */
  scripted?: Reading[];
  synth?: SynthSpec[];
}

function build(series: Series): Reading[] {
  const scripted = series.scripted ?? [];
  const synth = (series.synth ?? []).flatMap(synthesise);
  const takenTimes = new Set(scripted.map((reading) => reading.ms));
  return [...scripted, ...synth.filter((reading) => !takenTimes.has(reading.ms))].sort(
    (a, b) => a.ms - b.ms,
  );
}

// ---------------------------------------------------------------------------
// File 1: Jerusalem dairy. The clean baseline, in ISO format, and the file
// that carries the duplicate row and the two-hour hole from the brief.
// ---------------------------------------------------------------------------
const jerusalem: Series = {
  loggerCode: 'TL-0512',
  branch: 'Jerusalem',
  fridge: 'Dairy',
  scripted: [
    { ms: at('2026-09-14T06:00'), value: '3.8' },
    { ms: at('2026-09-14T06:15'), value: '3.9' },
    // The same reading twice. Summer re-pastes, so this is normal for her.
    { ms: at('2026-09-14T06:15'), value: '3.9' },
    // ...then nothing until 08:30. Logger died, battery, or a failed save -
    // the file cannot tell us which, so neither can the app.
    { ms: at('2026-09-14T08:30'), value: '4.0' },
  ],
  synth: [
    {
      from: '2026-09-14T08:45',
      to: SPAN_END,
      stepMin: 15,
      baseC: 3.9,
      behaviour: 'normal',
    },
  ],
};

// ---------------------------------------------------------------------------
// File 2: Haifa dairy. "The old logger in Haifa shows the numbers differently
// from all the others" - Fahrenheit, day-first dates, separate date and time
// columns, and ERR where it failed to read.
// ---------------------------------------------------------------------------
const haifa: Series = {
  loggerCode: 'TL-0231',
  branch: 'Haifa',
  fridge: 'Dairy',
  scripted: [
    { ms: at('2026-09-14T06:00'), value: '38.3' },
    { ms: at('2026-09-14T06:15'), value: '39.0' },
    { ms: at('2026-09-14T06:30'), value: 'ERR' },
  ],
  synth: [
    {
      from: '2026-09-14T06:45',
      to: SPAN_END,
      stepMin: 15,
      baseC: 3.6,
      behaviour: 'errors',
    },
  ],
};

// ---------------------------------------------------------------------------
// File 3: Tel Aviv walk-in. Columns in a different order, a row with the
// branch in lower case, one reading out of chronological order, and the
// single-reading spike from a delivery.
// ---------------------------------------------------------------------------
const telAvivWalkIn: Series = {
  loggerCode: 'TL-0417',
  branch: 'Tel Aviv',
  fridge: 'Walk-in',
  scripted: [
    { ms: at('2026-09-14T06:00'), value: '4.1' },
    // "someone opens the door for a delivery and you see a jump for one
    // reading, and that is fine"
    { ms: at('2026-09-14T06:15'), value: '9.4' },
    { ms: at('2026-09-14T06:30'), value: '4.3' },
    // Listed last in the brief but earliest in time.
    { ms: at('2026-09-14T05:45'), value: '4.0' },
  ],
  synth: [
    {
      // Stops the moment the logger is moved out. After this the walk-in has
      // no logger in it at all, which is a thing Summer should be told.
      from: '2026-09-14T06:45',
      to: '2026-09-17T05:45',
      stepMin: 15,
      baseC: 4.2,
      behaviour: 'doorOpens',
    },
  ],
};

// ---------------------------------------------------------------------------
// File 4: the same logger, after Summer moved it. "We moved one of the Tel
// Aviv loggers into the new display fridge last week."
// ---------------------------------------------------------------------------
const telAvivDisplay: Series = {
  loggerCode: 'TL-0417',
  branch: 'tel aviv',
  fridge: 'Display 2',
  scripted: [{ ms: at('2026-09-17T06:00'), value: '3.7' }],
  synth: [
    {
      from: '2026-09-17T06:15',
      to: SPAN_END,
      stepMin: 15,
      baseC: 3.8,
      behaviour: 'doorOpens',
    },
  ],
};

// ---------------------------------------------------------------------------
// File 5: Rishon LeZion cream cakes. The ramp from the brief, which then stays
// above the limit for hours before someone notices - a real excursion, not a
// door opening.
// ---------------------------------------------------------------------------
const rishon: Series = {
  loggerCode: 'TL-0388',
  branch: 'Rishon LeZion',
  fridge: 'Cream cakes',
  scripted: [
    { ms: at('2026-09-14T06:00'), value: '4.6' },
    { ms: at('2026-09-14T06:15'), value: '5.4' },
    { ms: at('2026-09-14T06:30'), value: '6.3' },
    { ms: at('2026-09-14T06:45'), value: '7.1' },
  ],
  synth: [
    // Keeps climbing, sits warm for three hours, then is fixed.
    {
      from: '2026-09-14T07:00',
      to: '2026-09-14T10:00',
      stepMin: 15,
      baseC: 7.8,
      behaviour: 'normal',
    },
    {
      from: '2026-09-14T10:15',
      to: SPAN_END,
      stepMin: 15,
      baseC: 4.4,
      behaviour: 'normal',
      // The engineer unplugged the logger while working on it.
      gaps: [['2026-09-15T11:00', '2026-09-15T14:00']],
    },
  ],
};

// ---------------------------------------------------------------------------
// The rest of the estate. Twelve branches in total, so nine more here, plus
// one fridge that drifts upward for two days while staying under five degrees
// for most of it - the case that only the trend check catches.
// ---------------------------------------------------------------------------
/** These loggers report hourly rather than every fifteen minutes. */
const plain = (baseC: number, behaviour: Behaviour = 'normal'): SynthSpec[] => [
  { from: SPAN_START, to: SPAN_END, stepMin: 60, baseC, behaviour },
];

const otherBranches: Series[] = [
  {
    loggerCode: 'TL-0604',
    branch: 'Netanya',
    fridge: 'Dairy',
    synth: [
      {
        // The Rishon story again, but drawn out: this one creeps up for four
        // days. It stays under five degrees for the first two, which is the
        // window in which someone could still save the stock.
        from: SPAN_START,
        to: SPAN_END,
        stepMin: 60,
        baseC: 2.4,
        behaviour: 'slowDrift',
        driftPerHour: 0.055,
      },
    ],
  },
  { loggerCode: 'TL-0605', branch: 'Netanya', fridge: 'Cream cakes', synth: plain(4.1) },
  { loggerCode: 'TL-0711', branch: "Be'er Sheva", fridge: 'Dairy', synth: plain(3.4, 'doorOpens') },
  { loggerCode: 'TL-0712', branch: "Be'er Sheva", fridge: 'Walk-in', synth: plain(2.9) },
  { loggerCode: 'TL-0820', branch: 'Petah Tikva', fridge: 'Dairy', synth: plain(3.7) },
  {
    loggerCode: 'TL-0821',
    branch: 'Petah Tikva',
    fridge: 'Display 1',
    synth: [
      {
        // Stops reporting halfway through and never comes back. Battery, dead
        // logger, or nobody downloaded it - the file cannot say which, and
        // neither can we. It must not read as a fridge that is fine.
        from: SPAN_START,
        to: '2026-09-16T09:00',
        stepMin: 60,
        baseC: 4.0,
        behaviour: 'normal',
      },
    ],
  },
  { loggerCode: 'TL-0933', branch: 'Ashdod', fridge: 'Dairy', synth: plain(3.1) },
  { loggerCode: 'TL-0934', branch: 'Ashdod', fridge: 'Cream cakes', synth: plain(4.3, 'doorOpens') },
  { loggerCode: 'TL-1041', branch: 'Holon', fridge: 'Dairy', synth: plain(3.6) },
  {
    loggerCode: 'TL-1042',
    branch: 'Holon',
    fridge: 'Walk-in',
    synth: [
      { from: SPAN_START, to: '2026-09-17T17:00', stepMin: 60, baseC: 2.7, behaviour: 'normal' },
      {
        // Starts climbing in the last day but is still inside the limit at the
        // end, so only the trend check has anything to say about it.
        from: '2026-09-17T18:00',
        to: SPAN_END,
        stepMin: 60,
        baseC: 2.8,
        behaviour: 'slowDrift',
        driftPerHour: 0.075,
      },
    ],
  },
  { loggerCode: 'TL-1150', branch: 'Bat Yam', fridge: 'Dairy', synth: plain(3.9) },
  { loggerCode: 'TL-1261', branch: 'Herzliya', fridge: 'Dairy', synth: plain(3.3) },
  { loggerCode: 'TL-1262', branch: 'Herzliya', fridge: 'Display 1', synth: plain(4.5, 'doorOpens') },
  { loggerCode: 'TL-1370', branch: "Ra'anana", fridge: 'Dairy', synth: plain(3.8) },
  { loggerCode: 'TL-1371', branch: "Ra'anana", fridge: 'Cream cakes', synth: plain(4.2) },
];

// ---------------------------------------------------------------------------
// Writers. One per file shape.
// ---------------------------------------------------------------------------
function toCsv(rows: string[][]): string {
  return `${rows
    .map((row) =>
      row
        .map((field) => (/[",\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field))
        .join(','),
    )
    .join('\n')}\n`;
}

/** Summer's own column order, with a combined ISO timestamp. */
function writeStandard(file: string, series: Series[], branchOverride?: (index: number) => string) {
  const rows: string[][] = [['Logger', 'Branch', 'Fridge', 'Time', 'Temp']];
  let index = 0;
  for (const item of series) {
    for (const reading of build(item)) {
      rows.push([
        item.loggerCode,
        branchOverride ? branchOverride(index) : item.branch,
        item.fridge,
        formatIso(reading.ms),
        reading.value,
      ]);
      index += 1;
    }
  }
  writeFileSync(resolve(dataDir, file), toCsv(rows));
  return rows.length - 1;
}

/** The old Haifa logger: different column order, split date and time, Fahrenheit. */
function writeHaifa(file: string, series: Series) {
  const rows: string[][] = [['Branch', 'Fridge', 'Logger No', 'Date', 'Time', 'Temp (F)']];
  for (const reading of build(series)) {
    rows.push([
      series.branch,
      series.fridge,
      series.loggerCode,
      formatDayFirstDate(reading.ms),
      formatClock(reading.ms),
      reading.value,
    ]);
  }
  writeFileSync(resolve(dataDir, file), toCsv(rows));
  return rows.length - 1;
}

/** Tel Aviv's newer logger: same data, columns in a completely different order. */
function writeReordered(file: string, series: Series) {
  const rows: string[][] = [['Recorded At', 'Temperature', 'Fridge', 'Site', 'Device ID']];
  const readings = build(series);
  readings.forEach((reading, index) => {
    rows.push([
      formatIso(reading.ms),
      reading.value,
      series.fridge,
      // One row with the branch in lower case, as in the brief.
      index === 1 ? series.branch.toLowerCase() : series.branch,
      series.loggerCode,
    ]);
  });

  // The brief lists Tel Aviv's 05:45 reading after its 06:30 one, so the file
  // is deliberately not in chronological order.
  const header = rows[0]!;
  const body = rows.slice(1);
  const earliest = body.shift();
  if (earliest) body.splice(Math.min(3, body.length), 0, earliest);

  writeFileSync(resolve(dataDir, file), toCsv([header, ...body]));
  return body.length;
}

mkdirSync(dataDir, { recursive: true });

const counts = [
  ['jerusalem-dairy.csv', writeStandard('jerusalem-dairy.csv', [jerusalem])],
  ['haifa-dairy.csv', writeHaifa('haifa-dairy.csv', haifa)],
  ['telaviv-walkin.csv', writeReordered('telaviv-walkin.csv', telAvivWalkIn)],
  ['telaviv-display2.csv', writeStandard('telaviv-display2.csv', [telAvivDisplay])],
  ['rishon-creamcakes.csv', writeStandard('rishon-creamcakes.csv', [rishon])],
  ['other-branches.csv', writeStandard('other-branches.csv', otherBranches)],
] as const;

let total = 0;
for (const [name, count] of counts) {
  console.log(`${name.padEnd(26)} ${String(count).padStart(5)} rows`);
  total += count;
}
console.log(`${'total'.padEnd(26)} ${String(total).padStart(5)} rows`);

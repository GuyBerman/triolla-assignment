type TimestampResult =
  | {
      ok: true;
      at: Date;
      /**
       * True when the date could have been read either day-first or
       * month-first and we chose day-first. Surfaced in the upload report so
       * the assumption is visible rather than buried.
       */
      dayFirstAssumed: boolean;
    }
  | { ok: false; reason: string };

/**
 * How many milliseconds a time zone is ahead of UTC at a given instant.
 * Derived from Intl rather than hardcoded, so Israeli daylight saving is
 * handled without pulling in a date library.
 */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));

  const get = (type: string): number => {
    const part = parts.find((candidate) => candidate.type === type);
    return part ? Number(part.value) : 0;
  };

  const asIfUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    // Some ICU versions render midnight as hour 24 under hour12: false.
    get('hour') % 24,
    get('minute'),
    get('second'),
  );

  return asIfUtc - utcMs;
}

/**
 * Interprets a wall-clock reading ("2026-09-14 06:00", no offset) as local
 * time in `timeZone` and returns the matching UTC instant.
 *
 * The two-pass correction matters at daylight-saving boundaries: the offset
 * depends on the instant, but we only know the instant after applying the
 * offset, so the first guess can land on the wrong side of a transition.
 */
function wallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstOffset = zoneOffsetMs(guess, timeZone);
  let result = guess - firstOffset;

  const secondOffset = zoneOffsetMs(result, timeZone);
  if (secondOffset !== firstOffset) {
    result = guess - secondOffset;
  }

  return new Date(result);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function expandTwoDigitYear(year: number): number {
  if (year >= 100) return year;
  // Logger files are recent; a two-digit year below 70 means 20xx.
  return year < 70 ? 2000 + year : 1900 + year;
}

interface TimeOfDay {
  hour: number;
  minute: number;
  second: number;
}

const TIME_PATTERN = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

export function parseTimeOfDay(raw: string): TimeOfDay | null {
  let text = raw.trim().toLowerCase();
  if (text === '') return null;

  // Some loggers export a 12-hour clock.
  let meridiem: 'am' | 'pm' | null = null;
  const meridiemMatch = text.match(/\s*([ap])\.?m\.?$/);
  if (meridiemMatch) {
    meridiem = meridiemMatch[1] === 'a' ? 'am' : 'pm';
    text = text.slice(0, meridiemMatch.index).trim();
  }

  const match = text.match(TIME_PATTERN);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] === undefined ? 0 : Number(match[3]);

  if (meridiem !== null) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === 'am' && hour === 12) hour = 0;
    if (meridiem === 'pm' && hour !== 12) hour += 12;
  }

  if (hour > 23 || minute > 59 || second > 59) return null;

  return { hour, minute, second };
}

// 2026-09-14, optionally with a time and an explicit offset.
const ISO_PATTERN =
  /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*(z|[+-]\d{2}:?\d{2})?$/i;

// 14/09/2026 or 14.09.26 or 14-09-2026, optionally with a time.
const SLASH_PATTERN =
  /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})(?:[T\s,]+(.+))?$/;

function build(
  year: number,
  month: number,
  day: number,
  time: TimeOfDay,
  timeZone: string,
  dayFirstAssumed: boolean,
): TimestampResult {
  if (month < 1 || month > 12) {
    return { ok: false, reason: `month ${month} is not a real month` };
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    return { ok: false, reason: `${day}/${month}/${year} is not a real date` };
  }

  return {
    ok: true,
    at: wallClockToUtc(year, month, day, time.hour, time.minute, time.second, timeZone),
    dayFirstAssumed,
  };
}

/**
 * Parses the timestamp formats present in the sample data and the obvious
 * neighbours. Deliberately strict: anything unrecognised is rejected with a
 * reason rather than coerced, because a silently misparsed timestamp puts a
 * reading in the wrong place on the chart and no one ever notices.
 */
export function parseTimestamp(raw: string, timeZone: string): TimestampResult {
  const text = raw.trim().replace(/\s+/g, ' ');
  if (text === '') {
    return { ok: false, reason: 'empty timestamp' };
  }

  const iso = text.match(ISO_PATTERN);
  if (iso) {
    const [, yearText, monthText, dayText, hourText, minuteText, secondText, offsetText] = iso;

    // An explicit Z or +03:00 means the logger told us its offset, so trust it
    // and skip the time-zone assumption entirely.
    if (offsetText !== undefined) {
      const parsed = new Date(text.replace(' ', 'T'));
      if (Number.isNaN(parsed.getTime())) {
        return { ok: false, reason: `could not read "${raw}" as a date` };
      }
      return { ok: true, at: parsed, dayFirstAssumed: false };
    }

    const time: TimeOfDay =
      hourText === undefined
        ? { hour: 0, minute: 0, second: 0 }
        : {
            hour: Number(hourText),
            minute: Number(minuteText),
            second: secondText === undefined ? 0 : Number(secondText),
          };

    if (time.hour > 23 || time.minute > 59 || time.second > 59) {
      return { ok: false, reason: `"${raw}" has an impossible time` };
    }

    return build(
      Number(yearText),
      Number(monthText),
      Number(dayText),
      time,
      timeZone,
      false,
    );
  }

  const slash = text.match(SLASH_PATTERN);
  if (slash) {
    const [, firstText, secondText, yearText, timeText] = slash;
    const first = Number(firstText);
    const second = Number(secondText);
    const year = expandTwoDigitYear(Number(yearText));

    const time = timeText === undefined ? { hour: 0, minute: 0, second: 0 } : parseTimeOfDay(timeText);
    if (time === null) {
      return { ok: false, reason: `could not read the time in "${raw}"` };
    }

    // Haifa's "14/09/2026" settles it: a first component above 12 can only be
    // a day. Where both halves are 12 or below the format is genuinely
    // ambiguous, and we assume day-first (Israeli convention) and say so.
    if (first > 12) {
      return build(year, second, first, time, timeZone, false);
    }
    if (second > 12) {
      return build(year, first, second, time, timeZone, false);
    }
    return build(year, second, first, time, timeZone, true);
  }

  return { ok: false, reason: `unrecognised date format "${raw}"` };
}

/**
 * For files that keep the date and the clock time in separate columns.
 */
export function parseSplitDateTime(
  dateRaw: string,
  timeRaw: string,
  timeZone: string,
): TimestampResult {
  const time = parseTimeOfDay(timeRaw);
  if (time === null) {
    return { ok: false, reason: `could not read the time "${timeRaw}"` };
  }

  const datePart = parseTimestamp(dateRaw, timeZone);
  if (!datePart.ok) return datePart;

  // Re-read the calendar date in the target zone, then reattach the real time,
  // so the offset is computed for the correct wall-clock moment.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(datePart.at);
  const [year, month, day] = parts.split('-').map(Number);

  return build(year!, month!, day!, time, timeZone, datePart.dayFirstAssumed);
}

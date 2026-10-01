/**
 * Display formatting. Pinned to the loggers' time zone rather than the phone's,
 * so that a screenshot of the app and the report the API generates always say
 * the same thing - even if Summer happens to be abroad.
 */
export const APP_TIMEZONE = 'Asia/Jerusalem';

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIMEZONE,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(new Date(iso))
    .replace(',', '');
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

/** "16 Sep 05:00" - a chart axis label short enough to fit several across a phone. */
export function formatDayAndTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIMEZONE,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(new Date(iso))
    .replace(',', '');
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

/** "3 hours 15 minutes", "45 minutes", "2 days 4 hours" */
export function describeDuration(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 1) return 'less than a minute';

  const days = Math.floor(rounded / 1440);
  const hours = Math.floor((rounded % 1440) / 60);
  const mins = rounded % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  if (mins > 0 && days === 0) parts.push(`${mins} ${mins === 1 ? 'minute' : 'minutes'}`);

  return parts.join(' ');
}

export function formatTemperature(celsius: number | null): string {
  if (celsius === null) return '--';
  return `${celsius.toFixed(1)}°`;
}

/** For the date inputs on the report screen. */
export function toDateInput(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

/**
 * Formatting helpers shared by the status explanations and the inspector
 * report. Everything is rendered in the loggers' own time zone, because an
 * inspector asking "when did this fridge go above five" means local time, and
 * a UTC timestamp in that answer would be actively misleading.
 */

export function formatDateTime(value: string | number | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(new Date(value))
    .replace(',', '');
}

export function formatDate(value: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
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
  // Only mention minutes when the total is small enough for them to matter.
  if (mins > 0 && days === 0) parts.push(`${mins} ${mins === 1 ? 'minute' : 'minutes'}`);

  return parts.join(' ');
}

export function formatTemperature(celsius: number): string {
  return `${celsius.toFixed(1)}°C`;
}

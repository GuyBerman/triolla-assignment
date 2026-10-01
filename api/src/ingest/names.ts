/**
 * Summer types the branch and fridge names in by hand, so the same place
 * arrives spelled several ways. The sample sheet already contains both
 * "Tel Aviv" and "tel aviv"; without folding, that is two branches on her
 * dashboard and a fridge that appears to have no history.
 */
export function canonicalize(value: string): string {
  return value
    .normalize('NFKD')
    // strip combining accents, so "Be'er Sheva" and "Beer Sheva" agree
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u2018\u2019'`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Logger codes are machine-written, so they only need case and separator
 * normalising: "tl-0512", "TL 0512" and "TL-0512" are one logger.
 */
export function canonicalizeLoggerCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Picks the nicer of two spellings of the same name for display. Prefers the
 * one that looks deliberately capitalised, so the dashboard shows "Tel Aviv"
 * rather than whichever spelling happened to be uploaded first.
 */
export function preferredDisplayName(existing: string, candidate: string): string {
  const score = (s: string) => {
    const letters = s.replace(/[^a-zA-Z]/g, '');
    if (letters.length === 0) return 0;
    const isAllLower = letters === letters.toLowerCase();
    const isAllUpper = letters === letters.toUpperCase();
    if (isAllLower || isAllUpper) return 0;
    return 1;
  };
  return score(candidate) > score(existing) ? candidate : existing;
}

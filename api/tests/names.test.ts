import { describe, expect, it } from 'vitest';

import { canonicalize, canonicalizeLoggerCode, preferredDisplayName } from '../src/ingest/names';

describe('branch names Summer typed by hand', () => {
  it('treats "tel aviv" and "Tel Aviv" as one branch', () => {
    // Both spellings are in the sample sheet. Without this they are two
    // branches, and the display fridge looks like it has no history.
    expect(canonicalize('tel aviv')).toBe(canonicalize('Tel Aviv'));
  });

  it('ignores stray punctuation and spacing', () => {
    expect(canonicalize("Be'er Sheva")).toBe(canonicalize('Beer Sheva'));
    expect(canonicalize('Rishon  LeZion ')).toBe(canonicalize('rishon lezion'));
    expect(canonicalize('Petah-Tikva')).toBe(canonicalize('Petah Tikva'));
  });

  it('still keeps genuinely different branches apart', () => {
    expect(canonicalize('Holon')).not.toBe(canonicalize('Holon 2'));
    expect(canonicalize('Tel Aviv')).not.toBe(canonicalize('Tel Mond'));
  });
});

describe('logger codes', () => {
  it('normalises case and separators', () => {
    expect(canonicalizeLoggerCode('tl-0512')).toBe('TL-0512');
    expect(canonicalizeLoggerCode('TL 0512')).toBe('TL-0512');
    expect(canonicalizeLoggerCode('  TL_0512 ')).toBe('TL-0512');
  });

  it('keeps different loggers apart', () => {
    expect(canonicalizeLoggerCode('TL-0512')).not.toBe(canonicalizeLoggerCode('TL-0513'));
  });
});

describe('choosing which spelling to show', () => {
  it('prefers the properly capitalised one', () => {
    expect(preferredDisplayName('tel aviv', 'Tel Aviv')).toBe('Tel Aviv');
    expect(preferredDisplayName('Tel Aviv', 'tel aviv')).toBe('Tel Aviv');
    expect(preferredDisplayName('TEL AVIV', 'Tel Aviv')).toBe('Tel Aviv');
  });

  it('leaves an already-good name alone', () => {
    expect(preferredDisplayName('Tel Aviv', 'Tel Aviv')).toBe('Tel Aviv');
  });
});

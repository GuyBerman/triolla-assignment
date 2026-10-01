import { describe, expect, it } from 'vitest';

import {
  assessDeclaredUnit,
  fahrenheitToCelsius,
  parseTemperature,
} from '../src/ingest/temperature';

describe('ordinary readings', () => {
  it('reads a plain number', () => {
    const result = parseTemperature('3.8');
    expect(result).toEqual({ ok: true, value: 3.8, unitFromCell: null });
  });

  it('reads negatives, for freezers', () => {
    const result = parseTemperature('-18.5');
    expect(result.ok && result.value).toBe(-18.5);
  });

  it('copes with a decimal comma and a degree symbol', () => {
    expect(parseTemperature('3,8').ok && parseTemperature('3,8')).toMatchObject({ value: 3.8 });
    expect(parseTemperature('4.1 °C')).toMatchObject({ ok: true, value: 4.1, unitFromCell: 'C' });
    expect(parseTemperature('38.3F')).toMatchObject({ ok: true, value: 38.3, unitFromCell: 'F' });
  });
});

describe('the Haifa logger', () => {
  it('converts Fahrenheit to Celsius', () => {
    // 38.3F is a perfectly normal fridge, not an emergency. Summer has been
    // doing this conversion in her head.
    expect(fahrenheitToCelsius(38.3)).toBe(3.5);
    expect(fahrenheitToCelsius(39.0)).toBe(3.89);
  });

  it('does not leave floating-point noise in the number', () => {
    // (38.3 - 32) * 5/9 is 3.5000000000000004 before rounding, and an
    // inspector-facing report should never show that.
    expect(String(fahrenheitToCelsius(38.3))).toBe('3.5');
  });

  it('converts the freezing point exactly', () => {
    expect(fahrenheitToCelsius(32)).toBe(0);
  });
});

describe('readings the logger could not take', () => {
  it('refuses ERR rather than reading it as zero', () => {
    const result = parseTemperature('ERR');
    expect(result.ok).toBe(false);
    // Zero would look like a beautifully cold fridge, which is the dangerous
    // failure here: a missing reading must never read as a safe one.
    if (!result.ok) expect(result.reason).toContain('ERR');
  });

  it.each(['', '   ', '--', 'N/A', 'null', '#VALUE!', 'FAIL'])(
    'refuses %s',
    (raw) => {
      expect(parseTemperature(raw).ok).toBe(false);
    },
  );

  it('refuses a logger fault code dressed up as a number', () => {
    expect(parseTemperature('-999').ok).toBe(false);
    expect(parseTemperature('1348').ok).toBe(false);
  });
});

describe('guarding against a mis-registered unit', () => {
  const fahrenheitLooking = [38.3, 39.0, 38.1, 38.8, 37.9, 38.4, 39.2, 38.0];

  it('refuses to import Fahrenheit numbers as if they were Celsius', () => {
    // This is the Haifa mistake in the other direction: if we did not notice,
    // the fridge would be recorded at 38 degrees for ever.
    const result = assessDeclaredUnit('TL-0231', 'C', fahrenheitLooking);
    expect(result.level).toBe('reject');
    if (result.level === 'reject') {
      expect(result.message).toContain('Fahrenheit');
      expect(result.message).toContain('upload the file again');
    }
  });

  it('only warns about a fridge that is merely broken', () => {
    // A dying fridge genuinely can sit at 22 degrees, so this must not be
    // refused - refusing it would hide exactly the disaster we care about.
    const result = assessDeclaredUnit('TL-0999', 'C', [21.5, 22.1, 22.8, 21.9, 23.0, 22.4]);
    expect(result.level).toBe('warn');
  });

  it('says nothing about a healthy fridge', () => {
    expect(assessDeclaredUnit('TL-0512', 'C', [3.8, 3.9, 4.0, 4.1, 3.7, 3.9]).level).toBe('none');
  });

  it('says nothing about a logger already registered as Fahrenheit', () => {
    expect(assessDeclaredUnit('TL-0231', 'F', fahrenheitLooking).level).toBe('none');
  });

  it('does not draw conclusions from a handful of readings', () => {
    expect(assessDeclaredUnit('TL-0231', 'C', [38.3, 39.0]).level).toBe('none');
  });
});

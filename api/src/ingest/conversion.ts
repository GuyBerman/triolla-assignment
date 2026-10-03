import type { ConversionRule } from '../types';
import { canonicalize, canonicalizeLoggerCode } from './names';
import { fahrenheitToCelsius } from './temperature';

interface RuleTarget {
  branchCanonical: string;
  fridgeCanonical: string;
  loggerCode: string;
}

function ruleMatches(rule: ConversionRule, target: RuleTarget): boolean {
  const hasTarget = Boolean(rule.matchBranch || rule.matchLogger || rule.matchFridge);
  if (!hasTarget) return false;

  if (rule.matchBranch && canonicalize(rule.matchBranch) !== target.branchCanonical) {
    return false;
  }
  if (rule.matchFridge && canonicalize(rule.matchFridge) !== target.fridgeCanonical) {
    return false;
  }
  if (rule.matchLogger && canonicalizeLoggerCode(rule.matchLogger) !== target.loggerCode) {
    return false;
  }
  return true;
}

/**
 * Logger beats fridge beats branch, so a one-logger exception at a branch
 * with a blanket rule still wins.
 */
function ruleSpecificity(rule: ConversionRule): number {
  return (rule.matchLogger ? 4 : 0) + (rule.matchFridge ? 2 : 0) + (rule.matchBranch ? 1 : 0);
}

export function pickRule(rules: ConversionRule[], target: RuleTarget): ConversionRule | null {
  const matches = rules.filter((rule) => ruleMatches(rule, target));
  if (matches.length === 0) return null;
  matches.sort((a, b) => {
    const bySpecificity = ruleSpecificity(b) - ruleSpecificity(a);
    if (bySpecificity !== 0) return bySpecificity;
    return b.id - a.id;
  });
  return matches[0] ?? null;
}

/**
 * The number in the file is the temperature. A header that says Fahrenheit
 * does not change it.
 *
 * A rule is the only conversion. "Treat as Fahrenheit" runs first, then ×
 * and +, so one rule can both convert and scale. "As written" multiplies
 * the file number itself.
 */
export function applyConversion(raw: number, rule: ConversionRule | null): number {
  if (!rule) return raw;

  const value = rule.unit === 'F' ? fahrenheitToCelsius(raw) : raw;
  return Math.round((value * rule.multiplyBy + rule.add) * 100) / 100;
}

export function describeRule(rule: ConversionRule): string {
  const who = [
    rule.matchBranch,
    rule.matchFridge,
    rule.matchLogger ? `logger ${rule.matchLogger}` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  const steps: string[] = [];
  if (rule.unit === 'F') steps.push('treat as Fahrenheit');
  if (rule.unit === 'C') steps.push('treat as Celsius');
  if (rule.multiplyBy !== 1) steps.push(`× ${rule.multiplyBy}`);
  if (rule.add !== 0) {
    const sign = rule.add > 0 ? '+' : '';
    steps.push(`${sign}${rule.add}`);
  }
  if (steps.length === 0) steps.push('leave as written');

  return `${who}: ${steps.join(', then ')}`;
}

export function isNoOpRule(rule: Pick<ConversionRule, 'unit' | 'multiplyBy' | 'add'>): boolean {
  return rule.unit === 'as_written' && rule.multiplyBy === 1 && rule.add === 0;
}

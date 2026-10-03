import { Router } from 'express';

import { isNoOpRule } from '../ingest/conversion';
import type { RuleUnit } from '../types';
import {
  deleteConversionRule,
  insertConversionRule,
  listConversionRules,
} from '../ruleStore';
import { asyncHandler } from './asyncHandler';
import { parseIntParam } from './params';

export const rulesRouter = Router();

rulesRouter.get(
  '/rules',
  asyncHandler(async (_req, res) => {
    const rules = await listConversionRules();
    res.json({ rules });
  }),
);

rulesRouter.post(
  '/rules',
  asyncHandler(async (req, res) => {
    const parsed = parseBody(req.body);
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const rule = await insertConversionRule(parsed);
    res.status(201).json({ rule });
  }),
);

rulesRouter.delete(
  '/rules/:id',
  asyncHandler(async (req, res) => {
    const id = parseIntParam(req.params.id);
    if (id === null || id <= 0) {
      res.status(400).json({ error: 'That is not a rule id.' });
      return;
    }

    const deleted = await deleteConversionRule(id);
    if (!deleted) {
      res.status(404).json({ error: `No rule with id ${id}.` });
      return;
    }
    res.json({ ok: true });
  }),
);

function parseBody(body: unknown):
  | {
      matchBranch: string | null;
      matchLogger: string | null;
      matchFridge: string | null;
      unit: RuleUnit;
      multiplyBy: number;
      add: number;
    }
  | { error: string } {
  if (!body || typeof body !== 'object') {
    return { error: 'Send the rule as JSON.' };
  }

  const raw = body as Record<string, unknown>;
  const matchBranch = optionalText(raw.matchBranch);
  const matchLogger = optionalText(raw.matchLogger);
  const matchFridge = optionalText(raw.matchFridge);

  if (!matchBranch && !matchLogger && !matchFridge) {
    return { error: 'Say which branch, fridge or logger this rule is for.' };
  }

  const unit = parseUnit(raw.unit);
  if (unit === null) {
    return { error: 'Unit has to be as_written, C or F.' };
  }

  const multiplyBy = parseFinite(raw.multiplyBy, 1);
  const add = parseFinite(raw.add, 0);
  if (multiplyBy === null || add === null) {
    return { error: 'Multiply-by and add have to be numbers.' };
  }
  if (multiplyBy === 0) {
    return { error: 'Multiply-by 0 would turn every reading into zero.' };
  }

  if (isNoOpRule({ unit, multiplyBy, add })) {
    return {
      error: 'That rule does not change anything. Set a unit, a multiply-by, or an amount to add.',
    };
  }

  return { matchBranch, matchLogger, matchFridge, unit, multiplyBy, add };
}

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function parseUnit(value: unknown): RuleUnit | null {
  if (value === undefined || value === null || value === '') return 'as_written';
  if (value === 'as_written' || value === 'C' || value === 'F') return value;
  return null;
}

function parseFinite(value: unknown, fallback: number): number | null {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

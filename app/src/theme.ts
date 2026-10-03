import type { FridgeStatus } from './api/types';

export const colors = {
  background: '#f4f5f7',
  surface: '#ffffff',
  border: '#e2e5ea',
  text: '#1a1d21',
  textMuted: '#6b7280',
  accent: '#2563eb',

  // Status palette. Deliberately not a red/green pair: "no data" has to look
  // different from "fine", because a dead logger is not a healthy fridge.
  alarm: '#dc2626',
  alarmSoft: '#fee2e2',
  warning: '#d97706',
  warningSoft: '#fef3c7',
  ok: '#16a34a',
  okSoft: '#dcfce7',
  noData: '#6b7280',
  noDataSoft: '#e5e7eb',
} as const;

export const statusColor: Record<FridgeStatus, string> = {
  alarm: colors.alarm,
  warning: colors.warning,
  ok: colors.ok,
  no_data: colors.noData,
};

export const statusBackground: Record<FridgeStatus, string> = {
  alarm: colors.alarmSoft,
  warning: colors.warningSoft,
  ok: colors.okSoft,
  no_data: colors.noDataSoft,
};

export const statusLabel: Record<FridgeStatus, string> = {
  alarm: 'Too warm',
  warning: 'Watch',
  ok: 'OK',
  no_data: 'No data',
};

/** Short gloss for the dashboard key. Worst first, same as the cards. */
export const statusMeaning: Record<FridgeStatus, string> = {
  alarm: 'above the limit long enough to matter',
  no_data: 'silent logger, not a cold fridge',
  warning: 'warming, recovered, or a gap',
  ok: 'nothing stayed above the limit',
};

export const statusesWorstFirst: FridgeStatus[] = ['alarm', 'no_data', 'warning', 'ok'];

/** Worst first — same order the API uses, so a branch card matches its worst fridge. */
export const statusOrder: Record<FridgeStatus, number> = {
  alarm: 0,
  no_data: 1,
  warning: 2,
  ok: 3,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

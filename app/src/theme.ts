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

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ExcursionReport } from '../api/types';
import { Empty, ErrorMessage, Loading } from '../components/Message';
import { describeDuration, formatDate, formatDateTime, formatTemperature } from '../format';
import { useApi } from '../hooks/useApi';
import type { InspectorStackParamList } from '../navigation/types';
import { colors, spacing } from '../theme';

type Props = NativeStackScreenProps<InspectorStackParamList, 'InspectorReport'>;

const RANGES = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
] as const;

export function InspectorScreen({ route }: Props) {
  const fridgeId = route.params?.fridgeId;
  const [days, setDays] = useState<number>(30);
  const [copied, setCopied] = useState(false);

  const query = fridgeId === undefined ? `?days=${days}` : `?days=${days}&fridgeId=${fridgeId}`;
  const { data, error, loading, refetch } = useApi<ExcursionReport>(
    `/api/reports/excursions${query}`,
  );

  const plainText = useMemo(() => (data ? toPlainText(data) : ''), [data]);

  if (loading) return <Loading />;
  if (error) return <ErrorMessage message={error} onRetry={refetch} />;
  if (!data) return <Empty title="Nothing to report" />;

  const withExcursions = data.rows.filter((row) => row.excursions.length > 0);
  const clean = data.rows.filter((row) => row.excursions.length === 0);

  const copy = async () => {
    await Clipboard.setStringAsync(plainText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.rangeRow}>
        {RANGES.map((range) => (
          <Pressable
            key={range.days}
            onPress={() => setDays(range.days)}
            style={[styles.rangeChip, days === range.days && styles.rangeChipActive]}
          >
            <Text style={[styles.rangeText, days === range.days && styles.rangeTextActive]}>
              {range.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.period}>
          {formatDate(data.from)} to {formatDate(data.to)}
        </Text>
        <Text style={styles.headline}>
          {data.totalExcursions === 0
            ? `No fridge went above its limit for long enough to record. All ${data.rows.length} checked.`
            : `${data.totalExcursions} ${
                data.totalExcursions === 1 ? 'period' : 'periods'
              } above the limit, across ${withExcursions.length} of ${data.rows.length} ${
                data.rows.length === 1 ? 'fridge' : 'fridges'
              }.`}
        </Text>
      </View>

      <Pressable style={styles.copyButton} onPress={copy}>
        <Text style={styles.copyButtonText}>
          {copied ? 'Copied' : 'Copy report as text'}
        </Text>
      </Pressable>

      {withExcursions.map((row) => (
        <View key={row.fridgeId} style={styles.card}>
          <Text style={styles.fridgeTitle}>
            {row.branchName} {row.fridgeName}
          </Text>
          <Text style={styles.muted}>Limit {formatTemperature(row.thresholdC)}</Text>
          {row.excursions.map((excursion) => (
            <View key={excursion.startedAt} style={styles.row}>
              <Text style={styles.rowTitle}>
                {formatDateTime(excursion.startedAt)}
                {excursion.ongoing ? ' - still too warm' : ` to ${formatDateTime(excursion.endedAt!)}`}
              </Text>
              <Text style={styles.rowDetail}>
                {describeDuration(excursion.durationMinutes)} · peak{' '}
                {formatTemperature(excursion.peakC)}
              </Text>
            </View>
          ))}
        </View>
      ))}

      {clean.length > 0 ? (
        <View style={styles.card}>
          {/* Listed rather than omitted: "this fridge was never above the
              limit" is usually the answer an inspector is after, and a report
              showing only problems looks like it found only problems. */}
          <Text style={styles.fridgeTitle}>
            Never above the limit ({clean.length})
          </Text>
          <Text style={styles.muted}>
            {clean.map((row) => `${row.branchName} ${row.fridgeName}`).join(', ')}
          </Text>
        </View>
      ) : null}

      <Text style={styles.footnote}>
        Based only on readings that have been uploaded. A fridge with no readings for part of this
        period cannot be reported on for that time, and will say so on its own page.
      </Text>
    </ScrollView>
  );
}

/**
 * The copyable version. Summer said the inspector asks her questions in person
 * and she needs an answer she can read out or paste into an email, so the text
 * has to stand on its own away from the app - including the caveat about the
 * data it is based on.
 */
function toPlainText(report: ExcursionReport): string {
  const lines: string[] = [
    'Squanchy Bakery - fridge temperature record',
    `Period: ${formatDate(report.from)} to ${formatDate(report.to)}`,
    `Produced: ${formatDateTime(report.generatedAt)}`,
    '',
  ];

  const withExcursions = report.rows.filter((row) => row.excursions.length > 0);

  if (withExcursions.length === 0) {
    lines.push(`No fridge recorded a sustained period above its limit. ${report.rows.length} fridges checked.`);
  } else {
    for (const row of withExcursions) {
      lines.push(`${row.branchName} ${row.fridgeName} (limit ${row.thresholdC.toFixed(1)} C)`);
      for (const excursion of row.excursions) {
        const ended = excursion.ongoing
          ? 'still above the limit at the end of the period'
          : formatDateTime(excursion.endedAt!);
        lines.push(
          `  ${formatDateTime(excursion.startedAt)} to ${ended} - ${describeDuration(
            excursion.durationMinutes,
          )}, peak ${excursion.peakC.toFixed(1)} C`,
        );
      }
      lines.push('');
    }
  }

  const clean = report.rows.filter((row) => row.excursions.length === 0);
  if (clean.length > 0) {
    lines.push(`Never above the limit in this period (${clean.length}):`);
    for (const row of clean) {
      lines.push(`  ${row.branchName} ${row.fridgeName}`);
    }
    lines.push('');
  }

  lines.push(
    'Based on readings uploaded from the branch loggers. Periods with no readings are listed on each fridge individually and are not counted as either compliant or non-compliant.',
  );

  return lines.join('\n');
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  rangeRow: { flexDirection: 'row', gap: spacing.sm },
  rangeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rangeChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  rangeText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  rangeTextActive: { color: '#fff' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs + 2,
  },
  period: { fontSize: 12, color: colors.textMuted },
  headline: { fontSize: 14, lineHeight: 20, color: colors.text },
  copyButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  copyButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  fridgeTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  row: { paddingVertical: spacing.xs + 2, borderTopWidth: 1, borderTopColor: colors.border, gap: 2 },
  rowTitle: { fontSize: 13, fontWeight: '600', color: colors.text },
  rowDetail: { fontSize: 12, color: colors.textMuted },
  muted: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  footnote: { fontSize: 11, lineHeight: 16, color: colors.textMuted },
});

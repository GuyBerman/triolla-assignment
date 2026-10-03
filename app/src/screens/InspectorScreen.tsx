import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Excursion, ExcursionReport, ExcursionReportRow } from '../api/types';
import { Empty, ErrorMessage, Loading } from '../components/Message';
import { RangeChips } from '../components/RangeChips';
import { describeDuration, formatDate, formatDateTime, formatTemperature } from '../format';
import { useApi } from '../hooks/useApi';
import type { InspectorStackParamList } from '../navigation/types';
import { colors, spacing } from '../theme';

type Props = NativeStackScreenProps<InspectorStackParamList, 'InspectorReport'>;

const RANGES = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
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
      <RangeChips options={RANGES} value={days} onChange={setDays} />

      <View style={styles.card}>
        <Text style={styles.period}>
          {formatDate(data.from)} to {formatDate(data.to)}
        </Text>
        <Text style={styles.headline}>
          {data.totalExcursions === 0
            ? `No fridge stayed above its limit for 30 minutes or more. All ${data.rows.length} checked.`
            : `${data.totalExcursions} ${
                data.totalExcursions === 1 ? 'period' : 'periods'
              } above the limit, on ${withExcursions.length} of ${data.rows.length} ${
                data.rows.length === 1 ? 'fridge' : 'fridges'
              }.`}
        </Text>
        <Text style={styles.muted}>
          A jump that lasted under 30 minutes is a door opening. It is not listed here.
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
          {row.excursions.map((excursion) => {
            const described = describeExcursion(excursion);
            return (
              <View key={excursion.startedAt} style={styles.row}>
                <Text style={styles.rowTitle}>{described.when}</Text>
                <Text style={styles.rowDetail}>{described.detail}</Text>
              </View>
            );
          })}
        </View>
      ))}

      {clean.length > 0 ? (
        <View style={styles.card}>
          {/* Listed rather than omitted: "this fridge was never above the
              limit" is usually the answer an inspector is after, and a report
              showing only problems looks like it found only problems. */}
          <Text style={styles.fridgeTitle}>
            Did not stay above the limit ({clean.length})
          </Text>
          <Text style={styles.muted}>Nothing lasting 30 minutes or more in this period.</Text>
          {clean.map((row) => (
            <Text key={row.fridgeId} style={styles.cleanName}>
              {row.branchName} {row.fridgeName}
            </Text>
          ))}
        </View>
      ) : null}

      <Text style={styles.footnote}>
        Times are the first and last readings that were actually above the limit. A gap in the
        file is not filled in. If the logger went quiet, that stretch is not counted as warm and
        not counted as fine.
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
/** The same sentences the screen shows, so the pasted report matches what she read. */
function describeExcursion(excursion: Excursion): { when: string; detail: string } {
  const length = describeDuration(excursion.durationMinutes);
  const when = excursion.ongoing
    ? `Above the limit since ${formatDateTime(excursion.startedAt)} — ${length} so far, and the latest reading is still above it.`
    : `Above the limit from ${formatDateTime(excursion.startedAt)} to ${formatDateTime(excursion.endedAt ?? excursion.startedAt)} — ${length}.`;
  const readings = excursion.readingCount === 1 ? '1 reading' : `${excursion.readingCount} readings`;
  return {
    when,
    detail: `Peak ${formatTemperature(excursion.peakC)}, average ${formatTemperature(excursion.meanC)}, from ${readings}.`,
  };
}

function toPlainText(report: ExcursionReport): string {
  const lines: string[] = [
    'Squanchy Bakery - fridge temperature record',
    `Period: ${formatDate(report.from)} to ${formatDate(report.to)}`,
    `Produced: ${formatDateTime(report.generatedAt)}`,
    'Only stretches of 30 minutes or more above the limit are listed. A shorter jump is a door opening.',
    '',
  ];

  const withExcursions = report.rows.filter((row) => row.excursions.length > 0);

  if (withExcursions.length === 0) {
    lines.push(
      `No fridge stayed above its limit for 30 minutes or more. ${report.rows.length} fridges checked.`,
    );
    lines.push('');
  } else {
    for (const row of withExcursions) {
      lines.push(fridgeHeading(row));
      for (const excursion of row.excursions) {
        const described = describeExcursion(excursion);
        lines.push(`  ${described.when}`);
        lines.push(`  ${described.detail}`);
      }
      lines.push('');
    }
  }

  const clean = report.rows.filter((row) => row.excursions.length === 0);
  if (clean.length > 0) {
    lines.push(`Did not stay above the limit in this period (${clean.length}):`);
    for (const row of clean) {
      lines.push(`  ${row.branchName} ${row.fridgeName}`);
    }
    lines.push('');
  }

  lines.push(
    'Times are the first and last readings actually above the limit. A gap in the file is not filled in. If the logger went quiet, that stretch is not counted as warm and not counted as fine.',
  );

  return lines.join('\n');
}

function fridgeHeading(row: ExcursionReportRow): string {
  return `${row.branchName} ${row.fridgeName} (limit ${formatTemperature(row.thresholdC)})`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xl,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
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
  cleanName: { fontSize: 13, color: colors.text },
  footnote: { fontSize: 11, lineHeight: 16, color: colors.textMuted },
});

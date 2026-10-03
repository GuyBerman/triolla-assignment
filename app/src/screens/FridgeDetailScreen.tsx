import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { FridgeDetail } from '../api/types';
import { Empty, ErrorMessage, Loading } from '../components/Message';
import { RangeChips } from '../components/RangeChips';
import { StatusPill } from '../components/StatusPill';
import { TemperatureChart } from '../components/TemperatureChart';
import { describeDuration, formatDateTime, formatTemperature } from '../format';
import { useApi } from '../hooks/useApi';
import type { FridgeDetailParams, RootTabParamList } from '../navigation/types';
import { colors, spacing } from '../theme';

type Props = NativeStackScreenProps<{ FridgeDetail: FridgeDetailParams }, 'FridgeDetail'>;

const RANGES = [
  { label: '24 hours', value: 1 },
  { label: '3 days', value: 3 },
  { label: '7 days', value: 7 },
] as const;

export function FridgeDetailScreen({ route, navigation }: Props) {
  const { fridgeId } = route.params;
  const [days, setDays] = useState<number>(3);

  const { data, error, loading, refreshing, refetch } = useApi<FridgeDetail>(
    `/api/fridges/${fridgeId}?days=${days}`,
  );

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  if (loading) return <Loading />;
  if (error) return <ErrorMessage message={error} onRetry={refetch} />;
  if (!data) return <Empty title="Nothing to show" />;

  const { fridge, readings, excursions, doorEvents, gaps } = data;
  const failedReadings = readings.filter((reading) => reading.status === 'error').length;

  const openInspectorReport = () => {
    navigation
      .getParent<BottomTabNavigationProp<RootTabParamList>>()
      ?.navigate('InspectorTab', { screen: 'InspectorReport', params: { fridgeId } });
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor={colors.accent} />
      }
    >
      <View style={styles.section}>
        <StatusPill status={fridge.status} />
        <Text style={styles.reason}>{fridge.statusReason}</Text>
        <Text style={styles.meta}>
          Limit {formatTemperature(fridge.thresholdC)}
          {fridge.loggerCode ? ` · logger ${fridge.loggerCode}` : ' · no logger fitted'}
        </Text>
      </View>

      <RangeChips options={RANGES} value={days} onChange={setDays} />

      <View style={styles.card}>
        {readings.length === 0 ? (
          <Text style={styles.empty}>No readings in this period.</Text>
        ) : (
          <>
            <TemperatureChart
              readings={readings}
              thresholdC={fridge.thresholdC}
              gaps={gaps}
              excursions={excursions}
            />
            <View style={styles.legend}>
              <Legend color={colors.accent} label="Temperature" />
              <Legend color={colors.alarm} label={`${formatTemperature(fridge.thresholdC)} limit`} />
              <Legend color={colors.alarmSoft} label="Too warm" />
              <Legend color={colors.noDataSoft} label="No readings" />
            </View>
          </>
        )}
      </View>

      <Section title={`Above the limit (${excursions.length})`}>
        {excursions.length === 0 ? (
          <Text style={styles.empty}>
            Nothing above {formatTemperature(fridge.thresholdC)} for long enough to count in this
            period.
          </Text>
        ) : (
          excursions.map((excursion) => (
            <View key={excursion.startedAt} style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle}>
                  {formatDateTime(excursion.startedAt)}
                  {excursion.endedAt
                    ? ` to ${formatDateTime(excursion.endedAt)}`
                    : ' - still too warm'}
                </Text>
                <Text style={styles.rowDetail}>
                  {describeDuration(excursion.durationMinutes)} · peak{' '}
                  {formatTemperature(excursion.peakC)} · average{' '}
                  {formatTemperature(excursion.meanC)} · {excursion.readingCount} readings
                </Text>
              </View>
            </View>
          ))
        )}
      </Section>

      {doorEvents.length > 0 ? (
        <Section title={`Door openings (${doorEvents.length})`}>
          {/* Deliberately listed apart from the violations above. Summer said a
              one-reading jump for a delivery is fine, so these are shown for
              completeness and never counted against the fridge. */}
          <Text style={styles.empty}>
            Brief jumps above the limit that came straight back down. Normal for a fridge that gets
            opened.
          </Text>
          {doorEvents.slice(0, 8).map((event) => (
            <View key={event.at} style={styles.row}>
              <Text style={styles.rowDetail}>
                {formatDateTime(event.at)} · reached {formatTemperature(event.peakC)}
              </Text>
            </View>
          ))}
          {doorEvents.length > 8 ? (
            <Text style={styles.empty}>...and {doorEvents.length - 8} more.</Text>
          ) : null}
        </Section>
      ) : null}

      {gaps.length > 0 || failedReadings > 0 ? (
        <Section title="Missing readings">
          {gaps.map((gap) => (
            <View key={gap.startedAt} style={styles.row}>
              <Text style={styles.rowDetail}>
                {describeDuration(gap.durationMinutes)} with no readings, from{' '}
                {formatDateTime(gap.startedAt)}
              </Text>
            </View>
          ))}
          {failedReadings > 0 ? (
            <Text style={styles.empty}>
              {failedReadings} reading{failedReadings === 1 ? '' : 's'} where the logger recorded an
              error instead of a temperature.
            </Text>
          ) : null}
          <Text style={styles.empty}>
            We cannot tell from the file whether the logger failed, the battery ran out, or it
            simply did not save.
          </Text>
        </Section>
      ) : null}

      <Pressable style={styles.reportButton} onPress={openInspectorReport}>
        <Text style={styles.reportButtonText}>Inspector report for this fridge</Text>
      </Pressable>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
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
  section: { gap: spacing.sm },
  reason: { fontSize: 14, lineHeight: 20, color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  row: { paddingVertical: spacing.xs + 2, borderTopWidth: 1, borderTopColor: colors.border },
  rowMain: { gap: 2 },
  rowTitle: { fontSize: 13, fontWeight: '600', color: colors.text },
  rowDetail: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  empty: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 1 },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  legendLabel: { fontSize: 11, color: colors.textMuted },
  reportButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  reportButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

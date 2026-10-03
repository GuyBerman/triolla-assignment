import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { FridgeSummary } from '../api/types';
import { formatDateTime, formatTemperature } from '../format';
import { colors, spacing, statusColor } from '../theme';
import { StatusPill } from './StatusPill';

export function FridgeCard({
  fridge,
  onPress,
  showBranch = true,
}: {
  fridge: FridgeSummary;
  onPress: () => void;
  /** False on a branch page, where the branch name is already the title. */
  showBranch?: boolean;
}) {
  const last = fridge.lastReading;
  // An ERR row has no temperature. Showing the raw value is more honest than
  // falling back to the last reading that happened to work.
  const showsRawValue = last !== null && last.status === 'error';

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${showBranch ? `${fridge.branchName} ${fridge.name}` : fridge.name}. ${fridge.statusReason}`}
    >
      <View style={[styles.statusEdge, { backgroundColor: statusColor[fridge.status] }]} />

      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.branch}>{showBranch ? fridge.branchName : fridge.name}</Text>
            {showBranch ? <Text style={styles.fridge}>{fridge.name}</Text> : null}
          </View>

          <View style={styles.readingBlock}>
            <Text style={[styles.temperature, { color: statusColor[fridge.status] }]}>
              {showsRawValue ? last.rawValue : formatTemperature(last?.tempC ?? null)}
            </Text>
            {last ? <Text style={styles.readingTime}>{formatDateTime(last.recordedAt)}</Text> : null}
          </View>
        </View>

        <Text style={styles.reason}>{fridge.statusReason}</Text>

        <View style={styles.footer}>
          <StatusPill status={fridge.status} />
          {fridge.loggerCode ? (
            <Text style={styles.meta}>{fridge.loggerCode}</Text>
          ) : (
            <Text style={styles.meta}>no logger</Text>
          )}
          {fridge.doorEventCount > 0 ? (
            <Text style={styles.meta}>
              {fridge.doorEventCount} door {fridge.doorEventCount === 1 ? 'opening' : 'openings'}
            </Text>
          ) : null}
          {fridge.peakC !== null && fridge.peakC !== last?.tempC ? (
            <Text style={styles.meta}>peak {formatTemperature(fridge.peakC)}</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardPressed: {
    opacity: 0.7,
  },
  statusEdge: {
    width: 5,
  },
  body: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  titleBlock: {
    flex: 1,
  },
  branch: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  fridge: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 1,
  },
  readingBlock: {
    alignItems: 'flex-end',
  },
  temperature: {
    fontSize: 24,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  readingTime: {
    fontSize: 11,
    color: colors.textMuted,
  },
  reason: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  meta: {
    fontSize: 11,
    color: colors.textMuted,
  },
});

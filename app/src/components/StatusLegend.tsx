import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, statusColor, statusLabel, statusMeaning, statusesWorstFirst } from '../theme';

export function StatusLegend() {
  return (
    <View style={styles.list}>
      {statusesWorstFirst.map((status) => (
        <View key={status} style={styles.row}>
          <View style={[styles.dot, { backgroundColor: statusColor[status] }]} />
          <Text style={styles.line} numberOfLines={1}>
            <Text style={[styles.label, { color: statusColor[status] }]}>{statusLabel[status]}</Text>
            <Text style={styles.meaning}> {statusMeaning[status]}</Text>
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  line: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  label: {
    fontWeight: '700',
  },
  meaning: {
    color: colors.textMuted,
  },
});

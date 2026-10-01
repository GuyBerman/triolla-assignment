import { StyleSheet, Text, View } from 'react-native';

import type { FridgeStatus } from '../api/types';
import { spacing, statusBackground, statusColor, statusLabel } from '../theme';

export function StatusPill({
  status,
  count,
}: {
  status: FridgeStatus;
  /** When given, renders as "3 Too warm" for the dashboard summary. */
  count?: number;
}) {
  return (
    <View style={[styles.pill, { backgroundColor: statusBackground[status] }]}>
      <View style={[styles.dot, { backgroundColor: statusColor[status] }]} />
      <Text style={[styles.label, { color: statusColor[status] }]}>
        {count === undefined ? statusLabel[status] : `${count} ${statusLabel[status].toLowerCase()}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 1,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

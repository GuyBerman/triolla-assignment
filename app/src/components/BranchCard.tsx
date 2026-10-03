import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { countProblemStatuses, type BranchGroup } from '../groupBranches';
import { colors, spacing, statusColor } from '../theme';
import { StatusPill } from './StatusPill';

export function BranchCard({
  branch,
  onPress,
}: {
  branch: BranchGroup;
  onPress: () => void;
}) {
  const fridgeCount = branch.fridges.length;
  const fridgeWord = fridgeCount === 1 ? 'fridge' : 'fridges';
  const worst = branch.fridges[0];
  const counts = countProblemStatuses(branch.fridges);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${branch.name}, ${fridgeCount} ${fridgeWord}. ${worst?.statusReason ?? ''}`}
    >
      <View style={[styles.statusEdge, { backgroundColor: statusColor[branch.status] }]} />

      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.name}>{branch.name}</Text>
            <Text style={styles.count}>
              {fridgeCount} {fridgeWord}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </View>

        {counts.length === 0 ? (
          <Text style={styles.allWell}>
            {fridgeCount === 1
              ? 'This fridge is behaving.'
              : fridgeCount === 2
                ? 'Both fridges are behaving.'
                : `All ${fridgeCount} fridges are behaving.`}
          </Text>
        ) : (
          <>
            <View style={styles.pills}>
              {counts.map((entry) => (
                <StatusPill key={entry.status} status={entry.status} count={entry.count} />
              ))}
            </View>
            {worst ? (
              <Text style={styles.preview} numberOfLines={2}>
                {worst.name} — {worst.statusReason}
              </Text>
            ) : null}
          </>
        )}
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
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  count: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  preview: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
  },
  allWell: {
    fontSize: 13,
    color: colors.ok,
    fontWeight: '600',
  },
});

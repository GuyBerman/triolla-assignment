import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import type { FridgeListResponse } from '../api/types';
import { BranchCard } from '../components/BranchCard';
import { Empty, ErrorMessage, Loading } from '../components/Message';
import { StatusLegend } from '../components/StatusLegend';
import { formatDateTime } from '../format';
import { countStatuses, groupByBranch } from '../groupBranches';
import { useApi } from '../hooks/useApi';
import type { FridgesStackParamList } from '../navigation/types';
import { colors, spacing, statusColor, statusLabel } from '../theme';

type Props = NativeStackScreenProps<FridgesStackParamList, 'Dashboard'>;

export function DashboardScreen({ navigation }: Props) {
  const { data, error, loading, refreshing, refetch } =
    useApi<FridgeListResponse>('/api/fridges');

  // The tab stays mounted, so coming back after an upload is what refreshes the list.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  if (loading) return <Loading label="Checking every fridge..." />;
  if (error) return <ErrorMessage message={error} onRetry={refetch} />;

  const fridges = data?.fridges ?? [];

  if (fridges.length === 0) {
    return (
      <Empty
        title="Nothing uploaded yet"
        detail="Go to the Upload tab and add a file from one of the branches."
      />
    );
  }

  const branches = groupByBranch(fridges);
  const counts = countStatuses(fridges);

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={branches}
      keyExtractor={(branch) => branch.name}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor={colors.accent} />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.asOf}>
            {data?.asOf
              ? `Readings up to ${formatDateTime(data.asOf)}`
              : 'No readings uploaded yet'}
          </Text>
          <Text style={styles.totals}>
            {branches.length} {branches.length === 1 ? 'branch' : 'branches'} · {fridges.length}{' '}
            {fridges.length === 1 ? 'fridge' : 'fridges'}
          </Text>
          <View style={styles.summary}>
            {counts.map((entry) => (
              <View key={entry.status} style={styles.stat}>
                <Text
                  style={[
                    styles.statCount,
                    { color: entry.count > 0 ? statusColor[entry.status] : colors.textMuted },
                  ]}
                >
                  {entry.count}
                </Text>
                <Text style={styles.statLabel} numberOfLines={1}>
                  {statusLabel[entry.status]}
                </Text>
              </View>
            ))}
          </View>
          <StatusLegend />
        </View>
      }
      renderItem={({ item }) => (
        <BranchCard
          branch={item}
          onPress={() => navigation.navigate('Branch', { branchName: item.name })}
        />
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  asOf: {
    fontSize: 13,
    color: colors.textMuted,
  },
  totals: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  summary: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    gap: 2,
  },
  statCount: {
    fontSize: 20,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  separator: {
    height: spacing.md,
  },
});

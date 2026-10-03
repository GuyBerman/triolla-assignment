import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import type { FridgeListResponse } from '../api/types';
import { BranchCard } from '../components/BranchCard';
import { Empty, ErrorMessage, Loading } from '../components/Message';
import { StatusLegend } from '../components/StatusLegend';
import { StatusPill } from '../components/StatusPill';
import { formatDateTime } from '../format';
import { countProblemStatuses, groupByBranch } from '../groupBranches';
import { useApi } from '../hooks/useApi';
import type { FridgesStackParamList } from '../navigation/types';
import { colors, spacing } from '../theme';

type Props = NativeStackScreenProps<FridgesStackParamList, 'Dashboard'>;

export function DashboardScreen({ navigation }: Props) {
  const { data, error, loading, refreshing, refetch } =
    useApi<FridgeListResponse>('/api/fridges');

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
  const counts = countProblemStatuses(fridges);
  const allWell = counts.length === 0;

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
          {/* The single most important line on the screen: the dashboard is
              only as current as the last file Summer uploaded, and pretending
              otherwise is how a stale fridge looks fine. */}
          <Text style={styles.asOf}>
            {data?.asOf
              ? `Readings up to ${formatDateTime(data.asOf)}`
              : 'No readings uploaded yet'}
          </Text>

          {allWell ? (
            <Text style={styles.allWell}>
              All {fridges.length} fridges across {branches.length} branches are behaving.
            </Text>
          ) : (
            <View style={styles.pills}>
              {counts.map((entry) => (
                <StatusPill key={entry.status} status={entry.status} count={entry.count} />
              ))}
            </View>
          )}

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
  allWell: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.ok,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  separator: {
    height: spacing.md,
  },
});

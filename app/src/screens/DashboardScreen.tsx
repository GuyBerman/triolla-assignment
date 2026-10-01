import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import type { FridgeListResponse, FridgeStatus } from '../api/types';
import { FridgeCard } from '../components/FridgeCard';
import { Empty, ErrorMessage, Loading } from '../components/Message';
import { StatusPill } from '../components/StatusPill';
import { formatDateTime } from '../format';
import { useApi } from '../hooks/useApi';
import type { FridgesStackParamList } from '../navigation/types';
import { colors, spacing } from '../theme';

type Props = NativeStackScreenProps<FridgesStackParamList, 'Dashboard'>;

/** Only the states worth counting; "ok" is the absence of news. */
const SUMMARY_STATUSES: FridgeStatus[] = ['alarm', 'no_data', 'warning'];

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

  const counts = SUMMARY_STATUSES.map((status) => ({
    status,
    count: fridges.filter((fridge) => fridge.status === status).length,
  })).filter((entry) => entry.count > 0);

  const allWell = counts.length === 0;

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={fridges}
      keyExtractor={(fridge) => String(fridge.id)}
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
              All {fridges.length} fridges are behaving.
            </Text>
          ) : (
            <View style={styles.pills}>
              {counts.map((entry) => (
                <StatusPill key={entry.status} status={entry.status} count={entry.count} />
              ))}
            </View>
          )}
        </View>
      }
      renderItem={({ item }) => (
        <FridgeCard
          fridge={item}
          onPress={() =>
            navigation.navigate('FridgeDetail', {
              fridgeId: item.id,
              fridgeName: `${item.branchName} ${item.name}`,
            })
          }
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

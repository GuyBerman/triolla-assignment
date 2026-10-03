import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import type { FridgeListResponse } from '../api/types';
import { FridgeCard } from '../components/FridgeCard';
import { Empty, ErrorMessage, Loading } from '../components/Message';
import { useApi } from '../hooks/useApi';
import type { FridgesStackParamList } from '../navigation/types';
import { colors, spacing } from '../theme';

type Props = NativeStackScreenProps<FridgesStackParamList, 'Branch'>;

export function BranchScreen({ route, navigation }: Props) {
  const { branchName } = route.params;
  const { data, error, loading, refreshing, refetch } =
    useApi<FridgeListResponse>('/api/fridges');

  if (loading) return <Loading label="Checking this branch..." />;
  if (error) return <ErrorMessage message={error} onRetry={refetch} />;

  const fridges = (data?.fridges ?? []).filter((fridge) => fridge.branchName === branchName);

  if (fridges.length === 0) {
    return (
      <Empty
        title="No fridges at this branch"
        detail="Nothing has been uploaded for it yet."
      />
    );
  }

  const fridgeWord = fridges.length === 1 ? 'fridge' : 'fridges';

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
        <Text style={styles.header}>
          {fridges.length} {fridgeWord}
        </Text>
      }
      renderItem={({ item }) => (
        <FridgeCard
          fridge={item}
          showBranch={false}
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
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  separator: {
    height: spacing.md,
  },
});

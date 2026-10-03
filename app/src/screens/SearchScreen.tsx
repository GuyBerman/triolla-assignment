import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import type { FridgeListResponse } from '../api/types';
import { FridgeCard } from '../components/FridgeCard';
import { Empty, ErrorMessage, Loading } from '../components/Message';
import { formatTemperature } from '../format';
import { useApi } from '../hooks/useApi';
import type { SearchStackParamList } from '../navigation/types';
import { colors, spacing } from '../theme';

type Props = NativeStackScreenProps<SearchStackParamList, 'Search'>;

const PRESETS = [5, 8, 10] as const;
const DEBOUNCE_MS = 300;

export function SearchScreen({ navigation }: Props) {
  const [query, setQuery] = useState('');
  const [tempText, setTempText] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [debouncedTemp, setDebouncedTemp] = useState('');

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedTemp(tempText.trim()), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [tempText]);

  const aboveC = parseAbove(debouncedTemp);
  const path = useMemo(() => searchPath(debouncedQuery, aboveC), [debouncedQuery, aboveC]);
  const searching = path !== null;

  const { data, error, loading, refreshing, refetch } = useApi<FridgeListResponse>(path);

  useFocusEffect(
    useCallback(() => {
      if (path !== null) refetch();
    }, [path, refetch]),
  );

  const fridges = searching ? (data?.fridges ?? []) : [];
  const selectedAbove = parseAbove(tempText);

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={fridges}
      keyExtractor={(fridge) => String(fridge.id)}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        searching ? (
          <RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor={colors.accent} />
        ) : undefined
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.intro}>
            The dashboard always uses each fridge's stored limit (usually 5°C). Use this
            when you care about a different number — for example, anything that reached 10°C.
          </Text>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Branch or fridge name"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={styles.input}
            accessibilityLabel="Search by branch or fridge name"
          />

          <Text style={styles.label}>Reached this temperature or more</Text>
          <View style={styles.presets}>
            {PRESETS.map((preset) => {
              const selected = selectedAbove === preset;
              return (
                <Pressable
                  key={preset}
                  onPress={() => setTempText(selected ? '' : String(preset))}
                  style={[styles.chip, selected && styles.chipSelected]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${preset} degrees`}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {preset}°C
                  </Text>
                </Pressable>
              );
            })}
            <TextInput
              value={tempText}
              onChangeText={setTempText}
              placeholder="or type °C"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              style={[styles.input, styles.tempInput]}
              accessibilityLabel="Custom temperature in Celsius"
            />
          </View>
        </View>
      }
      ListEmptyComponent={
        searching && loading && !data ? (
          <Loading label="Looking through the loggers..." />
        ) : searching && error ? (
          <ErrorMessage message={error} onRetry={refetch} />
        ) : searching && !loading ? (
          <Empty
            title={emptyTitle(debouncedQuery, aboveC)}
            detail="Try a lower temperature, or a shorter name."
          />
        ) : (
          <Empty
            title="Nothing to look up yet"
            detail="Type a name, or pick 10°C to see every fridge that got that warm."
          />
        )
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
      ListFooterComponent={
        searching && fridges.length > 0 ? (
          <Text style={styles.footer}>
            {aboveC !== null
              ? `${fridges.length} ${fridges.length === 1 ? 'fridge' : 'fridges'} reached ${formatTemperature(aboveC)} or more in the last 30 days. Status on these cards is judged against that number, not the usual limit.`
              : `${fridges.length} ${fridges.length === 1 ? 'match' : 'matches'}. Status uses each fridge's stored limit.`}
          </Text>
        ) : null
      }
    />
  );
}

function parseAbove(value: string): number | null {
  if (value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function searchPath(query: string, aboveC: number | null): string | null {
  if (!query && aboveC === null) return null;
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (aboveC !== null) params.set('aboveC', String(aboveC));
  return `/api/search?${params.toString()}`;
}

function emptyTitle(query: string, aboveC: number | null): string {
  if (aboveC !== null && query) {
    return `Nothing named like “${query}” reached ${formatTemperature(aboveC)}`;
  }
  if (aboveC !== null) {
    return `Nothing reached ${formatTemperature(aboveC)}`;
  }
  return `No fridge matches “${query}”`;
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
    flexGrow: 1,
  },
  header: {
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  intro: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.text,
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  chipTextSelected: {
    color: '#fff',
  },
  tempInput: {
    flexGrow: 1,
    minWidth: 110,
  },
  separator: {
    height: spacing.md,
  },
  footer: {
    marginTop: spacing.lg,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
  },
});

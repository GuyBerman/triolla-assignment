import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { api } from '../api/client';
import type { AnalysisSettings, FridgeListResponse, SettingsResponse } from '../api/types';
import { FridgeLimitControl } from '../components/FridgeLimitControl';
import { ErrorMessage, Loading } from '../components/Message';
import { describeDuration } from '../format';
import { useApi } from '../hooks/useApi';
import { colors, spacing } from '../theme';

type Draft = Record<keyof AnalysisSettings, string>;

const GROUPS: {
  title: string;
  hint: string;
  fields: { key: keyof AnalysisSettings; label: string; decimal?: boolean }[];
}[] = [
  {
    title: 'Too warm',
    hint: 'How long a fridge has to stay warmer than its degree limit, set above. Shorter than that is a door opening. One reading always is, even if you type 1.',
    fields: [{ key: 'excursionMinDurationMinutes', label: 'Minutes above the limit' }],
  },
  {
    title: 'No data',
    hint: 'Counted from the newest reading you uploaded, not from the clock. A silent logger is not a cold fridge.',
    fields: [{ key: 'staleAfterHours', label: 'Hours without a reading' }],
  },
  {
    title: 'Warming up',
    hint: 'All of these have to be true, and the fridge still has to be under its limit. A short noisy jump is not warming up.',
    fields: [
      { key: 'driftWindowHours', label: 'Look at the last (hours)' },
      { key: 'driftMinWindowHours', label: 'Need at least (hours of readings)' },
      { key: 'driftMinRiseC', label: 'Rise of at least (°)', decimal: true },
      { key: 'driftMinSlopeCPerHour', label: 'Climbing by at least (° each hour)', decimal: true },
    ],
  },
  {
    title: 'Gaps',
    hint: 'A hole shorter than this never counts. A longer one still has to be several times how often that logger usually writes. A recent hole shows as Watch.',
    fields: [
      { key: 'gapMinMinutes', label: 'Shortest hole that counts (minutes)' },
      { key: 'recentGapHours', label: 'Show it as Watch for (hours)' },
    ],
  },
];

export function SettingsScreen() {
  const settingsApi = useApi<SettingsResponse>('/api/settings');
  const fridgesApi = useApi<FridgeListResponse>('/api/fridges');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useFocusEffect(
    useCallback(() => {
      settingsApi.refetch();
      fridgesApi.refetch();
    }, [settingsApi.refetch, fridgesApi.refetch]),
  );

  useEffect(() => {
    if (settingsApi.data && draft === null) {
      setDraft(toDraft(settingsApi.data.settings));
    }
  }, [settingsApi.data, draft]);

  const save = async () => {
    if (!draft) return;
    const body = readDraft(draft);
    if (body === null) {
      setFormError('Fill in every box with a number.');
      setSaved(false);
      return;
    }

    setFormError(null);
    setSaving(true);
    setSaved(false);
    try {
      const response = await api.put<SettingsResponse>('/api/settings', body);
      setDraft(toDraft(response.settings));
      setSaved(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save those settings.');
    } finally {
      setSaving(false);
    }
  };

  if (settingsApi.loading && draft === null) return <Loading label="Loading settings..." />;
  if (settingsApi.error && draft === null) {
    return <ErrorMessage message={settingsApi.error} onRetry={settingsApi.refetch} />;
  }
  if (!draft) return <Loading label="Loading settings..." />;

  const current = readDraft(draft);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>
        These decide when a fridge is Too warm, No data, or Watch. Saving applies them straight
        away, including to files you already uploaded.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Degree limit</Text>
        <Text style={styles.hint}>
          This is the number of degrees. Too warm means warmer than this, for the minutes below. A
          reading of 5.0° on a 5.0° limit does not count. A new fridge starts at 5.0° until you
          change it.
        </Text>
        {fridgesApi.loading && !fridgesApi.data ? (
          <Text style={styles.hint}>Loading fridges...</Text>
        ) : fridgesApi.error ? (
          <Text style={styles.error}>{fridgesApi.error}</Text>
        ) : (fridgesApi.data?.fridges.length ?? 0) === 0 ? (
          <Text style={styles.hint}>No fridges yet. They show up here after you upload a file.</Text>
        ) : (
          fridgesApi.data?.fridges.map((fridge) => (
            <FridgeLimitControl
              key={fridge.id}
              fridgeId={fridge.id}
              label={`${fridge.branchName} ${fridge.name}`}
              thresholdC={fridge.thresholdC}
              onSaved={() => fridgesApi.refetch()}
            />
          ))
        )}
      </View>

      {GROUPS.map((group) => (
        <View key={group.title} style={styles.card}>
          <Text style={styles.cardTitle}>{group.title}</Text>
          <Text style={styles.hint}>{group.hint}</Text>
          {group.fields.map((field) => (
            <View key={field.key} style={styles.field}>
              <Text style={styles.fieldLabel}>{field.label}</Text>
              <TextInput
                value={draft[field.key]}
                onChangeText={(value) => {
                  setSaved(false);
                  setDraft({ ...draft, [field.key]: value });
                }}
                keyboardType={field.decimal ? 'decimal-pad' : 'number-pad'}
                style={styles.input}
              />
            </View>
          ))}
        </View>
      ))}

      {current ? <Text style={styles.preview}>{preview(current)}</Text> : null}
      {formError ? <Text style={styles.error}>{formError}</Text> : null}
      {saved ? (
        <Text style={styles.saved}>Saved. Open Fridges and it will already be using this.</Text>
      ) : null}

      <Pressable
        style={[styles.button, saving && styles.buttonBusy]}
        onPress={() => void save()}
        disabled={saving}
        accessibilityRole="button"
        accessibilityLabel="Save"
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save</Text>}
      </Pressable>
    </ScrollView>
  );
}

function toDraft(settings: AnalysisSettings): Draft {
  return {
    excursionMinDurationMinutes: String(settings.excursionMinDurationMinutes),
    staleAfterHours: String(settings.staleAfterHours),
    recentGapHours: String(settings.recentGapHours),
    driftWindowHours: String(settings.driftWindowHours),
    driftMinWindowHours: String(settings.driftMinWindowHours),
    driftMinRiseC: String(settings.driftMinRiseC),
    driftMinSlopeCPerHour: String(settings.driftMinSlopeCPerHour),
    gapMinMinutes: String(settings.gapMinMinutes),
  };
}

function readDraft(draft: Draft): AnalysisSettings | null {
  const next = {} as AnalysisSettings;
  for (const key of Object.keys(draft) as (keyof AnalysisSettings)[]) {
    const value = Number(draft[key]);
    if (!Number.isFinite(value)) return null;
    next[key] = value;
  }
  return next;
}

function formatAmount(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

function preview(settings: AnalysisSettings): string {
  const hours = (value: number) => `${value} ${value === 1 ? 'hour' : 'hours'}`;
  return (
    `Too warm means above that fridge's limit for ${describeDuration(settings.excursionMinDurationMinutes)} or more. ` +
    `No data means nothing for ${hours(settings.staleAfterHours)}. ` +
    `Warming up means a rise of at least ${formatAmount(settings.driftMinRiseC)}° over at least ${hours(settings.driftMinWindowHours)}, ` +
    `in the last ${hours(settings.driftWindowHours)}, climbing by at least ${formatAmount(settings.driftMinSlopeCPerHour)}° an hour.`
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
  intro: { fontSize: 13, lineHeight: 19, color: colors.textMuted },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  hint: { fontSize: 13, lineHeight: 18, color: colors.textMuted },
  field: { gap: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.background,
  },
  preview: { fontSize: 13, color: colors.text, lineHeight: 18 },
  error: { fontSize: 13, color: colors.alarm, lineHeight: 18 },
  saved: { fontSize: 13, color: colors.ok, lineHeight: 18 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: spacing.md,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  buttonBusy: { opacity: 0.7 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { api } from '../api/client';
import type { ConversionRule, FridgeListResponse, FridgeSummary, RulesListResponse } from '../api/types';
import { ErrorMessage, Loading } from '../components/Message';
import { Select } from '../components/Select';
import { useApi } from '../hooks/useApi';
import { colors, spacing } from '../theme';

export function RulesScreen() {
  const rulesApi = useApi<RulesListResponse>('/api/rules');
  const fridgesApi = useApi<FridgeListResponse>('/api/fridges');

  const [branch, setBranch] = useState<string | null>(null);
  const [fridge, setFridge] = useState<string | null>(null);
  const [logger, setLogger] = useState<string | null>(null);
  const [multiplyBy, setMultiplyBy] = useState('1');
  const [add, setAdd] = useState('0');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Re-read branches when this tab is opened, so a branch uploaded a moment
  // ago is already in the list rather than waiting for a full reload.
  useFocusEffect(
    useCallback(() => {
      rulesApi.refetch();
      fridgesApi.refetch();
    }, [rulesApi.refetch, fridgesApi.refetch]),
  );

  const fridges = fridgesApi.data?.fridges ?? [];
  const branches = useMemo(() => uniqueSorted(fridges.map((item) => item.branchName)), [fridges]);
  const fridgesInBranch = useMemo(
    () =>
      fridges
        .filter((item) => item.branchName === branch)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [fridges, branch],
  );
  const loggers = useMemo(
    () => loggersFor(fridgesInBranch, fridge),
    [fridgesInBranch, fridge],
  );

  // A branch/fridge/logger that disappeared after a reseed should not stay selected.
  useEffect(() => {
    if (branch && !branches.includes(branch)) {
      setBranch(null);
      setFridge(null);
      setLogger(null);
      return;
    }
    if (fridge && !fridgesInBranch.some((item) => item.name === fridge)) {
      setFridge(null);
      setLogger(null);
      return;
    }
    if (logger && !loggers.includes(logger)) {
      setLogger(null);
    }
  }, [branch, branches, fridge, fridgesInBranch, logger, loggers]);

  const multiply = Number(multiplyBy);
  const addValue = Number(add);
  const preview = useMemo(
    () => previewReading(4, Number.isFinite(multiply) ? multiply : 1, Number.isFinite(addValue) ? addValue : 0),
    [multiply, addValue],
  );

  const save = async () => {
    if (!branch) {
      setFormError('Pick a branch.');
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      await api.post('/api/rules', {
        matchBranch: branch,
        matchFridge: fridge,
        matchLogger: logger,
        multiplyBy: Number(multiplyBy),
        add: Number(add),
      });
      setFridge(null);
      setLogger(null);
      setMultiplyBy('1');
      setAdd('0');
      rulesApi.refetch();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save that rule.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (rule: ConversionRule) => {
    try {
      await api.delete(`/api/rules/${rule.id}`);
      rulesApi.refetch();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not delete that rule.');
    }
  };

  if (rulesApi.loading || fridgesApi.loading) return <Loading label="Loading rules..." />;
  if (rulesApi.error) return <ErrorMessage message={rulesApi.error} onRetry={rulesApi.refetch} />;
  if (fridgesApi.error) {
    return <ErrorMessage message={fridgesApi.error} onRetry={fridgesApi.refetch} />;
  }

  const rules = rulesApi.data?.rules ?? [];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.intro}>
        A rule scales the numbers in a file for one branch — for example multiply by 1.5, or add a
        calibration offset. Fridge and logger are optional.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>New rule</Text>

        {branches.length === 0 ? (
          <Text style={styles.intro}>
            Upload a logger file first. The branch list comes from what has already been imported,
            including any new branch you add later.
          </Text>
        ) : (
          <>
            <Select
              label="Branch"
              value={branch}
              options={branches.map((name) => ({ value: name, label: name }))}
              onChange={(next) => {
                setBranch(next);
                setFridge(null);
                setLogger(null);
              }}
              placeholder="Choose a branch"
            />
            {branch ? (
              <>
                <Select
                  label="Fridge (optional)"
                  value={fridge}
                  options={fridgesInBranch.map((item) => ({ value: item.name, label: item.name }))}
                  onChange={(next) => {
                    setFridge(next);
                    setLogger(null);
                  }}
                  placeholder="Any fridge"
                  emptyLabel="Any fridge"
                />
                <Select
                  label="Logger (optional)"
                  value={logger}
                  options={loggers.map((code) => ({ value: code, label: code }))}
                  onChange={setLogger}
                  placeholder="Any logger"
                  emptyLabel="Any logger"
                />
              </>
            ) : null}
          </>
        )}

        <View style={styles.row}>
          <View style={styles.half}>
            <Field
              label="Multiply by"
              value={multiplyBy}
              onChange={setMultiplyBy}
              placeholder="1.5"
              keyboard="decimal-pad"
            />
          </View>
          <View style={styles.half}>
            <Field
              label="Then add"
              value={add}
              onChange={setAdd}
              placeholder="0"
              keyboard="decimal-pad"
            />
          </View>
        </View>

        <Text style={styles.preview}>A reading of 4.0 would be stored as {preview}.</Text>

        {formError ? <Text style={styles.error}>{formError}</Text> : null}

        <Pressable
          style={[styles.button, (saving || !branch) && styles.buttonBusy]}
          onPress={save}
          disabled={saving || !branch}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save rule</Text>}
        </Pressable>
      </View>

      {rules.length === 0 ? (
        <Text style={styles.intro}>No rules yet. Until you add one, files are read as they are.</Text>
      ) : (
        rules.map((rule) => (
          <View key={rule.id} style={styles.card}>
            <Text style={styles.summary}>{rule.summary}</Text>
            <Pressable onPress={() => void remove(rule)} hitSlop={8}>
              <Text style={styles.delete}>Remove</Text>
            </Pressable>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboard,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  keyboard?: 'decimal-pad';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboard ?? 'default'}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
    </View>
  );
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function loggersFor(fridges: FridgeSummary[], fridgeName: string | null): string[] {
  const scoped = fridgeName ? fridges.filter((item) => item.name === fridgeName) : fridges;
  return uniqueSorted(
    scoped
      .map((item) => item.loggerCode)
      .filter((code): code is string => Boolean(code)),
  );
}

function previewReading(raw: number, multiplyBy: number, add: number): string {
  const stored = Math.round((raw * multiplyBy + add) * 100) / 100;
  return `${stored.toFixed(1)}°`;
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
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  preview: { fontSize: 13, color: colors.text, lineHeight: 18 },
  error: { fontSize: 13, color: colors.alarm, lineHeight: 18 },
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
  summary: { fontSize: 14, color: colors.text, lineHeight: 20 },
  delete: { fontSize: 13, fontWeight: '600', color: colors.alarm },
});

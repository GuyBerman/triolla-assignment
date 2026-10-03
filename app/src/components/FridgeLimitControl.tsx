import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { api } from '../api/client';
import { colors, spacing } from '../theme';

interface SavedFridge {
  id: number;
  thresholdC: number;
}

/**
 * The degree limit for one fridge. "Minutes above the limit" lives on the
 * other settings card; this is the number of degrees those minutes are about.
 */
export function FridgeLimitControl({
  fridgeId,
  label,
  thresholdC,
  onSaved,
}: {
  fridgeId: number;
  label: string;
  thresholdC: number;
  onSaved?: (thresholdC: number) => void;
}) {
  const [value, setValue] = useState(String(thresholdC));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // True while she is mid-edit. Must not be a state value the effect depends
  // on: ending the edit used to copy the parent's old number back into the
  // box, so a save looked like it had done nothing until a refresh.
  const editing = useRef(false);

  useEffect(() => {
    if (editing.current) return;
    setValue(String(thresholdC));
  }, [thresholdC]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await api.put<{ fridge: SavedFridge }>(`/api/fridges/${fridgeId}`, {
        thresholdC: value,
      });
      editing.current = false;
      setValue(String(response.fridge.thresholdC));
      setSaved(true);
      onSaved?.(response.fridge.thresholdC);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that limit.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.editor}>
        <TextInput
          value={value}
          onChangeText={(next) => {
            editing.current = true;
            setSaved(false);
            setValue(next);
          }}
          keyboardType="decimal-pad"
          style={styles.input}
          accessibilityLabel={`${label} limit in degrees`}
        />
        <Pressable
          onPress={() => void save()}
          disabled={saving}
          style={[styles.save, saving && styles.saveBusy]}
          accessibilityRole="button"
          accessibilityLabel={`Save limit for ${label}`}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.saveText}>{saved ? 'Saved' : 'Save'}</Text>
          )}
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 4 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  editor: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  input: {
    width: 88,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.background,
  },
  save: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 72,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBusy: { opacity: 0.7 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  error: { fontSize: 13, color: colors.alarm, lineHeight: 18 },
});

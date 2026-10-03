import type { CSSProperties } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../theme';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label: string;
  value: string | null;
  options: SelectOption[];
  onChange: (value: string | null) => void;
  placeholder: string;
  /** Shown as a selectable "none" row. Omit when the field is required. */
  emptyLabel?: string;
}

export function Select(props: SelectProps) {
  if (Platform.OS === 'web') {
    return <WebSelect {...props} />;
  }

  return <NativeSelect {...props} />;
}

function WebSelect({
  label,
  value,
  options,
  onChange,
  placeholder,
  emptyLabel,
}: SelectProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.webWrap}>
        <select
          value={value ?? ''}
          onChange={(event) => {
            const next = event.currentTarget.value;
            onChange(next === '' ? null : next);
          }}
          style={webSelectStyle}
        >
          <option value="" disabled={!emptyLabel}>
            {emptyLabel ?? placeholder}
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </View>
    </View>
  );
}

function NativeSelect({
  label,
  value,
  options,
  onChange,
  placeholder,
  emptyLabel,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  const choose = (next: string | null) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable
        style={styles.control}
        onPress={() => setOpen((current) => !current)}
        accessibilityRole="button"
      >
        <Text style={selected ? styles.value : styles.placeholder} numberOfLines={1}>
          {selected?.label ?? emptyLabel ?? placeholder}
        </Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.textMuted}
        />
      </Pressable>
      {open ? (
        <View style={styles.menu}>
          {emptyLabel ? (
            <Pressable style={styles.option} onPress={() => choose(null)}>
              <Text style={styles.optionText}>{emptyLabel}</Text>
            </Pressable>
          ) : null}
          {options.map((option) => (
            <Pressable
              key={option.value}
              style={[styles.option, option.value === value && styles.optionActive]}
              onPress={() => choose(option.value)}
            >
              <Text style={[styles.optionText, option.value === value && styles.optionTextActive]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const webSelectStyle: CSSProperties = {
  width: '100%',
  height: 42,
  borderRadius: 8,
  border: `1px solid ${colors.border}`,
  backgroundColor: colors.background,
  paddingLeft: 10,
  paddingRight: 10,
  fontSize: 15,
  color: colors.text,
};

const styles = StyleSheet.create({
  field: { gap: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  webWrap: { width: '100%' },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    minHeight: 42,
    gap: spacing.sm,
  },
  value: { flex: 1, fontSize: 15, color: colors.text },
  placeholder: { flex: 1, fontSize: 15, color: colors.textMuted },
  menu: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  option: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
  },
  optionActive: { backgroundColor: colors.okSoft },
  optionText: { fontSize: 15, color: colors.text },
  optionTextActive: { fontWeight: '600' },
});

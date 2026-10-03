import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../theme';

/**
 * Generic over the value so a row can mix presets with something that is not a
 * number of days - the inspector report needs a "Dates" chip alongside 7/30/90.
 */
export function RangeChips<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: readonly { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.row}>
      {options.map((range) => {
        const selected = value === range.value;
        return (
          <Pressable
            key={range.value}
            onPress={() => onChange(range.value)}
            style={[styles.chip, selected && styles.chipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={range.label}
          >
            <Text style={[styles.text, selected && styles.textActive]}>{range.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  text: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  textActive: { color: '#fff' },
});

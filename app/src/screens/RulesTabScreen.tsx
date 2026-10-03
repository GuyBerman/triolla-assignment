import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { RangeChips } from '../components/RangeChips';
import { colors, spacing } from '../theme';
import { RulesScreen } from './RulesScreen';
import { SettingsScreen } from './SettingsScreen';

const SECTIONS = [
  { label: 'Files', value: 'files' },
  { label: 'Settings', value: 'settings' },
] as const;

type Section = (typeof SECTIONS)[number]['value'];

/**
 * One tab, two jobs. A sixth tab truncated every label on a phone, and these
 * two questions are the ones she asks when a number looks wrong: how was this
 * file read, and when does a fridge count as a problem.
 */
export function RulesTabScreen() {
  const navigation = useNavigation();
  const [section, setSection] = useState<Section>('files');

  useEffect(() => {
    navigation.setOptions({ title: section === 'files' ? 'Rules' : 'Settings' });
  }, [navigation, section]);

  return (
    <View style={styles.screen}>
      <View style={styles.switcher}>
        <RangeChips options={SECTIONS} value={section} onChange={setSection} />
      </View>
      <View style={styles.body}>
        {section === 'files' ? <RulesScreen /> : <SettingsScreen />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  switcher: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  body: { flex: 1 },
});

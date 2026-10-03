import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { RangeChips } from '../components/RangeChips';
import { colors, spacing } from '../theme';
import { RulesScreen } from './RulesScreen';
import { SettingsScreen } from './SettingsScreen';

const SECTIONS = [
  { label: 'Rules', value: 'rules' },
  { label: 'Limits', value: 'limits' },
] as const;

type Section = (typeof SECTIONS)[number]['value'];

export function RulesTabScreen() {
  const navigation = useNavigation();
  const [section, setSection] = useState<Section>('rules');

  useEffect(() => {
    navigation.setOptions({ title: 'Settings' });
  }, [navigation]);

  return (
    <View style={styles.screen}>
      <View style={styles.switcher}>
        <RangeChips options={SECTIONS} value={section} onChange={setSection} />
      </View>
      <View style={styles.body}>
        {section === 'rules' ? <RulesScreen /> : <SettingsScreen />}
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

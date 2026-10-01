import { StyleSheet, Text, View } from 'react-native';

import { API_BASE_URL } from '../api/client';
import type { HealthResponse } from '../api/types';
import { ErrorMessage, Loading } from '../components/Message';
import { useApi } from '../hooks/useApi';
import { colors, spacing } from '../theme';

// Phase 1 placeholder: proves the app can reach the API. Replaced by the real
// fridge list in Phase 4.
export function DashboardScreen() {
  const { data, error, loading, refetch } = useApi<HealthResponse>('/api/health');

  if (loading) return <Loading />;
  if (error) return <ErrorMessage message={error} onRetry={refetch} />;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>API connected</Text>
      <Text style={styles.muted}>{API_BASE_URL}</Text>
      <Text style={styles.muted}>database: {data?.database}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: spacing.xs,
  },
  title: { fontSize: 18, fontWeight: '600', color: colors.ok },
  muted: { color: colors.textMuted, fontSize: 13 },
});

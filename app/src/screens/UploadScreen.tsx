import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { uploadFile } from '../api/client';
import type { UploadReport } from '../api/types';
import { formatDateTime } from '../format';
import { colors, spacing } from '../theme';

export function UploadScreen() {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<UploadReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pickAndUpload = async () => {
    setError(null);
    setReport(null);

    const picked = await DocumentPicker.getDocumentAsync({
      // Branch managers send whatever their logger software exports, and some
      // mail clients mislabel CSV as text/plain or application/octet-stream.
      // Filtering harder than this hides the user's own file from them.
      type: ['text/csv', 'text/plain', 'text/tab-separated-values', 'application/vnd.ms-excel', '*/*'],
      copyToCacheDirectory: true,
    });

    if (picked.canceled || picked.assets.length === 0) return;
    const asset = picked.assets[0]!;

    setBusy(true);
    try {
      setReport(await uploadFile(asset));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'The upload failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>
        Pick a logger file a branch has sent you. Columns can be in any order and named anything
        reasonable, and uploading the same file twice is safe.
      </Text>

      <Pressable style={[styles.button, busy && styles.buttonBusy]} onPress={pickAndUpload} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Choose a file</Text>}
      </Pressable>

      {error ? (
        <View style={[styles.card, styles.errorCard]}>
          <Text style={styles.errorTitle}>Nothing was imported</Text>
          <Text style={styles.errorBody}>{error}</Text>
        </View>
      ) : null}

      {report ? <Report report={report} /> : null}
    </ScrollView>
  );
}

function Report({ report }: { report: UploadReport }) {
  const nothingNew = report.rowsAccepted === 0 && report.rowsDuplicate > 0;

  return (
    <>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{report.filename}</Text>

        <Text style={styles.headline}>
          {nothingNew
            ? 'Already imported - nothing in this file was new.'
            : `${report.rowsAccepted} new ${report.rowsAccepted === 1 ? 'reading' : 'readings'} imported.`}
        </Text>

        <View style={styles.tallies}>
          <Tally label="Rows in file" value={report.rowsTotal} />
          <Tally label="Imported" value={report.rowsAccepted} tone={colors.ok} />
          {report.rowsDuplicate > 0 ? (
            <Tally label="Already had" value={report.rowsDuplicate} />
          ) : null}
          {report.rowsRejected > 0 ? (
            <Tally label="Could not read" value={report.rowsRejected} tone={colors.alarm} />
          ) : null}
        </View>
      </View>

      {report.loggerMoves.length > 0 ? (
        <Card title="A logger has moved">
          {report.loggerMoves.map((move) => (
            <Text key={`${move.loggerCode}-${move.at}`} style={styles.body}>
              {move.loggerCode} is now recording {move.toFridge}
              {move.fromFridge ? `, and no longer ${move.fromFridge}` : ''} (from{' '}
              {formatDateTime(move.at)}).
              {move.fromFridge
                ? ` ${move.fromFridge} will show as unmonitored until a logger is fitted.`
                : ''}
            </Text>
          ))}
        </Card>
      ) : null}

      {report.convertedFromFahrenheit.length > 0 ? (
        <Card title="Converted to Celsius">
          <Text style={styles.body}>
            {report.convertedFromFahrenheit.join(', ')} recorded in Fahrenheit. The readings were
            converted, so everything on the dashboard is in Celsius.
          </Text>
        </Card>
      ) : null}

      {report.warnings.length > 0 ? (
        <Card title="Worth a look">
          {report.warnings.map((warning, index) => (
            <Text key={index} style={styles.body}>
              {warning}
            </Text>
          ))}
        </Card>
      ) : null}

      {report.rejections.length > 0 ? (
        <Card title={`Rows that could not be read (${report.rowsRejected})`}>
          {/* Row numbers match what the spreadsheet shows, so Summer can open
              the file, go to the row, and see the problem for herself. */}
          {report.rejections.slice(0, 12).map((rejection, index) => (
            <Text key={index} style={styles.body}>
              Row {rejection.row}: {rejection.reason}
            </Text>
          ))}
          {report.rejections.length > 12 ? (
            <Text style={styles.muted}>
              ...and {report.rejections.length - 12} more of the same kind.
            </Text>
          ) : null}
        </Card>
      ) : null}

      <Card title="Columns we used">
        {report.columnMapping.map((mapping) => (
          <Text key={mapping.field} style={styles.muted}>
            {mapping.sourceHeader} → {mapping.field}
          </Text>
        ))}
        {report.unmappedColumns.length > 0 ? (
          <Text style={styles.muted}>Ignored: {report.unmappedColumns.join(', ')}</Text>
        ) : null}
      </Card>
    </>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Tally({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <View style={styles.tally}>
      <Text style={[styles.tallyValue, tone ? { color: tone } : null]}>{value}</Text>
      <Text style={styles.tallyLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  intro: { fontSize: 13, lineHeight: 19, color: colors.textMuted },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: spacing.md,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonBusy: { opacity: 0.7 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs + 2,
  },
  errorCard: { borderColor: colors.alarm, backgroundColor: colors.alarmSoft },
  errorTitle: { fontSize: 14, fontWeight: '700', color: colors.alarm },
  errorBody: { fontSize: 13, lineHeight: 19, color: colors.text },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  headline: { fontSize: 14, color: colors.text, lineHeight: 20 },
  body: { fontSize: 13, lineHeight: 19, color: colors.text },
  muted: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  tallies: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, marginTop: spacing.xs },
  tally: { alignItems: 'flex-start' },
  tallyValue: { fontSize: 20, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  tallyLabel: { fontSize: 11, color: colors.textMuted },
});

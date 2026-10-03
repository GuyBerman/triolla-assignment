import * as DocumentPicker from 'expo-document-picker';
import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { uploadFile, type FileLabels } from '../api/client';
import type { NeedsLabels, UploadHistoryEntry, UploadReport } from '../api/types';
import { Select } from '../components/Select';
import { formatDateTime } from '../format';
import { useApi } from '../hooks/useApi';
import { colors, spacing } from '../theme';

/** The asset shape the picker hands back, narrowed to what we re-upload with. */
interface PickedAsset {
  uri: string;
  name: string;
  mimeType?: string | null;
  file?: File | null;
}

/**
 * One chosen file, and where it got to. Kept per file rather than as a single
 * result, because Summer gets a file per branch - twelve emails, not one - and
 * uploading them one at a time means twelve round trips through this screen.
 */
interface FileOutcome {
  key: string;
  asset: PickedAsset;
  state: 'uploading' | 'done' | 'failed';
  report: UploadReport | null;
  error: string | null;
}

export function UploadScreen() {
  const [outcomes, setOutcomes] = useState<FileOutcome[]>([]);
  const [busy, setBusy] = useState(false);
  const history = useApi<UploadHistoryEntry[]>('/api/uploads');

  const update = useCallback((key: string, patch: Partial<FileOutcome>) => {
    setOutcomes((current) =>
      current.map((outcome) => (outcome.key === key ? { ...outcome, ...patch } : outcome)),
    );
  }, []);

  const send = useCallback(
    async (key: string, asset: PickedAsset, labels?: FileLabels) => {
      update(key, { state: 'uploading', error: null });
      try {
        const report = await uploadFile(asset, labels);
        update(key, { state: 'done', report, error: null });
      } catch (err) {
        update(key, {
          state: 'failed',
          report: null,
          error: err instanceof Error ? err.message : 'The upload failed.',
        });
      }
    },
    [update],
  );

  const pickAndUpload = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      // Branch managers send whatever their logger software exports, and some
      // mail clients mislabel CSV as text/plain or application/octet-stream.
      // Filtering harder than this hides the user's own file from them.
      type: [
        'text/csv',
        'text/plain',
        'text/tab-separated-values',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '*/*',
      ],
      multiple: true,
      copyToCacheDirectory: true,
    });

    if (picked.canceled || picked.assets.length === 0) return;

    const batch: FileOutcome[] = picked.assets.map((asset, index) => ({
      key: `${Date.now()}-${index}-${asset.name}`,
      asset,
      state: 'uploading',
      report: null,
      error: null,
    }));

    setOutcomes(batch);
    setBusy(true);
    // Sequentially, not in parallel: each file opens a transaction that creates
    // branches and fridges, and two files for a new branch arriving at once
    // would race for the same row.
    for (const outcome of batch) {
      await send(outcome.key, outcome.asset);
    }
    setBusy(false);
    history.refetch();
  };

  const relabel = async (outcome: FileOutcome, labels: FileLabels) => {
    setBusy(true);
    await send(outcome.key, outcome.asset, labels);
    setBusy(false);
    history.refetch();
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.intro}>
        Pick the logger files the branches have sent you - CSV, TSV or Excel. You can choose several
        at once. Columns can be in any order and named anything reasonable, and uploading the same
        file twice is safe.
      </Text>

      <Pressable
        style={[styles.button, busy && styles.buttonBusy]}
        onPress={pickAndUpload}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Choose files</Text>
        )}
      </Pressable>

      {outcomes.map((outcome) => (
        <Outcome
          key={outcome.key}
          outcome={outcome}
          onRelabel={(labels) => void relabel(outcome, labels)}
          busy={busy}
        />
      ))}

      <History entries={history.data} error={history.error} />
    </ScrollView>
  );
}

function Outcome({
  outcome,
  onRelabel,
  busy,
}: {
  outcome: FileOutcome;
  onRelabel: (labels: FileLabels) => void;
  busy: boolean;
}) {
  if (outcome.state === 'uploading') {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{outcome.asset.name}</Text>
        <Text style={styles.muted}>Reading it...</Text>
      </View>
    );
  }

  if (outcome.state === 'failed') {
    return (
      <View style={[styles.card, styles.errorCard]}>
        <Text style={styles.errorTitle}>Nothing was imported from {outcome.asset.name}</Text>
        <Text style={styles.errorBody}>{outcome.error}</Text>
      </View>
    );
  }

  if (outcome.report === null) return null;

  if (outcome.report.needsLabels) {
    return (
      <LabelForm
        filename={outcome.asset.name}
        needs={outcome.report.needsLabels}
        onSubmit={onRelabel}
        busy={busy}
      />
    );
  }

  return <Report report={outcome.report} />;
}

/**
 * The step that used to happen in Excel.
 *
 * Summer's own description of her week: "the logger files themselves only have
 * the time and the temperature, I type in the logger number, the branch and the
 * fridge myself when I paste". Refusing those files would leave that work
 * exactly where it is, so she does the typing here instead - and picking a
 * logger she has used before fills in all three, which is both faster and the
 * only way to avoid inventing a second spelling of "Tel Aviv".
 */
function LabelForm({
  filename,
  needs,
  onSubmit,
  busy,
}: {
  filename: string;
  needs: NeedsLabels;
  onSubmit: (labels: FileLabels) => void;
  busy: boolean;
}) {
  const [logger, setLogger] = useState('');
  const [branch, setBranch] = useState('');
  const [fridge, setFridge] = useState('');

  // Only ask for what the file does not already say. A file with a Logger
  // column but no branch needs one answer, not three.
  const asks = (field: string) => needs.missing.includes(field);

  const assigned = needs.knownLoggers.filter(
    (known) => known.branchName !== null && known.fridgeName !== null,
  );

  const chooseKnown = (code: string | null) => {
    const known = needs.knownLoggers.find((candidate) => candidate.code === code);
    if (!known) return;
    setLogger(known.code);
    setBranch(known.branchName ?? '');
    setFridge(known.fridgeName ?? '');
  };

  const answered = (field: string, value: string) => !asks(field) || value.trim() !== '';
  const ready =
    !busy &&
    answered('logger', logger) &&
    answered('branch', branch) &&
    answered('fridge', fridge);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Which fridge is {filename} from?</Text>
      <Text style={styles.body}>
        This file has readings in it, but nothing saying where they came from. Nothing has been
        imported yet.
      </Text>

      {assigned.length > 0 && asks('logger') ? (
        <Select
          label="A logger you have used before"
          value={assigned.some((known) => known.code === logger) ? logger : null}
          options={assigned.map((known) => ({
            value: known.code,
            label: `${known.code} — ${known.branchName} ${known.fridgeName}`,
          }))}
          onChange={chooseKnown}
          placeholder="Pick one to fill in the rest"
          emptyLabel="Type it in instead"
        />
      ) : null}

      {asks('logger') ? (
        <Field label="Logger number" value={logger} onChange={setLogger} placeholder="TL-0512" />
      ) : null}
      {asks('branch') ? (
        <Field label="Branch" value={branch} onChange={setBranch} placeholder="Jerusalem" />
      ) : null}
      {asks('fridge') ? (
        <Field label="Fridge" value={fridge} onChange={setFridge} placeholder="Dairy" />
      ) : null}

      <Pressable
        style={[styles.button, !ready && styles.buttonBusy]}
        onPress={() => onSubmit({ logger: logger.trim(), branch: branch.trim(), fridge: fridge.trim() })}
        disabled={!ready}
      >
        <Text style={styles.buttonText}>Import it</Text>
      </Pressable>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="words"
        autoCorrect={false}
      />
    </View>
  );
}

/**
 * What has already been sent. Twelve branches email separately, so the question
 * "have I done Haifa yet?" is a real one halfway through a Sunday.
 */
function History({
  entries,
  error,
}: {
  entries: UploadHistoryEntry[] | null;
  error: string | null;
}) {
  if (error !== null || entries === null || entries.length === 0) return null;

  return (
    <Card title="Already uploaded">
      {entries.slice(0, 8).map((entry) => (
        <Text key={entry.id} style={styles.body}>
          {entry.filename} — {describeEntry(entry)}
          <Text style={styles.muted}> · {formatDateTime(entry.uploadedAt)}</Text>
        </Text>
      ))}
    </Card>
  );
}

/**
 * An attempt that imported nothing is still recorded, so the list has to say
 * which kind of nothing it was: a file she had already sent, or one that never
 * got in. "Nothing new" about a file that was actually refused would be a
 * quietly wrong reassurance.
 */
function describeEntry(entry: UploadHistoryEntry): string {
  if (entry.rowsAccepted > 0) {
    return `${entry.rowsAccepted} reading${entry.rowsAccepted === 1 ? '' : 's'}`;
  }
  if (entry.rowsTotal === 0) return 'not imported';
  return 'nothing new';
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

      {report.appliedRules.length > 0 ? (
        <Card title="Conversion rules applied">
          {report.appliedRules.map((applied) => (
            <Text key={applied.ruleId} style={styles.body}>
              {applied.summary} ({applied.rows} readings)
            </Text>
          ))}
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

function Card({ title, children }: { title: string; children: ReactNode }) {
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
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xl,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
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
  field: { gap: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    minHeight: 42,
    fontSize: 15,
    color: colors.text,
  },
  tallies: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, marginTop: spacing.xs },
  tally: { alignItems: 'flex-start' },
  tallyValue: { fontSize: 20, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  tallyLabel: { fontSize: 11, color: colors.textMuted },
});

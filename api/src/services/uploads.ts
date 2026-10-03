import { ingestFile } from '../ingest/ingest';
import { listRecentUploads } from '../repository';
import type { SuppliedLabels } from '../ingest/headers';
import type { UploadHistoryEntry, UploadReport } from '../types';

/** Same path seed uses. If uploading works, seeding works. */
export async function ingestUpload(
  filename: string,
  content: string | Buffer,
  labels?: SuppliedLabels,
): Promise<UploadReport> {
  return ingestFile(filename, content, labels);
}

export async function listUploadHistory(): Promise<UploadHistoryEntry[]> {
  return listRecentUploads();
}

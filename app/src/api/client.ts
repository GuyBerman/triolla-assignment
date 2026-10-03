import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { UploadReport } from './types';

/**
 * Resolving the API base URL is the one piece of plumbing that decides whether
 * this works on a phone or only in a browser.
 *
 * On web, `localhost` is the dev machine and everything is fine. On a physical
 * phone running Expo Go, `localhost` is the *phone*, so the API is unreachable.
 * Expo already knows the dev machine's LAN address because that is how it
 * served the bundle, so we reuse that host and swap in the API port.
 */
function resolveBaseUrl(): string {
  const override = process.env.EXPO_PUBLIC_API_URL;
  if (override) {
    return override.replace(/\/$/, '');
  }

  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost;

  const host = hostUri?.split(':')[0];
  if (host) {
    return `http://${host}:4000`;
  }

  return 'http://localhost:4000';
}

const API_BASE_URL = resolveBaseUrl();

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, init);
  } catch {
    // A network-level failure here almost always means the API is not running,
    // so say that instead of surfacing "Network request failed".
    throw new ApiError(
      `Cannot reach the API at ${API_BASE_URL}. Is it running? (npm run dev in api/)`,
      0,
    );
  }

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      // response had no JSON body; the status text is the best we have
    }
    throw new ApiError(detail, response.status);
  }

  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),

  postFile: <T>(path: string, body: FormData) =>
    request<T>(path, {
      method: 'POST',
      body,
      // Deliberately no Content-Type: the runtime has to set the multipart
      // boundary itself, and setting it by hand breaks the upload.
    }),

  post: <T>(path: string, body: unknown) =>
    request<T>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/** What Summer typed when a file did not say which fridge it came from. */
export interface FileLabels {
  logger: string;
  branch: string;
  fridge: string;
}

/** The subset of a document-picker asset we need; avoids importing the picker here. */
interface PickedFile {
  uri: string;
  name: string;
  mimeType?: string | null;
  file?: File | null;
}

/**
 * React Native and the web disagree about what goes into a FormData file part.
 *
 * On web the picker hands back a real `File`, which FormData understands. On a
 * phone there is no `File`: the part has to be the `{ uri, name, type }` shape
 * React Native's own fetch recognises, which is not valid DOM FormData and so
 * needs the cast.
 */
export async function uploadFile(asset: PickedFile, labels?: FileLabels): Promise<UploadReport> {
  const form = new FormData();
  const name = asset.name || 'upload.csv';
  const type = asset.mimeType ?? 'text/csv';

  if (Platform.OS === 'web') {
    const blob = asset.file ?? (await (await fetch(asset.uri)).blob());
    form.append('file', blob, name);
  } else {
    form.append('file', { uri: asset.uri, name, type } as unknown as Blob);
  }

  // Only sent for a raw logger file, where the file itself does not say which
  // fridge it is from. Blank fields are left off entirely rather than sent as
  // empty strings, so the API can tell "not supplied" from "supplied blank".
  if (labels) {
    if (labels.logger) form.append('logger', labels.logger);
    if (labels.branch) form.append('branch', labels.branch);
    if (labels.fridge) form.append('fridge', labels.fridge);
  }

  return api.postFile<UploadReport>('/api/uploads', form);
}

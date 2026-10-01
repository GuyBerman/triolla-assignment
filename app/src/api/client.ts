import Constants from 'expo-constants';

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

export const API_BASE_URL = resolveBaseUrl();

export class ApiError extends Error {
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
};

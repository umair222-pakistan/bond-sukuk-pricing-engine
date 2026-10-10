const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
const configuredUrlIsLoopback = configuredApiUrl
  ? /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(configuredApiUrl)
  : false;

export const API_URL =
  configuredApiUrl && (!import.meta.env.PROD || !configuredUrlIsLoopback)
    ? configuredApiUrl.replace(/\/+$/, "")
    : import.meta.env.DEV
      ? "http://127.0.0.1:8000"
      : "https://noorfinance-api.onrender.com";

export type OfflineResponse = { offline: true };
export type ApiFetchResult = Response | OfflineResponse;

export async function apiFetch(
  path: string,
  init: RequestInit = {},
  timeoutMs = 3000,
): Promise<ApiFetchResult> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${API_URL}${path.startsWith("/") ? path : `/${path}`}`, {
      ...init,
      signal: controller.signal,
    });
  } catch {
    return { offline: true };
  } finally {
    window.clearTimeout(timeout);
  }
}

export function isOfflineResponse(result: ApiFetchResult): result is OfflineResponse {
  return "offline" in result;
}

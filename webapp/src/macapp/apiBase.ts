/**
 * Helper for choosing the API base URL in a way that supports:
 * - Development: VITE_API_BASE_URL="http://127.0.0.1:8123"
 * - Packaged macOS app: VITE_API_BASE_URL="" (so we fallback to window.location.origin)
 *
 * If your API calls are same-origin, you can also just use relative paths:
 *   fetch("/api/thing")
 */
export function apiBaseUrl(): string {
  const env = (import.meta as any).env?.VITE_API_BASE_URL as string | undefined;

  if (env && env.trim().length > 0) {
    // Dev / explicit override
    return env.replace(/\/$/, "");
  }

  // Packaged app (and any same-origin deploy)
  return window.location.origin.replace(/\/$/, "");
}

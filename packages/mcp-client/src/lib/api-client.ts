/**
 * Thin typed wrapper for calling the OpenPump REST API.
 *
 * Unlike apps/mcp/src/lib/api-client.ts, this version does NOT export
 * a hardcoded API_BASE_URL constant. The base URL is always passed
 * explicitly by callers (from the configurable OPENPUMP_API_URL env var).
 */

export interface ApiClient {
  get(path: string): Promise<Response>;
  post(path: string, body: unknown, extraHeaders?: Record<string, string>): Promise<Response>;
  patch(path: string, body: unknown): Promise<Response>;
  delete(path: string): Promise<Response>;
}

/**
 * Create an authenticated API client for the OpenPump REST API.
 *
 * @param apiKey  - Raw API key string (op_sk_live_...) from UserContext
 * @param baseUrl - Base URL of the REST API (e.g. "https://openpump.io/api")
 */
export function createApiClient(apiKey: string, baseUrl: string): ApiClient {
  const authHeader = 'Bearer ' + apiKey;

  return {
    async get(path: string): Promise<Response> {
      return fetch(baseUrl + path, {
        headers: { Authorization: authHeader },
      });
    },

    async post(path: string, body: unknown, extraHeaders?: Record<string, string>): Promise<Response> {
      return fetch(baseUrl + path, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
          ...extraHeaders,
        },
        body: JSON.stringify(body),
      });
    },

    async patch(path: string, body: unknown): Promise<Response> {
      return fetch(baseUrl + path, {
        method: 'PATCH',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    },

    async delete(path: string): Promise<Response> {
      return fetch(baseUrl + path, {
        method: 'DELETE',
        headers: { Authorization: authHeader },
      });
    },
  };
}

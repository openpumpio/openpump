/**
 * Thin typed wrapper for calling the OpenPump REST API from the ElizaOS plugin.
 *
 * Mirrors the pattern from `apps/mcp/src/lib/api-client.ts`.
 * Authentication uses the raw API key (op_sk_live_...) as a Bearer token.
 */

export interface ApiClient {
  get(path: string): Promise<Response>;
  post(path: string, body: unknown): Promise<Response>;
}

/**
 * Create an authenticated API client for the OpenPump REST API.
 *
 * @param apiKey  - Raw API key string (op_sk_live_...) from character settings
 * @param baseUrl - Base URL of the REST API (e.g. https://api.openpump.io)
 */
export function createApiClient(apiKey: string, baseUrl: string): ApiClient {
  const authHeader = 'Bearer ' + apiKey;

  return {
    async get(path: string): Promise<Response> {
      return fetch(baseUrl + path, {
        headers: { Authorization: authHeader },
      });
    },

    async post(path: string, body: unknown): Promise<Response> {
      return fetch(baseUrl + path, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    },
  };
}

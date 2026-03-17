/**
 * Shared utilities for action handlers.
 *
 * Provides access to the API client stored on the agent during plugin
 * initialization, and a generic error-handling wrapper for API calls.
 */
import type { ApiClient } from './api-client.js';

/**
 * Symbol used to store the API client on the agent instance.
 * Using a well-known string property to avoid Symbol serialization issues.
 */
const CLIENT_KEY = '__openpumpClient';

/** Store the API client on the agent instance during initialize(). */
export function storeClient(agent: Record<string, unknown>, client: ApiClient): void {
  agent[CLIENT_KEY] = client;
}

/** Retrieve the API client stored during initialize(). */
export function getClient(agent: Record<string, unknown>): ApiClient {
  const client = agent[CLIENT_KEY] as ApiClient | undefined;
  if (!client) {
    throw new Error('OpenPumpPlugin not initialized. Call agent.use(OpenPumpPlugin) first.');
  }
  return client;
}

/**
 * Generic API call helper with structured error handling.
 *
 * Returns the parsed JSON response body on success, or throws an Error
 * with a descriptive message on HTTP failure.
 */
export async function callApi(
  client: ApiClient,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let res: Response;
  switch (method) {
    case 'GET':
      res = await client.get(path);
      break;
    case 'POST':
      res = await client.post(path, body ?? {});
      break;
    case 'PATCH':
      res = await client.patch(path, body ?? {});
      break;
    case 'DELETE':
      res = await client.delete(path);
      break;
  }

  if (!res.ok) {
    const errText = await res.text();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(errText) as Record<string, unknown>;
    } catch {
      parsed = { message: errText };
    }
    const msg =
      typeof parsed['message'] === 'string' ? parsed['message'] : errText;
    throw new Error(`OpenPump API error (HTTP ${String(res.status)}): ${msg}`);
  }

  return (await res.json()) as Record<string, unknown>;
}

import {
  OpenPumpError,
  AuthenticationError,
  RateLimitError,
  ValidationError,
  NotFoundError,
} from './errors.js';

export interface HttpClientConfig {
  apiKey: string;
  baseUrl: string;
  timeout: number;
}

export class HttpClient {
  private readonly _apiKey: string;
  private readonly _baseUrl: string;
  private readonly _timeout: number;

  constructor(config: HttpClientConfig) {
    this._apiKey = config.apiKey;
    // Strip trailing slash to normalise base URL
    this._baseUrl = config.baseUrl.replace(/\/+$/, '');
    this._timeout = config.timeout;
  }

  async get<T>(path: string, query?: Record<string, string>): Promise<T> {
    let url = `${this._baseUrl}${path}`;
    if (query && Object.keys(query).length > 0) {
      const params = new URLSearchParams(query);
      url += `?${params.toString()}`;
    }
    const response = await fetch(url, {
      headers: this._headers(),
      signal: AbortSignal.timeout(this._timeout),
    });
    return this._handleResponse<T>(response);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const init: RequestInit = {
      method: 'POST',
      headers: {
        ...this._headers(),
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(this._timeout),
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(`${this._baseUrl}${path}`, init);
    return this._handleResponse<T>(response);
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this._baseUrl}${path}`, {
      method: 'PATCH',
      headers: {
        ...this._headers(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this._timeout),
    });
    return this._handleResponse<T>(response);
  }

  async delete<T>(path: string): Promise<T> {
    const response = await fetch(`${this._baseUrl}${path}`, {
      method: 'DELETE',
      headers: this._headers(),
      signal: AbortSignal.timeout(this._timeout),
    });
    return this._handleResponse<T>(response);
  }

  private _headers(): Record<string, string> {
    return { Authorization: `Bearer ${this._apiKey}` };
  }

  private async _handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      await this._throwApiError(response);
    }
    const json = (await response.json()) as Record<string, unknown>;
    // API wraps responses in { data: T } -- unwrap if present
    if (json !== null && typeof json === 'object' && 'data' in json) {
      return json['data'] as T;
    }
    return json as T;
  }

  private async _throwApiError(response: Response): Promise<never> {
    let body: { error?: string; code?: string; message?: string; details?: unknown } = {};
    try {
      body = (await response.json()) as typeof body;
    } catch {
      // Non-JSON error body -- use status text
    }

    const code = body.code ?? body.error ?? 'UNKNOWN_ERROR';
    const message = body.message ?? response.statusText;
    const details = body.details;

    switch (response.status) {
    case 401: {
      throw new AuthenticationError(code, message, 401, details);
    }
    case 404: {
      throw new NotFoundError(code, message, 404, details);
    }
    case 422: {
      throw new ValidationError(code, message, 422, details);
    }
    case 429: {
      throw new RateLimitError(code, message, 429, details);
    }
    default: {
      throw new OpenPumpError(code, message, response.status, details);
    }
    }
  }
}

/**
 * Unit tests for CLI prompt validation helpers.
 */
import { describe, expect, it } from 'vitest';

import { validateApiKey } from '../prompts.js';

describe('validateApiKey', () => {
  it('returns error for empty string', () => {
    expect(validateApiKey('')).toBe('API key is required');
  });

  it('returns error for whitespace-only string', () => {
    expect(validateApiKey('   ')).toBe('API key is required');
  });

  it('returns error for key without correct prefix', () => {
    expect(validateApiKey('sk_live_abc123456789')).toBe(
      'API key must start with "op_sk_live_"',
    );
  });

  it('returns error for key that is too short', () => {
    expect(validateApiKey('op_sk_live_abc')).toBe('API key appears too short');
  });

  it('returns undefined for valid API key', () => {
    expect(validateApiKey('op_sk_live_abc123456789')).toBeUndefined();
  });

  it('accepts a long valid API key', () => {
    expect(
      validateApiKey('op_sk_live_abcdefghijklmnopqrstuvwxyz0123456789'),
    ).toBeUndefined();
  });
});

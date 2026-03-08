/**
 * Unit tests for CLI config detection and JSON merging.
 *
 * Uses mock filesystem -- no real config files are read or written.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';

vi.mock('node:fs');
vi.mock('node:os');

// Dynamic import after mocking so the module binds to the mocked versions
const {
  getClaudeDesktopConfigPath,
  getCursorConfigPath,
  readConfigFile,
  mergeServerEntry,
  writeConfigFile,
} = await import('../config.js');

// ── Helpers ──────────────────────────────────────────────────────────────

/** Save + restore process.platform between tests */
const originalPlatform = process.platform;
function setPlatform(value: string): void {
  Object.defineProperty(process, 'platform', { value, writable: true, configurable: true });
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('getClaudeDesktopConfigPath', () => {
  beforeEach(() => {
    vi.mocked(os.homedir).mockReturnValue('/home/testuser');
    // Restore platform after each test
    setPlatform(originalPlatform);
  });

  afterEach(() => {
    setPlatform(originalPlatform);
  });

  it('returns macOS path on darwin', () => {
    setPlatform('darwin');
    const result = getClaudeDesktopConfigPath();
    expect(result).toBe(
      '/home/testuser/Library/Application Support/Claude/claude_desktop_config.json',
    );
  });

  it('returns Windows path on win32 using APPDATA', () => {
    setPlatform('win32');
    process.env['APPDATA'] = 'C:\\Users\\testuser\\AppData\\Roaming';
    const result = getClaudeDesktopConfigPath();
    expect(result).toContain('Claude');
    expect(result).toContain('claude_desktop_config.json');
    expect(result).toMatch(/C:\\Users\\testuser\\AppData\\Roaming/);
    delete process.env['APPDATA'];
  });

  it('returns Windows fallback path when APPDATA is not set', () => {
    setPlatform('win32');
    delete process.env['APPDATA'];
    const result = getClaudeDesktopConfigPath();
    expect(result).toContain('AppData');
    expect(result).toContain('Roaming');
    expect(result).toContain('Claude');
    expect(result).toContain('claude_desktop_config.json');
  });

  it('returns Linux path on linux', () => {
    setPlatform('linux');
    const result = getClaudeDesktopConfigPath();
    expect(result).toBe('/home/testuser/.config/Claude/claude_desktop_config.json');
  });
});

describe('getCursorConfigPath', () => {
  it('returns ~/.cursor/mcp.json on all platforms', () => {
    vi.mocked(os.homedir).mockReturnValue('/home/testuser');
    const result = getCursorConfigPath();
    expect(result).toBe('/home/testuser/.cursor/mcp.json');
  });
});

describe('readConfigFile', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns default structure when file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const result = readConfigFile('/fake/path.json');
    expect(result).toEqual({ mcpServers: {} });
  });

  it('parses valid JSON config with existing servers', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        mcpServers: {
          'some-other-server': { command: 'node', args: ['server.js'] },
        },
      }),
    );
    const result = readConfigFile('/fake/path.json');
    expect(result['mcpServers']).toHaveProperty('some-other-server');
  });

  it('returns default structure for empty file', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('');
    const result = readConfigFile('/fake/path.json');
    expect(result).toEqual({ mcpServers: {} });
  });

  it('returns default structure for whitespace-only file', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('   \n  ');
    const result = readConfigFile('/fake/path.json');
    expect(result).toEqual({ mcpServers: {} });
  });

  it('returns default structure for malformed JSON', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('{ invalid json }}}');
    const result = readConfigFile('/fake/path.json');
    expect(result).toEqual({ mcpServers: {} });
  });

  it('returns default structure when parsed value is an array', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('["not", "an", "object"]');
    const result = readConfigFile('/fake/path.json');
    expect(result).toEqual({ mcpServers: {} });
  });

  it('preserves extra top-level keys in config', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        mcpServers: {},
        globalShortcut: 'Ctrl+Shift+P',
        theme: 'dark',
      }),
    );
    const result = readConfigFile('/fake/path.json');
    expect(result['globalShortcut']).toBe('Ctrl+Shift+P');
    expect(result['theme']).toBe('dark');
  });
});

describe('mergeServerEntry', () => {
  const testApiKey = 'op_sk_live_test123456789';

  it('adds openpump entry to empty mcpServers', () => {
    const config = { mcpServers: {} };
    const { config: merged, alreadyExists } = mergeServerEntry(config, testApiKey);
    expect(alreadyExists).toBe(false);
    const servers = merged['mcpServers'] as Record<string, unknown>;
    expect(servers).toHaveProperty('openpump');
    const openpump = servers['openpump'] as Record<string, unknown>;
    expect(openpump['command']).toBe('npx');
    expect(openpump['args']).toEqual(['-y', '@openpump/mcp@latest']);
    const env = openpump['env'] as Record<string, string>;
    expect(env['OPENPUMP_API_KEY']).toBe(testApiKey);
  });

  it('preserves existing servers when adding openpump', () => {
    const config = {
      mcpServers: {
        'other-server': { command: 'node', args: ['other.js'] },
      },
    };
    const { config: merged } = mergeServerEntry(config, testApiKey);
    const servers = merged['mcpServers'] as Record<string, unknown>;
    expect(servers['other-server']).toBeDefined();
    expect(servers['openpump']).toBeDefined();
  });

  it('detects existing openpump entry', () => {
    const config = {
      mcpServers: {
        openpump: { command: 'npx', args: ['old-version'] },
      },
    };
    const { alreadyExists } = mergeServerEntry(config, testApiKey);
    expect(alreadyExists).toBe(true);
  });

  it('overwrites existing openpump entry with new config', () => {
    const config = {
      mcpServers: {
        openpump: { command: 'npx', args: ['old-version'], env: { OPENPUMP_API_KEY: 'old_key' } },
      },
    };
    const { config: merged } = mergeServerEntry(config, testApiKey);
    const servers = merged['mcpServers'] as Record<string, unknown>;
    expect(servers).toHaveProperty('openpump');
    const openpump = servers['openpump'] as Record<string, unknown>;
    expect(openpump['args']).toEqual(['-y', '@openpump/mcp@latest']);
    const env = openpump['env'] as Record<string, string>;
    expect(env['OPENPUMP_API_KEY']).toBe(testApiKey);
  });

  it('handles config without mcpServers key', () => {
    const config = { someOtherKey: 'value' };
    const { config: merged } = mergeServerEntry(config, testApiKey);
    const servers = merged['mcpServers'] as Record<string, unknown>;
    expect(servers['openpump']).toBeDefined();
    expect(merged['someOtherKey']).toBe('value');
  });

  it('handles mcpServers being an array (invalid) gracefully', () => {
    const config = { mcpServers: ['invalid'] };
    const { config: merged } = mergeServerEntry(config as Record<string, unknown>, testApiKey);
    const servers = merged['mcpServers'] as Record<string, unknown>;
    expect(servers['openpump']).toBeDefined();
  });

  it('handles mcpServers being null gracefully', () => {
    const config = { mcpServers: null };
    const { config: merged } = mergeServerEntry(config as unknown as Record<string, unknown>, testApiKey);
    const servers = merged['mcpServers'] as Record<string, unknown>;
    expect(servers['openpump']).toBeDefined();
  });
});

describe('writeConfigFile', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('creates parent directories if they do not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    writeConfigFile('/new/dir/config.json', { mcpServers: {} });

    expect(fs.mkdirSync).toHaveBeenCalledWith('/new/dir', { recursive: true });
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('does not create directories if they already exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    writeConfigFile('/existing/dir/config.json', { mcpServers: {} });

    expect(fs.mkdirSync).not.toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('writes JSON with 2-space indentation and trailing newline', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    const config = { mcpServers: { openpump: { command: 'npx' } } };
    writeConfigFile('/existing/config.json', config);

    const calls = vi.mocked(fs.writeFileSync).mock.calls;
    expect(calls).toHaveLength(1);
    const firstCall = calls[0] as unknown[];
    const writtenContent = firstCall[1] as string;
    expect(writtenContent).toBe(JSON.stringify(config, null, 2) + '\n');
    expect(writtenContent.endsWith('\n')).toBe(true);
  });

  it('writes to the correct path with utf-8 encoding', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    writeConfigFile('/target/config.json', { mcpServers: {} });

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/target/config.json',
      expect.any(String),
      'utf8',
    );
  });
});

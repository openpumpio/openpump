/**
 * MCP client config file detection, path resolution, and JSON merging.
 *
 * Supports: Claude Desktop (file-based), Cursor (file-based), Claude Code (CLI-based).
 *
 * @module
 */
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// ── Types ────────────────────────────────────────────────────────────────

export type ClientType = 'claude-desktop' | 'cursor' | 'claude-code';

export interface ClientConfig {
  type: ClientType;
  name: string;
  /** Config file path. `null` for CLI-based clients (claude-code). */
  configPath: string | null;
  /** Whether the config file (or parent dir for new files) already exists. */
  exists: boolean;
}

export interface WriteOutcome {
  clientName: string;
  success: boolean;
  message: string;
}

export interface SelectedClient {
  type: ClientType;
  name: string;
  configPath: string | null;
  /** Whether the user confirmed overwriting an existing openpump entry. */
  overwrite: boolean;
}

// ── Config path resolution ───────────────────────────────────────────────

/**
 * Get the config file path for Claude Desktop based on the current platform.
 */
export function getClaudeDesktopConfigPath(): string {
  const home = os.homedir();

  switch (process.platform) {
  case 'darwin': {
    return path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  }
  case 'win32': {
    return path.join(
      process.env['APPDATA'] ?? path.join(home, 'AppData', 'Roaming'),
      'Claude',
      'claude_desktop_config.json',
    );
  }
  default: {
    // Linux and other Unix-like systems
    return path.join(home, '.config', 'Claude', 'claude_desktop_config.json');
  }
  }
}

/**
 * Get the config file path for Cursor (same across all platforms).
 */
export function getCursorConfigPath(): string {
  return path.join(os.homedir(), '.cursor', 'mcp.json');
}

/**
 * Detect which MCP clients are available on this system.
 *
 * For file-based clients (Claude Desktop, Cursor), checks if the parent
 * directory exists (the config file itself may not exist yet).
 * Claude Code is detected by checking if the `claude` CLI is on PATH.
 */
export function detectClients(): ClientConfig[] {
  const clients: ClientConfig[] = [];

  // Claude Desktop
  const desktopPath = getClaudeDesktopConfigPath();
  const desktopDir = path.dirname(desktopPath);
  const desktopDirExists = fs.existsSync(desktopDir);
  const desktopFileExists = fs.existsSync(desktopPath);
  if (desktopDirExists || desktopFileExists) {
    clients.push({
      type: 'claude-desktop',
      name: 'Claude Desktop',
      configPath: desktopPath,
      exists: desktopFileExists,
    });
  }

  // Cursor
  const cursorPath = getCursorConfigPath();
  const cursorDir = path.dirname(cursorPath);
  const cursorDirExists = fs.existsSync(cursorDir);
  const cursorFileExists = fs.existsSync(cursorPath);
  if (cursorDirExists || cursorFileExists) {
    clients.push({
      type: 'cursor',
      name: 'Cursor',
      configPath: cursorPath,
      exists: cursorFileExists,
    });
  }

  // Claude Code -- check if `claude` is on PATH
  try {
    execSync('claude --version', { stdio: 'ignore' });
    clients.push({
      type: 'claude-code',
      name: 'Claude Code',
      configPath: null,
      exists: true,
    });
  } catch {
    // claude CLI not found -- skip
  }

  return clients;
}

// ── MCP server config entry ──────────────────────────────────────────────

/**
 * Build the MCP server entry that gets merged into client config files.
 */
function buildServerEntry(apiKey: string): Record<string, unknown> {
  return {
    command: 'npx',
    args: ['-y', '@openpump/mcp@latest'],
    env: {
      OPENPUMP_API_KEY: apiKey,
    },
  };
}

// ── JSON config merging ──────────────────────────────────────────────────

/**
 * Read an existing JSON config file, or return a default empty structure.
 * Handles files that don't exist yet and gracefully handles parse errors.
 */
export function readConfigFile(configPath: string): Record<string, unknown> {
  if (!fs.existsSync(configPath)) {
    return { mcpServers: {} };
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    // Handle empty files
    if (!raw.trim()) {
      return { mcpServers: {} };
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { mcpServers: {} };
    }
    return parsed as Record<string, unknown>;
  } catch {
    // Malformed JSON -- return default to avoid data loss (we log a warning upstream)
    return { mcpServers: {} };
  }
}

/**
 * Merge the OpenPump MCP server entry into a config object.
 * Returns the merged config and whether an openpump key already existed.
 */
export function mergeServerEntry(
  config: Record<string, unknown>,
  apiKey: string,
): { config: Record<string, unknown>; alreadyExists: boolean } {
  const mcpServers =
    typeof config['mcpServers'] === 'object' &&
    config['mcpServers'] !== null &&
    !Array.isArray(config['mcpServers'])
      ? { ...(config['mcpServers'] as Record<string, unknown>) }
      : {};

  const alreadyExists = 'openpump' in mcpServers;

  mcpServers['openpump'] = buildServerEntry(apiKey);

  return {
    config: { ...config, mcpServers },
    alreadyExists,
  };
}

/**
 * Write a JSON config file, creating parent directories if needed.
 * Writes with 2-space indentation and a trailing newline.
 */
export function writeConfigFile(configPath: string, config: Record<string, unknown>): void {
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

// ── Write configs for selected clients ───────────────────────────────────

/**
 * Write MCP configuration for all selected clients.
 * Returns an array of outcomes describing success/failure for each client.
 */
export function writeClientConfigs(
  clients: SelectedClient[],
  apiKey: string,
): WriteOutcome[] {
  const outcomes: WriteOutcome[] = [];

  for (const client of clients) {
    try {
      if (client.type === 'claude-code') {
        // Claude Code uses CLI -- spawn `claude mcp add`
        execSync(
          'claude mcp add openpump --transport stdio -- npx -y @openpump/mcp@latest',
          {
            stdio: 'ignore',
            env: { ...process.env, OPENPUMP_API_KEY: apiKey },
          },
        );
        outcomes.push({
          clientName: client.name,
          success: true,
          message: 'Configured via `claude mcp add`',
        });
        continue;
      }

      // File-based clients (Claude Desktop, Cursor)
      if (!client.configPath) {
        outcomes.push({
          clientName: client.name,
          success: false,
          message: 'No config path available',
        });
        continue;
      }

      const existing = readConfigFile(client.configPath);
      const { config: merged } = mergeServerEntry(existing, apiKey);
      writeConfigFile(client.configPath, merged);

      outcomes.push({
        clientName: client.name,
        success: true,
        message: `Updated ${client.configPath}`,
      });
    } catch (error: unknown) {
      outcomes.push({
        clientName: client.name,
        success: false,
        message: `Failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return outcomes;
}

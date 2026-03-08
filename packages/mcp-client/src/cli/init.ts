/**
 * CLI installer for @openpump/mcp.
 *
 * Usage:
 *   npx @openpump/mcp init [--api-key <key>] [--help]
 *
 * Detects installed MCP clients, prompts for API key,
 * and writes configuration files.
 *
 * @module
 */
import * as p from '@clack/prompts';
import color from 'picocolors';

import { detectClients, writeClientConfigs } from './config.js';
import { runPrompts } from './prompts.js';

function parseArgs(argv: string[]): { apiKey?: string; help: boolean } {
  const args = argv.slice(2); // skip node + script path
  let apiKey: string | undefined;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--api-key' && args[i + 1]) {
      apiKey = args[i + 1];
      i++; // skip next arg
    }
  }

  return { apiKey, help };
}

function printHelp(): void {
  console.log(`
  ${color.bold('@openpump/mcp init')} -- Configure MCP clients for OpenPump

  ${color.dim('Usage:')}
    npx @openpump/mcp init [options]

  ${color.dim('Options:')}
    --api-key <key>  OpenPump API key (op_sk_live_...)
    --help, -h       Show this help message

  ${color.dim('Supported Clients:')}
    - Claude Desktop (macOS, Windows, Linux)
    - Cursor
    - Claude Code (via claude mcp add)

  ${color.dim('Get your API key at:')}
    https://openpump.io/dashboard/api-keys
`);
}

try {
  const { apiKey: flagApiKey, help } = parseArgs(process.argv);

  if (help) {
    printHelp();
    // eslint-disable-next-line unicorn/no-process-exit -- CLI entry point, help exits cleanly
    process.exit(0);
  }

  p.intro(color.bgCyan(color.black(' @openpump/mcp init ')));

  // 1. Detect installed clients
  const detected = detectClients();

  if (detected.length === 0) {
    p.log.warn('No supported MCP clients detected on this system.');
    p.log.info('Supported clients: Claude Desktop, Cursor, Claude Code');
    p.outro('Install a supported client and try again.');
    // eslint-disable-next-line unicorn/no-process-exit -- CLI entry point, clean exit
    process.exit(0);
  }

  p.log.info(`Found ${detected.length.toString()} MCP client(s): ${detected.map((c) => c.name).join(', ')}`);

  // 2. Run interactive prompts (or use flag values)
  const result = await runPrompts(detected, flagApiKey);

  if (!result) {
    // User cancelled or validation failed
    // eslint-disable-next-line unicorn/no-process-exit -- CLI entry point, clean exit on cancel
    process.exit(0);
  }

  // 3. Write configs
  const s = p.spinner();
  s.start('Writing configuration files...');

  const outcomes = writeClientConfigs(result.clients, result.apiKey);

  s.stop('Configuration complete!');

  // 4. Print results
  for (const outcome of outcomes) {
    if (outcome.success) {
      p.log.success(`${outcome.clientName}: ${outcome.message}`);
    } else {
      p.log.error(`${outcome.clientName}: ${outcome.message}`);
    }
  }

  const configuredClients = outcomes
    .filter((o) => o.success)
    .map((o) => o.clientName);

  if (configuredClients.length > 0) {
    p.outro(
      `Restart ${configuredClients.join(', ')} to activate. Problems? ${color.underline(color.cyan('https://openpump.io/docs/mcp'))}`,
    );
  } else {
    p.outro('No clients were configured. Run again to retry.');
  }
} catch (error: unknown) {
  p.log.error(String(error));
  // eslint-disable-next-line unicorn/no-process-exit -- CLI entry point, must exit on unhandled error
  process.exit(1);
}

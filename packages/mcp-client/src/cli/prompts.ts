/**
 * Interactive CLI prompts for the `npx @openpump/mcp init` command.
 *
 * Uses @clack/prompts for a beautiful, minimal terminal UI.
 *
 * @module
 */
import * as p from '@clack/prompts';

import type { ClientConfig, ClientType, SelectedClient } from './config.js';
import { readConfigFile } from './config.js';

export interface PromptResult {
  apiKey: string;
  clients: SelectedClient[];
}

/**
 * Validate that an API key has the correct format.
 * Returns an error string if invalid, or `undefined` if valid.
 */
export function validateApiKey(value: string): string | undefined {
  if (!value.trim()) return 'API key is required';
  if (!value.startsWith('op_sk_live_'))
    return 'API key must start with "op_sk_live_"';
  if (value.length < 20) return 'API key appears too short';
  return undefined;
}

/**
 * Wrapper for @clack/prompts validate signature which passes `string | undefined`.
 */
function validateApiKeyPrompt(value: string | undefined): string | undefined {
  return validateApiKey(value ?? '');
}

/**
 * Run the interactive init prompts.
 *
 * @param detected - Detected MCP clients on this system
 * @param flagApiKey - API key from `--api-key` flag (skips prompt if provided)
 * @returns Prompt results, or `null` if user cancelled
 */
export async function runPrompts(
  detected: ClientConfig[],
  flagApiKey?: string,
): Promise<PromptResult | null> {
  // 1. API key prompt (or use flag value)
  let apiKey: string;

  if (flagApiKey) {
    const error = validateApiKey(flagApiKey);
    if (error) {
      p.log.error(`Invalid --api-key: ${error}`);
      return null;
    }
    apiKey = flagApiKey;
    p.log.info('Using API key from --api-key flag');
  } else {
    const keyResult = await p.text({
      message: 'Enter your OpenPump API key:',
      placeholder: 'op_sk_live_...',
      validate: validateApiKeyPrompt,
    });

    if (p.isCancel(keyResult)) {
      p.cancel('Setup cancelled.');
      return null;
    }

    apiKey = keyResult;
  }

  // 2. Client selection
  const clientOptions = detected.map((c) => ({
    value: c.type,
    label: c.name,
    hint: c.exists ? 'config file found' : 'directory found, will create config',
  }));

  const selectedTypes = await p.multiselect<ClientType>({
    message: 'Which clients do you want to configure?',
    options: clientOptions,
    required: true,
  });

  if (p.isCancel(selectedTypes)) {
    p.cancel('Setup cancelled.');
    return null;
  }

  // 3. Check for existing openpump entries and confirm overwrite
  const selectedClients: SelectedClient[] = [];

  for (const clientType of selectedTypes) {
    const client = detected.find((c) => c.type === clientType);
    if (!client) continue;

    let overwrite = false;

    // Check if openpump entry already exists in file-based configs
    if (client.configPath && client.exists) {
      const existing = readConfigFile(client.configPath);
      const mcpServers = existing['mcpServers'];
      if (
        typeof mcpServers === 'object' &&
        mcpServers !== null &&
        'openpump' in (mcpServers as Record<string, unknown>)
      ) {
        const confirmResult = await p.confirm({
          message: `${client.name} already has an OpenPump entry. Overwrite?`,
        });

        if (p.isCancel(confirmResult)) {
          p.cancel('Setup cancelled.');
          return null;
        }

        if (!confirmResult) {
          p.log.info(`Skipping ${client.name}`);
          continue;
        }

        overwrite = true;
      }
    }

    selectedClients.push({
      type: client.type,
      name: client.name,
      configPath: client.configPath,
      overwrite,
    });
  }

  if (selectedClients.length === 0) {
    p.log.warn('No clients selected for configuration.');
    return null;
  }

  return { apiKey, clients: selectedClients };
}

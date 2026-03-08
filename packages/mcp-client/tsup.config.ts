import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'server-http': 'src/server-http.ts',
    'cli/init': 'src/cli/init.ts',
  },
  format: ['esm'],
  target: 'node18',
  clean: true,
  dts: false,
  banner: {
    // Adds shebang to all entry points. Harmless for non-bin entries.
    js: '#!/usr/bin/env node',
  },
});

#!/usr/bin/env node
/**
 * Cross-platform launcher for `next dev` / `next start` that takes the port
 * from the ENVIRONMENT, so the frontend port can be changed from an env file
 * without editing package.json.
 *
 * Port precedence (first match wins):
 *   1. process.env.PORT        (shell / Docker / CI: `PORT=4000 npm run dev`)
 *   2. PORT in .env.local      (your local, git-ignored override)
 *   3. PORT in .env            (committed default, if present)
 *   4. 3001                    (fallback)
 *
 * Usage (via package.json): `node scripts/run-next.mjs dev` | `... start`.
 * Spawns Next through `node <next-cli>` (not the .cmd shim) so it works
 * identically on Windows, macOS, Linux and inside the Docker image.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Read the PORT= line from a dotenv file (no dependency needed). */
function portFromEnvFile(file) {
  if (!existsSync(file)) return undefined;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*PORT\s*=\s*(.+?)\s*$/);
    if (match) return match[1].replace(/^["']|["']$/g, '').trim();
  }
  return undefined;
}

const mode = process.argv[2] === 'start' ? 'start' : 'dev';
const port =
  process.env.PORT ||
  portFromEnvFile(resolve(projectRoot, '.env.local')) ||
  portFromEnvFile(resolve(projectRoot, '.env')) ||
  '3001';

const nextCli = require.resolve('next/dist/bin/next');

const child = spawn(process.execPath, [nextCli, mode, '-p', String(port)], {
  stdio: 'inherit',
  env: { ...process.env, PORT: String(port) },
});
child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  console.error('[run-next] failed to start Next:', err);
  process.exit(1);
});

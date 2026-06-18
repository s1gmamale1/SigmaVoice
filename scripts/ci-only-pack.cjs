#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');

if (process.env.CI !== 'true') {
  console.error(
    'Packaging is CI-only for SigmaVoice. Use .github/workflows/release.yml instead of running pack:* locally.',
  );
  process.exit(1);
}

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const builderArgs = ['exec', 'electron-builder', ...process.argv.slice(2), '--config', 'electron-builder.yml'];

const build = spawnSync(process.execPath, ['scripts/build.cjs'], { stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

const pack = spawnSync(pnpm, builderArgs, { stdio: 'inherit' });
process.exit(pack.status ?? 1);

import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

test('ci-only-pack refuses local packaging when CI is not true', () => {
  const result = spawnSync(process.execPath, ['scripts/ci-only-pack.cjs', '--mac', 'dmg'], {
    cwd: process.cwd(),
    env: { ...process.env, CI: '' },
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Packaging is CI-only/i);
});

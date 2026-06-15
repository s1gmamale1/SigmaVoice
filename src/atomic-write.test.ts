// SigmaVoice — atomic-write unit tests (node:test, native TS).

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { atomicWriteFileSync } from './atomic-write.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-atomic-'));
after(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ } });

test('writes data that reads back', () => {
  const f = path.join(root, 'a.json');
  atomicWriteFileSync(f, '{"x":1}');
  assert.equal(fs.readFileSync(f, 'utf8'), '{"x":1}');
});

test('creates missing parent directories', () => {
  const f = path.join(root, 'nested', 'deep', 'b.json');
  atomicWriteFileSync(f, 'hi');
  assert.equal(fs.readFileSync(f, 'utf8'), 'hi');
});

test('overwrites an existing file', () => {
  const f = path.join(root, 'c.json');
  atomicWriteFileSync(f, 'first');
  atomicWriteFileSync(f, 'second');
  assert.equal(fs.readFileSync(f, 'utf8'), 'second');
});

test('leaves no leftover .tmp files (unique temp names, cleaned up)', () => {
  const f = path.join(root, 'd.json');
  atomicWriteFileSync(f, '1');
  atomicWriteFileSync(f, '2');
  const stray = fs.readdirSync(root).filter((n) => n.startsWith('d.json.') && n.endsWith('.tmp'));
  assert.deepEqual(stray, [], `unexpected temp leftovers: ${stray.join(', ')}`);
});

test('throws when the data cannot be persisted (target path is a directory)', () => {
  const dir = path.join(root, 'iam-a-dir');
  fs.mkdirSync(dir);
  assert.throws(() => atomicWriteFileSync(dir, 'nope'));
});

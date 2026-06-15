import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createFileKv } from './kv-store.ts';

const tmpPath = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'sigmavoice-kv-')),
  'store.json',
);

after(() => {
  try { fs.rmSync(path.dirname(tmpPath), { recursive: true, force: true }); }
  catch { /* best effort */ }
});

test('set/get round-trips and returns null for missing keys', () => {
  const kv = createFileKv(tmpPath);
  assert.equal(kv.get('missing'), null);
  kv.set('a', 'alpha');
  assert.equal(kv.get('a'), 'alpha');
});

test('values persist across a fresh createFileKv on the same path', () => {
  createFileKv(tmpPath).set('persisted', 'yes');
  const reopened = createFileKv(tmpPath);
  assert.equal(reopened.get('persisted'), 'yes');
});

test('a corrupt / non-JSON file falls back to empty without throwing', () => {
  fs.writeFileSync(tmpPath, '{ this is not json', 'utf8');
  const kv = createFileKv(tmpPath); // must not throw
  assert.equal(kv.get('persisted'), null);
  // Still usable after recovering from corruption.
  kv.set('recovered', 'ok');
  assert.equal(kv.get('recovered'), 'ok');
});

test('non-string stored values are dropped on load per the string→string contract', () => {
  // Simulate a file written out-of-band with mixed value types.
  fs.writeFileSync(
    tmpPath,
    JSON.stringify({ str: 'keep', num: 7, obj: { x: 1 }, nil: null }),
    'utf8',
  );
  const kv = createFileKv(tmpPath);
  assert.equal(kv.get('str'), 'keep'); // string kept
  assert.equal(kv.get('num'), null); // non-string filtered out
  assert.equal(kv.get('obj'), null);
  assert.equal(kv.get('nil'), null);
});

test('an array-shaped file is treated as empty (not an object map)', () => {
  fs.writeFileSync(tmpPath, JSON.stringify(['a', 'b']), 'utf8');
  const kv = createFileKv(tmpPath);
  assert.equal(kv.get('0'), null);
});

test('set does not throw when persistence fails (capture contract), still served from memory', () => {
  // filePath is a directory → every write fails; set() must still not throw.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-kv-dir-'));
  const kv = createFileKv(dir);
  assert.doesNotThrow(() => kv.set('a', 'b'));
  assert.equal(kv.get('a'), 'b');
});

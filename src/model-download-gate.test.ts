import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldStartModelDownload } from './model-download-gate.ts';

test('shouldStartModelDownload rejects a duplicate in-flight model download', () => {
  assert.deepEqual(shouldStartModelDownload('small.en-q5_1', true), {
    ok: false,
    error: 'Model is already downloading: small.en-q5_1',
  });
});

test('shouldStartModelDownload allows a non-duplicate model download', () => {
  assert.deepEqual(shouldStartModelDownload('small.en-q5_1', false), { ok: true });
});

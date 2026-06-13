import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getRemoteSttConfig, setRemoteSttConfig, getTransformConfig, setTransformConfig,
} from './cloud-config.ts';
import type { KvStore } from './kv-store.ts';

function fakeKv(seed?: Record<string, string>): KvStore {
  const map = new Map<string, string>(Object.entries(seed ?? {}));
  return { get: (k) => (map.has(k) ? map.get(k)! : null), set: (k, v) => { map.set(k, v); } };
}

test('setRemoteSttConfig enabled writes mode + trimmed url/model/key', () => {
  const kv = fakeKv();
  const r = setRemoteSttConfig(kv, { enabled: true, baseUrl: '  http://192.168.1.5:8000/v1 ', model: ' large-v3 ', apiKey: ' k ' });
  assert.equal(r.ok, true);
  assert.equal(kv.get('voice.transcriptionMode'), 'openai-whisper-api');
  assert.equal(kv.get('voice.stt.openai-whisper-api.baseUrl'), 'http://192.168.1.5:8000/v1');
  assert.equal(kv.get('voice.stt.openai-whisper-api.model'), 'large-v3');
  assert.equal(kv.get('voice.stt.openai-whisper-api.apiKey'), 'k');
});

test('setRemoteSttConfig rejects an enabled config with a bad url', () => {
  const kv = fakeKv();
  const r = setRemoteSttConfig(kv, { enabled: true, baseUrl: 'not-a-url', model: '', apiKey: '' });
  assert.equal(r.ok, false);
  assert.match(r.error, /url/i);
  assert.equal(kv.get('voice.transcriptionMode'), null);
});

test('setRemoteSttConfig disabled reverts mode to local (keeps url for next time)', () => {
  const kv = fakeKv({ 'voice.transcriptionMode': 'openai-whisper-api', 'voice.stt.openai-whisper-api.baseUrl': 'http://x/v1' });
  const r = setRemoteSttConfig(kv, { enabled: false, baseUrl: 'http://x/v1', model: '', apiKey: '' });
  assert.equal(r.ok, true);
  assert.equal(kv.get('voice.transcriptionMode'), 'local');
  assert.equal(kv.get('voice.stt.openai-whisper-api.baseUrl'), 'http://x/v1');
});

test('getRemoteSttConfig reflects persisted values + enabled flag', () => {
  const kv = fakeKv({ 'voice.transcriptionMode': 'openai-whisper-api', 'voice.stt.openai-whisper-api.baseUrl': 'http://x/v1', 'voice.stt.openai-whisper-api.model': 'm' });
  assert.deepEqual(getRemoteSttConfig(kv), { enabled: true, baseUrl: 'http://x/v1', model: 'm' });
});

test('setTransformConfig validates mode + preset and caps the custom prompt', () => {
  const kv = fakeKv();
  const r = setTransformConfig(kv, { mode: 'openrouter', model: 'google/gemini-2.5-flash-lite', preset: 'custom', prompt: 'x'.repeat(5000) });
  assert.equal(r.ok, true);
  assert.equal(kv.get('voice.transform.mode'), 'openrouter');
  assert.equal(kv.get('voice.transform.preset'), 'custom');
  assert.equal((kv.get('voice.transform.prompt') ?? '').length, 2000);
});

test('setTransformConfig rejects an unknown mode', () => {
  const r = setTransformConfig(fakeKv(), { mode: 'evil', model: 'm', preset: 'punctuate', prompt: '' });
  assert.equal(r.ok, false);
});

test('getTransformConfig defaults to off + flash-lite + punctuate', () => {
  assert.deepEqual(getTransformConfig(fakeKv()), {
    mode: 'off', model: 'google/gemini-2.5-flash-lite', preset: 'punctuate', prompt: '',
  });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setDictionary, getStatsSummary } from './settings-data.ts';
import type { KvStore } from './kv-store.ts';

/** Minimal in-memory KvStore over a Map (string→string). */
function fakeKv(seed?: Record<string, string>): KvStore & { map: Map<string, string> } {
  const map = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    map,
    get: (k) => (map.has(k) ? map.get(k)! : null),
    set: (k, v) => { map.set(k, v); },
  };
}

test('setDictionary sanitizes rows and returns the clean list', () => {
  const kv = fakeKv();
  const result = setDictionary(kv, [
    { pattern: 'gh', replacement: 'GitHub', type: 'phrase' }, // valid → keep
    { pattern: '', replacement: 'x', type: 'phrase' }, // empty pattern → drop
    { pattern: 'x'.repeat(201), replacement: 'y', type: 'macro' }, // >200 → drop
    { pattern: 'bad', type: 'phrase' }, // malformed (no replacement) → drop
    { pattern: 'ok', replacement: 'okay', type: 'macro' }, // valid → keep
    'not-an-object', // malformed → drop
  ]);

  assert.deepEqual(result, [
    { pattern: 'gh', replacement: 'GitHub', type: 'phrase' },
    { pattern: 'ok', replacement: 'okay', type: 'macro' },
  ]);
  // Returns the same sanitized array it persisted.
  assert.deepEqual(JSON.parse(kv.get('voice.dictionary')!), result);
});

test('setDictionary drops a row whose replacement exceeds the cap (>2000)', () => {
  const kv = fakeKv();
  const result = setDictionary(kv, [
    { pattern: 'ok', replacement: 'okay', type: 'phrase' }, // valid → keep
    { pattern: 'big', replacement: 'z'.repeat(2001), type: 'macro' }, // >2000 → drop
    { pattern: 'edge', replacement: 'z'.repeat(2000), type: 'macro' }, // exactly 2000 → keep
  ]);

  assert.deepEqual(result, [
    { pattern: 'ok', replacement: 'okay', type: 'phrase' },
    { pattern: 'edge', replacement: 'z'.repeat(2000), type: 'macro' },
  ]);
  // The over-long replacement row is absent from what was persisted.
  assert.deepEqual(JSON.parse(kv.get('voice.dictionary')!), result);
});

test('setDictionary strips control chars from replacement but keeps \\n and \\t', () => {
  const kv = fakeKv();
  const result = setDictionary(kv, [
    // \x07 (BEL) is a control char → stripped; \n and \t must survive.
    { pattern: 'sig', replacement: 'line1\x07\nline2\ttabbed', type: 'macro' },
  ]);

  assert.equal(result.length, 1);
  // BEL removed; newline + tab preserved.
  assert.equal(result[0].replacement, 'line1\nline2\ttabbed');
  assert.ok(!result[0].replacement.includes('\x07'));
  assert.deepEqual(JSON.parse(kv.get('voice.dictionary')!), result);
});

test('getStatsSummary returns zeros on empty/missing key', () => {
  assert.deepEqual(getStatsSummary(fakeKv()), {
    totalWords: 0, recordings: 0, avgWpm: 0, recent: [],
  });
});

test('getStatsSummary recovers from a corrupt JSON value', () => {
  assert.deepEqual(getStatsSummary(fakeKv({ 'voice.stats': '{not json' })), {
    totalWords: 0, recordings: 0, avgWpm: 0, recent: [],
  });
});

test('getStatsSummary aggregates totalWords/recordings and rounds avgWpm', () => {
  const kv = fakeKv({
    'voice.stats': JSON.stringify([
      { timestamp: 1, words: 10, wpm: 100 },
      { timestamp: 2, words: 5, wpm: 81 },
      { timestamp: 3, words: 20, wpm: 82 },
      { timestamp: 4, words: 7, wpm: 0 }, // wpm 0 excluded from the average
    ]),
  });
  const s = getStatsSummary(kv);
  assert.equal(s.totalWords, 42); // 10+5+20+7
  assert.equal(s.recordings, 4); // all rows counted, incl. the wpm:0 row
  assert.equal(s.avgWpm, 88); // Math.round((100+81+82)/3) = Math.round(87.67) = 88
});

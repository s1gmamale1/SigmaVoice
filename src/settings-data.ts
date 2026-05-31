// SigmaVoice — settings data helpers (dictionary + usage stats).
//
// Pure read/aggregate logic over the KV store, shared by the IPC handlers in
// main.ts. Kept out of main.ts to keep it lean and to make this logic unit-able.
//
// Storage formats are dictated by @sigmalink/voice-core (we must stay
// compatible so the live transcription path reads what the UI writes):
//   - voice.dictionary : JSON `Array<{ pattern, replacement, type }>`
//                        (consumed by voice-core normalizeTranscript)
//   - voice.stats      : JSON `Array<{ words, durationMs, wpm, timestamp }>`
//                        (appended by voice-core appendSessionStat, capped 200)

import type { KvStore } from './kv-store';

const KV_DICTIONARY = 'voice.dictionary';
const KV_STATS = 'voice.stats';
const MAX_PATTERN_LENGTH = 200;
const MAX_REPLACEMENT_LENGTH = 2000;
const RECENT_LIMIT = 12;

// Control chars to strip from a replacement string: the C0 controls and DEL,
// i.e. \x00–\x08, \x0B (VT), \x0C (FF), \x0E–\x1F, \x7F. Newline (\x0A / \n)
// and tab (\x09 / \t) are deliberately PRESERVED — they're legitimately useful
// in dictionary expansions (e.g. a macro that inserts a multi-line snippet).
// Hex escapes (not raw bytes) keep this source clean and reviewable.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

function stripControlChars(s: string): string {
  return s.replace(CONTROL_CHARS, '');
}

export interface DictionaryEntry {
  pattern: string;
  replacement: string;
  type: 'phrase' | 'macro';
}

export interface StatsRecord {
  timestamp: number;
  words: number;
  wpm: number;
}

export interface StatsSummary {
  totalWords: number;
  recordings: number;
  avgWpm: number;
  recent: StatsRecord[];
}

/** Read + parse the dictionary; returns [] on missing/corrupt data. */
export function getDictionary(kv: KvStore): DictionaryEntry[] {
  try {
    const raw = kv.get(KV_DICTIONARY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isDictionaryEntry);
  } catch {
    return [];
  }
}

/**
 * Validate (input boundary) + persist the dictionary. Drops malformed rows,
 * over-long patterns, and over-long replacements rather than throwing, so a bad
 * row from the UI can't wedge the store. The replacement is also sanitized of
 * control characters (newline/tab preserved). Returns the list that was written.
 */
export function setDictionary(kv: KvStore, entries: unknown): DictionaryEntry[] {
  const clean = Array.isArray(entries) ? entries.filter(isDictionaryEntry) : [];
  const sanitized = clean
    // Pattern bounds (unchanged): non-empty, capped length.
    .filter((e) => e.pattern.length > 0 && e.pattern.length <= MAX_PATTERN_LENGTH)
    // Replacement bound: drop rows whose replacement exceeds the cap. Matches the
    // existing over-long-pattern drop behavior (drop, don't truncate).
    .filter((e) => e.replacement.length <= MAX_REPLACEMENT_LENGTH)
    .map((e) => ({
      pattern: e.pattern,
      // Strip control chars from the replacement (keep \n and \t).
      replacement: stripControlChars(e.replacement),
      type: e.type,
    }));
  kv.set(KV_DICTIONARY, JSON.stringify(sanitized));
  return sanitized;
}

/** Aggregate the rolling stats list into the dashboard summary. */
export function getStatsSummary(kv: KvStore): StatsSummary {
  const empty: StatsSummary = { totalWords: 0, recordings: 0, avgWpm: 0, recent: [] };
  try {
    const raw = kv.get(KV_STATS);
    if (!raw) return empty;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return empty;

    let totalWords = 0;
    let wpmSum = 0;
    let wpmCount = 0;
    const recent: StatsRecord[] = [];

    for (const row of parsed) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const words = typeof r.words === 'number' ? r.words : 0;
      const wpm = typeof r.wpm === 'number' ? r.wpm : 0;
      const timestamp = typeof r.timestamp === 'number' ? r.timestamp : 0;
      totalWords += words;
      if (wpm > 0) {
        wpmSum += wpm;
        wpmCount += 1;
      }
      recent.push({ timestamp, words, wpm });
    }

    return {
      totalWords,
      recordings: parsed.length,
      avgWpm: wpmCount > 0 ? Math.round(wpmSum / wpmCount) : 0,
      recent: recent.slice(-RECENT_LIMIT).reverse(),
    };
  } catch {
    return empty;
  }
}

function isDictionaryEntry(value: unknown): value is DictionaryEntry {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.pattern === 'string' &&
    typeof v.replacement === 'string' &&
    (v.type === 'phrase' || v.type === 'macro')
  );
}

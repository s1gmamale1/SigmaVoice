// SigmaVoice — encrypted secret store (ADR-007).
//
// Stores secrets (the OpenRouter API key) encrypted at rest via an injected
// Electron-`safeStorage`-shaped backend. Electron is NOT imported here so this
// module is unit-testable under `node --test` — main.ts injects `safeStorage`.
// When OS encryption is unavailable, degrades to base64 (clearly flagged).

import fs from 'node:fs';
import { atomicWriteFileSync } from './atomic-write.ts';

/** The subset of Electron's `safeStorage` we depend on. */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plaintext: string): Buffer;
  decryptString(ciphertext: Buffer): string;
}

export interface SecretStore {
  getSecret(name: string): string | null;
  setSecret(name: string, value: string): void;
  hasSecret(name: string): boolean;
  clearSecret(name: string): void;
  /** True when secrets are OS-encrypted; false when using the base64 fallback. */
  isEncrypted(): boolean;
}

// Stored value prefixes: 'enc:' = base64 of safeStorage ciphertext; 'b64:' = base64 plaintext.
export function createSecretStore(opts: { backend: SafeStorageLike; filePath: string }): SecretStore {
  const { backend, filePath } = opts;
  const encrypted = (() => { try { return backend.isEncryptionAvailable(); } catch { return false; } })();
  if (!encrypted) console.warn('[secret-store] OS encryption unavailable — secrets stored base64-encoded, NOT encrypted.');
  let data: Record<string, string> = {};

  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'string') data[k] = v;
      }
    }
  } catch { data = {}; }

  // Throws on an unrecoverable write failure so setSecret can surface it, rather
  // than reporting success while the secret never reached disk. (mode bits are
  // POSIX owner-only; ignored on Windows, where safeStorage→DPAPI is the real
  // protection.)
  function persist(): void {
    atomicWriteFileSync(filePath, JSON.stringify(data), { mode: 0o600, dirMode: 0o700 });
  }

  function encode(plaintext: string): string {
    if (encrypted) {
      // Encryption is available — never silently fall back to plaintext. Let a runtime
      // failure propagate so the caller can surface it instead of storing an unencrypted
      // secret while isEncrypted() reports true.
      return `enc:${backend.encryptString(plaintext).toString('base64')}`;
    }
    return `b64:${Buffer.from(plaintext, 'utf8').toString('base64')}`;
  }

  function decode(stored: string): string | null {
    try {
      if (stored.startsWith('enc:')) return backend.decryptString(Buffer.from(stored.slice(4), 'base64'));
      if (stored.startsWith('b64:')) return Buffer.from(stored.slice(4), 'base64').toString('utf8');
    } catch { return null; }
    return null;
  }

  return {
    getSecret: (name) => (name in data ? decode(data[name]) : null),
    setSecret: (name, value) => { data[name] = encode(value); persist(); },
    hasSecret: (name) => name in data && decode(data[name]) !== null,
    clearSecret: (name) => { if (name in data) { delete data[name]; try { persist(); } catch { /* best-effort: clearing is non-critical */ } } },
    isEncrypted: () => encrypted,
  };
}

// SigmaVoice — best-effort atomic file write (cross-platform, sync).
//
// Both the KV store and the encrypted secret store persist a whole JSON map per
// write. The naive "write tmp → rename over target" is atomic on POSIX but
// fragile on Windows: rename-over-an-existing-file transiently fails with
// EPERM/EACCES/EBUSY when the destination is briefly locked (Defender/AV,
// Search indexer, another handle). A shared fixed `.tmp` name also races when
// two writers hit the same target. This helper fixes both:
//   • UNIQUE temp name (pid + monotonic counter) — no cross-writer collision.
//   • RETRY the rename on transient lock errors, with a short backoff.
//   • LAST RESORT: a direct overwrite (often succeeds where rename-over fails on
//     Windows), then clean up the temp file.
// It THROWS if the data could not be persisted by any path — callers decide
// whether to propagate (secret store: surface to the user) or swallow (KV: must
// never disrupt the capture path).

import fs from 'node:fs';
import path from 'node:path';

let tmpCounter = 0;

export interface AtomicWriteOptions {
  /** File mode for the written file (POSIX; largely ignored on Windows). */
  mode?: number;
  /** Mode for the parent directory if it must be created (POSIX; ignored on Windows). */
  dirMode?: number;
  /** Rename retries on transient lock errors. Default 3. */
  retries?: number;
  /** Base backoff per retry in ms (grows linearly). Default 10. */
  backoffMs?: number;
}

// Windows-transient rename failures worth retrying (vs. e.g. ENOENT/EISDIR).
const TRANSIENT = new Set(['EPERM', 'EACCES', 'EBUSY']);

/** Synchronous sleep (this helper is sync to match the KV/secret-store contract). */
function sleepSync(ms: number): void {
  if (ms <= 0) return;
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    // SharedArrayBuffer/Atomics unavailable — skip the backoff, just retry.
  }
}

/**
 * Write `data` to `filePath` as atomically as the OS allows. Throws if the data
 * cannot be persisted (after retries + an overwrite fallback).
 */
export function atomicWriteFileSync(filePath: string, data: string, opts: AtomicWriteOptions = {}): void {
  const { mode, dirMode, retries = 3, backoffMs = 10 } = opts;
  fs.mkdirSync(path.dirname(filePath), { recursive: true, ...(dirMode != null ? { mode: dirMode } : {}) });

  const tmp = `${filePath}.${process.pid}.${tmpCounter++}.tmp`;
  fs.writeFileSync(tmp, data, { encoding: 'utf8', ...(mode != null ? { mode } : {}) });

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      fs.renameSync(tmp, filePath);
      return;
    } catch (err) {
      lastErr = err;
      const code = (err as NodeJS.ErrnoException)?.code ?? '';
      if (!TRANSIENT.has(code) || attempt === retries) break;
      sleepSync(backoffMs * (attempt + 1));
    }
  }

  // Rename kept failing — try a direct overwrite, then clean up the temp file.
  try {
    fs.writeFileSync(filePath, data, { encoding: 'utf8', ...(mode != null ? { mode } : {}) });
    try { fs.rmSync(tmp, { force: true }); } catch { /* best-effort cleanup */ }
    return;
  } catch (overwriteErr) {
    try { fs.rmSync(tmp, { force: true }); } catch { /* best-effort cleanup */ }
    throw overwriteErr ?? lastErr;
  }
}

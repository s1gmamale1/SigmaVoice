// SigmaVoice — floating-pill settings + IPC (extracted from main.ts).
//
// Pill state is persisted in KV (enabled DEFAULT ON; appearance; saved position)
// and driven by a small renderer<->main IPC surface. Kept out of main.ts so the
// orchestrator stays within the file-size budget and the pill concern is cohesive
// + unit-testable. NOTE: no value import of `electron` — `ipcMain` is injected so
// the pure helpers below can be imported under `node --test` without Electron.

import type { IpcMain } from 'electron';
import type { GlobalCaptureController } from '@sigmalink/voice-core';
import type { KvStore } from './kv-store';
import type { HudController } from './hud-window';

const KV_PILL_ENABLED = 'voice.pill.enabled';
const KV_PILL_APPEARANCE = 'voice.pill.appearance';
const KV_PILL_POS = 'voice.pill.pos';

/** Floating pill on? Default ON — only an explicit '0' disables it. */
export function isPillEnabled(kv: KvStore | null): boolean {
  return kv?.get(KV_PILL_ENABLED) !== '0';
}

/** Pill appearance: 'compact' (logo only) or 'full' (logo + wordmark, default). */
export function getPillAppearance(kv: KvStore | null): 'full' | 'compact' {
  return kv?.get(KV_PILL_APPEARANCE) === 'compact' ? 'compact' : 'full';
}

export function isFinitePoint(point: unknown): point is { x: number; y: number } {
  return (
    point != null &&
    typeof (point as { x?: unknown }).x === 'number' &&
    typeof (point as { y?: unknown }).y === 'number' &&
    Number.isFinite((point as { x: number }).x) &&
    Number.isFinite((point as { y: number }).y)
  );
}

/** Saved pill top-left, or null for the default bottom-center. */
export function getSavedPillPosition(kv: KvStore | null): { x: number; y: number } | null {
  const raw = kv?.get(KV_PILL_POS);
  if (!raw) return null;
  try {
    const p: unknown = JSON.parse(raw);
    if (isFinitePoint(p)) {
      return { x: p.x, y: p.y };
    }
  } catch { /* corrupt → default */ }
  return null;
}

/** HUD-window deps for the pill (saved position + appearance), bound to a KV. */
export function pillHudDeps(kv: KvStore | null): {
  getSavedPosition: () => { x: number; y: number } | null;
  getAppearance: () => 'full' | 'compact';
} {
  return {
    getSavedPosition: () => getSavedPillPosition(kv),
    getAppearance: () => getPillAppearance(kv),
  };
}

/**
 * Wire the pill IPC. `ipcMain` is injected (keeps this module electron-free for
 * tests); the getters are late-bound so they read the live main-process globals.
 */
export function registerPillIpc(
  ipcMain: IpcMain,
  deps: {
    kv: () => KvStore | null;
    ctrl: () => GlobalCaptureController | null;
    hud: () => HudController | null;
  },
): void {
  ipcMain.handle('bv:getPillSettings', () => ({
    enabled: isPillEnabled(deps.kv()),
    appearance: getPillAppearance(deps.kv()),
  }));
  ipcMain.handle('bv:setPillEnabled', (_e, enabled: boolean) => {
    deps.kv()?.set(KV_PILL_ENABLED, enabled ? '1' : '0');
    deps.hud()?.setPersistent(!!enabled);
  });
  ipcMain.handle('bv:setPillAppearance', (_e, appearance: string) => {
    deps.kv()?.set(KV_PILL_APPEARANCE, appearance === 'compact' ? 'compact' : 'full');
    deps.hud()?.refreshAppearance();
  });
  // Renderer→main from the pill itself (one-way sends, validated here).
  ipcMain.on('hud:toggle', () => {
    const ctrl = deps.ctrl();
    const st = ctrl?.getStatus();
    if (!ctrl || !st) return;
    if (st.state === 'recording') void ctrl.stopAndTranscribe();
    // Start only when idle AND capture is ENABLED — the pill must not be an
    // ungated third entry point (mirrors the tray + hotkey gating).
    else if (st.state === 'idle' && st.enabled) void ctrl.startRecording();
    // transcribing → ignore (don't start a new capture mid-transcribe)
  });
  ipcMain.on('hud:move', (_e, pos: unknown) => {
    if (isFinitePoint(pos)) deps.hud()?.moveTo(pos.x, pos.y);
  });
  ipcMain.on('hud:move-end', () => {
    // Persist the ACTUAL (clamped) window position — moveTo keeps the pill on
    // screen, so reading the real bounds avoids saving an off-screen drag target.
    const p = deps.hud()?.getPosition();
    if (p) deps.kv()?.set(KV_PILL_POS, JSON.stringify({ x: Math.round(p.x), y: Math.round(p.y) }));
  });
}

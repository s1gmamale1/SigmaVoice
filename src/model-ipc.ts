// SigmaVoice — Whisper model-management IPC (extracted from main.ts).
//
// Catalog listing (with per-model downloaded/downloading/active status), download
// with streamed progress, and abort. Behaviour is unchanged from the inline
// main.ts version — pulled into its own module so the orchestrator stays within
// the file-size budget. `ipcMain` + the emit target are injected.

import type { IpcMain } from 'electron';
import {
  MODEL_CATALOG,
  isModelDownloaded,
  isDownloading,
  downloadModel,
  abortDownload,
  type DownloadProgress,
} from '@sigmalink/voice-core';
import { shouldStartModelDownload } from './model-download-gate';
import { toModelListItem } from './model-list-status';

export function registerModelIpc(
  ipcMain: IpcMain,
  deps: {
    getModelsDir: () => string;
    getActiveModelId: () => string | undefined;
    /** Forward a renderer event (e.g. download progress) to the settings window. */
    send: (channel: string, payload: unknown) => void;
  },
): void {
  // List the catalog with per-model status (downloaded / downloading / active).
  ipcMain.handle('bv:listModels', () => {
    const modelsDir = deps.getModelsDir();
    const activeId = deps.getActiveModelId();
    return MODEL_CATALOG.map((m) =>
      toModelListItem(
        m,
        activeId,
        isModelDownloaded(m, modelsDir),
        isDownloading(m.id),
      ),
    );
  });

  // Download a model; streams progress over 'voice:model-download', resolves when
  // complete (or rejects → caught here and surfaced as a terminal state).
  ipcMain.handle('bv:downloadModel', async (_e, id: string) => {
    const entry = MODEL_CATALOG.find((m) => m.id === id);
    if (!entry) return { ok: false, error: `Unknown model: ${id}` };
    const gate = shouldStartModelDownload(id, isDownloading(id));
    if (!gate.ok) return gate;
    // The renderer understands an optional `aborted` terminal flag — a user cancel
    // is a clean stop, not a failure — so the local emit widens the payload type.
    const emit = (p: DownloadProgress & { aborted?: boolean }): void =>
      deps.send('voice:model-download', p);
    try {
      await downloadModel(entry, deps.getModelsDir(), emit);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // A user-initiated cancel rejects with an "abort" message → surface it as a
      // clean terminal state (row resets, no error toast), not a download failure.
      if (/abort/i.test(message)) {
        emit({ modelId: id, bytesDone: 0, bytesTotal: 0, fraction: 0, done: true, aborted: true });
        return { ok: true, aborted: true };
      }
      emit({ modelId: id, bytesDone: 0, bytesTotal: 0, fraction: 0, done: true, error: message });
      return { ok: false, error: message };
    }
  });

  // Abort an in-flight download.
  ipcMain.handle('bv:abortDownload', (_e, id: string) => {
    try { abortDownload(id); } catch { /* ignore */ }
  });
}

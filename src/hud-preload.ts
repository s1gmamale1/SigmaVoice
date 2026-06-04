// SigmaVoice — HUD overlay preload.
//
// Isolated bridge for the recording-HUD / floating-pill renderer (hud.html).
// State flows main→renderer over `hud:state`; the floating pill also talks back
// (click-to-dictate + drag-to-move) over a few narrow main-bound channels.

import { contextBridge, ipcRenderer } from 'electron';

type HudStatePayload = {
  state: 'idle' | 'recording' | 'transcribing' | 'error' | 'no-input' | 'done';
  appearance?: 'full' | 'compact';
};

contextBridge.exposeInMainWorld('sigmaHud', {
  onState: (cb: (payload: HudStatePayload) => void) => {
    ipcRenderer.on('hud:state', (_e, payload) => cb(payload));
  },
  /** Click the pill → toggle dictation (start if idle, stop+transcribe if recording). */
  toggle: () => ipcRenderer.send('hud:toggle'),
  /** Live drag → move the window's top-left to absolute screen coords. */
  move: (x: number, y: number) => ipcRenderer.send('hud:move', { x, y }),
  /** Drag released → persist the final position. */
  moveEnd: (x: number, y: number) => ipcRenderer.send('hud:move-end', { x, y }),
});

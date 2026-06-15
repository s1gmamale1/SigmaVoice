// SigmaVoice — main process
//
// Standalone system-wide dictation app powered by @sigmalink/voice-core.
//
// Flow:
//   1. App starts, Tray icon appears.
//   2. User presses hotkey (default: Cmd+Alt+Space on mac, Ctrl+Alt+Space on win/linux).
//   3. Global capture starts (AVAudioEngine / SAPI5 → whisper.cpp → clipboard + AX-paste).
//   4. A minimal settings window lets the user change model / hotkey / output mode.
//
// No workspace/pane/session/swarm logic — this is pure dictation.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  safeStorage,
  Tray,
} from 'electron';
import {
  buildGlobalCaptureController,
  type GlobalCaptureController,
  getWhisperEngine,
  getModelById,
  getDefaultModel,
  getDownloadedModelPath,
  WHISPER_SAMPLE_RATE,
} from '@sigmalink/voice-core';
import { isValidAccelerator, isValidPushToTalkBinding } from './accelerator';
import { formatAccelerator } from './keycaps';
import { createFileKv, type KvStore } from './kv-store';
import { getDictionary, setDictionary, getStatsSummary } from './settings-data';
import { createHudWindow, type HudController } from './hud-window';
import { createHotkeyManager, resolveModifierKeys, type HotkeyManager } from './hotkey-manager';
import { isPillEnabled, pillHudDeps, registerPillIpc } from './pill';
import { registerModelIpc } from './model-ipc';
import { createSecretStore, type SecretStore, type SafeStorageLike } from './secret-store';
import { registerLlmIpc } from './llm-ipc';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// KV — file-backed store under <userData>/sigmavoice-kv.json.
// Persists the dictionary + usage stats across restarts (v0.2 used an
// in-memory Map that lost them on quit). Created in whenReady() once the
// userData path is available.
// ---------------------------------------------------------------------------

let kv: KvStore | null = null;
let secrets: SecretStore | null = null;

// ---------------------------------------------------------------------------
// Models directory — store under <userData>/voice-models/
// ---------------------------------------------------------------------------

function getModelsDir(): string {
  return path.join(app.getPath('userData'), 'voice-models');
}

// Floating-pill settings + click/drag IPC live in src/pill.ts; Whisper
// model-management IPC in src/model-ipc.ts (kept out of this orchestrator).

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------

let tray: Tray | null = null;
let settingsWindow: BrowserWindow | null = null;
let captureCtrl: GlobalCaptureController | null = null;

// Focus-preserving recording HUD overlay. Assigned in whenReady() to the
// controller returned by createHudWindow() (src/hud-window.ts).
let hud: HudController | null = null;
let hotkeyMgr: HotkeyManager | null = null;
// True when the global key-UP listener could not attach (e.g. Input Monitoring
// not granted). In push-to-talk mode this means hold-to-talk is unavailable and
// the hotkey degrades to tap-to-toggle — we tell the user when it matters.
let pttListenerUnavailable = false;
// True once we've warned the user about degraded push-to-talk — the warning is
// shown at most once per session (it can be triggered from multiple paths).
let degradedWarned = false;

/** Notify the user that push-to-talk degraded to tap-to-toggle. */
function warnPushToTalkDegraded(): void {
  if (degradedWarned) return;
  degradedWarned = true;
  // Input Monitoring is a macOS-only permission. On Windows there is no such
  // permission — the global key listener (node-global-key-listener) failing to
  // attach has a different cause — so give platform-appropriate guidance.
  const body = process.platform === 'darwin'
    ? 'Hold-to-talk needs Input Monitoring (System Settings → Privacy & ' +
      'Security → Input Monitoring). Until granted, the hotkey works as ' +
      'tap-to-toggle: press once to start, press again to stop.'
    : 'Hold-to-talk couldn’t start the global key listener (security software ' +
      'may be blocking it), so the hotkey works as tap-to-toggle: press once ' +
      'to start, press again to stop.';
  try {
    if (Notification.isSupported()) {
      new Notification({ title: 'SigmaVoice — push-to-talk limited', body }).show();
    }
  } catch {
    /* notifications are best-effort */
  }
  // Also surface in the settings window if it's open.
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('voice:global-capture-toast', {
      message: body,
      level: 'warn',
    });
  }
}

/**
 * The engine binds every hotkey via Electron `globalShortcut`, which CANNOT
 * register a bare-modifier accelerator and emits a "Could not register hotkey …"
 * warn toast when it fails. For a bare-modifier push-to-talk binding that failure
 * is expected and harmless — our hotkey-manager owns that trigger directly — so
 * we swallow that one toast app-shell-side instead of telling the user the
 * shortcut is broken when it actually works. (Clean fix = an engine flag to skip
 * globalShortcut for app-owned bindings; matching the message keeps this
 * app-shell-only. Fails open: if the engine wording changes the toast reappears.)
 */
function isExpectedBareModifierRegisterToast(payload: unknown): boolean {
  const msg = (payload as { message?: string } | null)?.message ?? '';
  const m = /could not register hotkey (.+?)\./i.exec(msg);
  return m != null && resolveModifierKeys(m[1]) !== null;
}

/** Drive the HUD overlay from capture-state changes. */
function syncHud(payload: unknown): void {
  if (!hud) return;
  const state = (payload as { state?: string } | null)?.state;
  if (state === 'recording') hud.showRecording();
  else if (state === 'transcribing') hud.showTranscribing();
  else hud.hide(); // idle / routing → dismiss
}

// ---------------------------------------------------------------------------
// Tray menu
// ---------------------------------------------------------------------------

function buildTrayMenu(): Electron.Menu {
  const ctrl = captureCtrl;
  const status = ctrl?.getStatus();
  const isEnabled   = status?.enabled ?? false;
  const isRecording = status?.state === 'recording';

  return Menu.buildFromTemplate([
    {
      label: isRecording
        ? 'Stop recording'
        : isEnabled
          ? `Start recording (${formatAccelerator(status?.hotkey ?? '')})`
          : 'Global capture (disabled)',
      enabled: isEnabled,
      click: () => {
        if (!ctrl) return;
        if (isRecording) void ctrl.stopAndTranscribe();
        else void ctrl.startRecording();
      },
    },
    { type: 'separator' },
    {
      label: isEnabled ? 'Disable global capture' : 'Enable global capture',
      click: () => ctrl?.setEnabled(!isEnabled),
    },
    {
      label: 'Settings…',
      click: () => openSettingsWindow(),
    },
    { type: 'separator' },
    {
      label: 'Quit SigmaVoice',
      click: () => app.quit(),
    },
  ]);
}

function updateTray(): void {
  if (!tray) return;
  tray.setContextMenu(buildTrayMenu());

  const status = captureCtrl?.getStatus();
  const isRecording = status?.state === 'recording';
  tray.setToolTip(
    isRecording ? 'SigmaVoice — Recording…' : 'SigmaVoice',
  );
}

function initTray(): void {
  // Idempotent: the boot-failure catch path also calls initTray(), and a second
  // `new Tray()` would leak the first (a lingering macOS menu-bar icon).
  if (tray && !tray.isDestroyed()) return;
  // Load the bundled tray PNG; fall back to an empty image if missing/unreadable.
  const iconPath = path.join(__dirname, '..', 'renderer', 'assets', 'tray-icon.png');
  let icon = nativeImage.createFromPath(iconPath);
  icon = icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 18, height: 18 });
  tray = new Tray(icon);
  tray.setToolTip('SigmaVoice');
  tray.setContextMenu(buildTrayMenu());
}

// ---------------------------------------------------------------------------
// Settings window
// ---------------------------------------------------------------------------

function openSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 720,
    height: 560,
    minWidth: 680,
    minHeight: 520,
    title: 'SigmaVoice Settings',
    show: false,
    // macOS sidebar app chrome: inset traffic lights over a draggable sidebar
    // header, real window vibrancy behind a transparent body, no opaque backing
    // so the vibrancy material shows through. On win/linux these are ignored or
    // degrade to a plain window — the CSS provides solid surfaces there.
    titleBarStyle: 'hiddenInset',
    vibrancy: 'sidebar',
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Defense-in-depth: the preload (src/preload.ts) imports only
      // contextBridge/ipcRenderer from 'electron' and uses no other Node APIs,
      // so it loads cleanly under sandbox. sandbox:true runs the renderer in a
      // locked-down process with no Node primitives.
      sandbox: true,
      // The build emits preload.cjs (CJS) into sigma-dist/ — NOT preload.js.
      // v0.2 referenced 'preload.js' here, so window.bridgeVoice never loaded.
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  // Defense-in-depth navigation hardening: this window only ever renders the
  // bundled file:// settings page. Deny window.open and block any in-page
  // navigation away from it.
  settingsWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  settingsWindow.webContents.on('will-navigate', (e) => e.preventDefault());

  settingsWindow.loadFile(path.join(__dirname, '..', 'renderer', 'settings.html'));
  settingsWindow.once('ready-to-show', () => {
    settingsWindow?.show();
    settingsWindow?.focus();
    if (process.platform === 'darwin') app.focus({ steal: true });
  });
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

// ---------------------------------------------------------------------------
// IPC handlers (settings window ↔ main)
// ---------------------------------------------------------------------------

function registerIpc(): void {
  // Get current capture status
  ipcMain.handle('bv:getStatus', () => captureCtrl?.getStatus() ?? null);

  // Enable / disable
  ipcMain.handle('bv:setEnabled', (_e, enabled: boolean) => {
    captureCtrl?.setEnabled(enabled);
  });

  // Change hotkey — validate first so the UI can report an unregisterable
  // accelerator instead of us silently dropping it.
  ipcMain.handle('bv:setHotkey', (_e, hotkey: string): { ok: boolean; error?: string } => {
    const hk = typeof hotkey === 'string' ? hotkey.trim() : '';
    // Validate against the CURRENT mode: push-to-talk accepts a bare-modifier
    // combo (hold ⌘⇧ to talk); toggle needs a registerable modifier+key accelerator.
    const mode = captureCtrl?.getStatus().mode ?? 'toggle';
    const valid = mode === 'push-to-talk' ? isValidPushToTalkBinding(hk) : isValidAccelerator(hk);
    if (!valid) {
      return {
        ok: false,
        error:
          mode === 'push-to-talk'
            ? 'Invalid shortcut — use a modifier combo (e.g. ⌘⇧) or a modifier plus a key'
            : 'Invalid shortcut — include a modifier (⌘/⌥/⌃/⇧) plus a key',
      };
    }
    if (!captureCtrl) return { ok: false, error: 'Capture unavailable — reopen SigmaVoice' };
    captureCtrl.setHotkey(hk);
    return { ok: true };
  });

  // Change capture mode (toggle vs push-to-talk)
  ipcMain.handle('bv:setMode', (_e, mode: string) => {
    if (mode === 'toggle' || mode === 'push-to-talk') {
      captureCtrl?.setMode(mode);
      // Switching INTO push-to-talk while the key-UP listener never attached →
      // warn that hold-to-talk won't work until Input Monitoring is granted.
      if (mode === 'push-to-talk' && pttListenerUnavailable) warnPushToTalkDegraded();
    }
  });

  // Change active model
  ipcMain.handle('bv:setModelId', (_e, id: string) => {
    captureCtrl?.setModelId(id);
    prewarmModel();
  });

  // Manual trigger (for settings UI test button)
  ipcMain.handle('bv:startRecording', () => captureCtrl?.startRecording());
  ipcMain.handle('bv:stopAndTranscribe', () => captureCtrl?.stopAndTranscribe());

  // Dictionary + verbal macros (persisted in KV 'voice.dictionary'; consumed by
  // voice-core normalizeTranscript on every transcription).
  ipcMain.handle('bv:getDictionary', () => (kv ? getDictionary(kv) : []));
  ipcMain.handle('bv:setDictionary', (_e, entries: unknown) =>
    kv ? setDictionary(kv, entries) : [],
  );

  // Usage stats summary (aggregated from KV 'voice.stats').
  ipcMain.handle('bv:getStats', () =>
    kv ? getStatsSummary(kv) : { totalWords: 0, recordings: 0, avgWpm: 0, recent: [] },
  );

  // Whisper model management (list / download / abort) — src/model-ipc.ts.
  registerModelIpc(ipcMain, {
    getModelsDir,
    getActiveModelId: () => captureCtrl?.getStatus().modelId,
    send: (channel, payload) => {
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send(channel, payload);
      }
    },
  });

  // Cloud/LLM IPC (ADR-007): OpenRouter key + remote-STT + transform config.
  registerLlmIpc(ipcMain, { kv: () => kv, secrets: () => secrets });

  // Floating pill (FE-2): settings + click/drag IPC — src/pill.ts.
  registerPillIpc(ipcMain, {
    kv: () => kv,
    ctrl: () => captureCtrl,
    hud: () => hud,
  });
}

// ---------------------------------------------------------------------------
// Whisper prewarm — run a throwaway transcription on silence so the first real
// dictation isn't slowed by lazy model load / engine init. Best-effort: any
// failure (no model downloaded yet, engine unavailable) is swallowed.
// ---------------------------------------------------------------------------

let lastWarmedModelPath: string | null = null;

function prewarmModel(): void {
  try {
    const st = captureCtrl?.getStatus();
    // Don't fire a throwaway transcribe while a real capture is mid-flight — it
    // would contend with the active session. Only prewarm when idle.
    if (st && st.state !== 'idle') return;
    // Don't prewarm the local engine when a remote STT backend is active.
    if (kv?.get('voice.transcriptionMode') === 'openai-whisper-api') return;
    const model = (st?.modelId ? getModelById(st.modelId) : null) ?? getDefaultModel();
    const modelPath = getDownloadedModelPath(model, getModelsDir());
    if (!modelPath || modelPath === lastWarmedModelPath) return; // nothing to do / already warm
    const eng = getWhisperEngine();
    if (!eng) return;
    lastWarmedModelPath = modelPath;
    void eng
      .transcribe(new Float32Array(WHISPER_SAMPLE_RATE), modelPath, { language: 'en', threads: 4 })
      .catch(() => { lastWarmedModelPath = null; }); // let a failed warm be retried
  } catch {
    /* best-effort */
  }
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

// Single-instance lock — a second launch focuses the existing instance's
// settings window instead of starting a duplicate tray + global key listener
// (which would double-register the hotkey and fight over the mic).
const isPrimaryInstance = app.requestSingleInstanceLock();
if (!isPrimaryInstance) {
  app.quit();
} else {
  app.on('second-instance', () => openSettingsWindow());
}

app.whenReady().then(() => {
  if (!isPrimaryInstance) return; // secondary instance is quitting

  try {
    // macOS: hide from Dock (system-tray-only app)
    if (process.platform === 'darwin') {
      app.dock?.hide();
    }

    // Persistent KV — created now that userData is resolvable.
    const store = createFileKv(path.join(app.getPath('userData'), 'sigmavoice-kv.json'));
    kv = store;

    // ADR-007 — encrypted secret store for the OpenRouter API key. Electron's
    // safeStorage satisfies SafeStorageLike (isEncryptionAvailable/encryptString/decryptString).
    secrets = createSecretStore({
      backend: safeStorage as unknown as SafeStorageLike,
      filePath: path.join(app.getPath('userData'), 'sigmavoice-secrets.json'),
    });

    captureCtrl = buildGlobalCaptureController({
      emit: (event, payload) => {
        // Swallow the engine's "could not register hotkey" warn for a
        // bare-modifier push-to-talk binding — our key listener owns it, so the
        // globalShortcut failure is expected and the warning would mislead.
        if (
          event === 'voice:global-capture-toast' &&
          isExpectedBareModifierRegisterToast(payload)
        ) {
          return;
        }
        // Forward to settings window if open
        if (settingsWindow && !settingsWindow.isDestroyed()) {
          settingsWindow.webContents.send(event, payload);
        }
        // Rebuild tray menu + drive the recording HUD on state changes
        if (event === 'voice:global-capture-state') {
          updateTray();
          syncHud(payload);
        }
      },
      kv: store,
      getModelsDir,
      clipboard: {
        writeText: (text: string) => clipboard.writeText(text),
      },
      // ADR-007 — OpenRouter cleanup reads the key from the ENCRYPTED secret store.
      transformDeps: { getApiKey: () => secrets?.getSecret('provider.openrouter.apiKey') ?? null },
    });

    // Focus-preserving recording HUD / floating pill overlay.
    hud = createHudWindow({
      preloadPath: path.join(__dirname, 'hud-preload.cjs'),
      htmlPath: path.join(__dirname, '..', 'renderer', 'hud.html'),
      ...pillHudDeps(store),
    });
    // Floating pill (FE-2): when enabled (default ON) keep a resting idle pill on
    // screen between dictations instead of only flashing during capture.
    if (isPillEnabled(store)) hud.setPersistent(true);

    // True push-to-talk: supply the key-UP edge Electron's globalShortcut lacks.
    // Key-DOWN/start stays on the controller's globalShortcut; on release in
    // push-to-talk mode we stop+transcribe. (Toggle mode is fully owned by the
    // controller, so this is a no-op there.)
    hotkeyMgr = createHotkeyManager({
      getMode: () => captureCtrl?.getStatus().mode ?? 'toggle',
      getHotkey: () => captureCtrl?.getStatus().hotkey ?? '',
      onPushToTalkPress: () => { void captureCtrl?.startRecording(); },
      onPushToTalkRelease: () => { void captureCtrl?.stopAndTranscribe(); },
      onListenerUnavailable: () => {
        pttListenerUnavailable = true;
        // Only worth telling the user if they're actually in push-to-talk mode.
        if (captureCtrl?.getStatus().mode === 'push-to-talk') warnPushToTalkDegraded();
      },
    });
    hotkeyMgr.start();

    initTray();
    registerIpc();

    // Warm the whisper engine on silence so the first dictation isn't slow.
    prewarmModel();
  } catch (err) {
    // A throw during boot (e.g. buildGlobalCaptureController) must not leave a
    // silent inert process — surface it and still give the user a Quit-able tray.
    console.error(err);
    try {
      if (Notification.isSupported()) {
        new Notification({
          title: 'SigmaVoice failed to start',
          body: String((err as Error)?.message ?? err),
        }).show();
      }
    } catch {
      /* notifications are best-effort */
    }
    // buildTrayMenu already null-guards captureCtrl, so a tray is safe here.
    try { initTray(); } catch { /* ignore */ }
  }
});

// Keep app alive when all windows are closed (tray app)
app.on('window-all-closed', () => {
  // Intentionally do NOT quit — the tray keeps the process alive.
  // User must choose Quit from the tray menu.
});

let quitting = false;
app.on('before-quit', () => {
  if (quitting) return; // idempotent
  quitting = true;
  // Guarded teardown. NOTE (W-SV2): the voice natives release an N-API
  // ThreadSafeFunction during dispose that can SIGABRT at quit
  // (napi_release_threadsafe_function → uv_mutex_lock) — a quit-time teardown
  // race, app already exiting. Proper fix is in tsfn_bridge release semantics.
  try { hotkeyMgr?.stop(); } catch { /* ignore */ }
  try { hud?.destroy(); } catch { /* ignore */ }
  try { captureCtrl?.dispose(); } catch { /* ignore */ }
});

// macOS: re-activate on Dock click (rare since Dock is hidden, but safe)
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    openSettingsWindow();
  }
});

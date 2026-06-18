export function getRecordButtonState(status) {
  const state = status?.state ?? 'idle';
  const enabled = status?.enabled !== false;
  if (!enabled) {
    return {
      className: 'record-btn idle',
      label: 'Global capture disabled',
      ariaLabel: 'Global capture disabled',
      disabled: true,
      action: 'none',
    };
  }
  if (state === 'recording') {
    return {
      className: 'record-btn recording',
      label: 'Stop & transcribe',
      ariaLabel: 'Stop & transcribe',
      disabled: false,
      action: 'stop',
    };
  }
  if (state !== 'idle') {
    return {
      className: 'record-btn busy',
      label: 'Transcribing...',
      ariaLabel: 'Transcribing...',
      disabled: true,
      action: 'none',
    };
  }
  return {
    className: 'record-btn idle',
    label: 'Start recording',
    ariaLabel: 'Start recording',
    disabled: false,
    action: 'start',
  };
}

export type CaptureStatusLike = {
  enabled?: boolean;
  state?: 'idle' | 'recording' | 'transcribing' | 'routing' | 'error' | string;
} | null | undefined;

export type RecordButtonAction = 'start' | 'stop' | 'none';

export type RecordButtonState = {
  label: string;
  className: string;
  disabled: boolean;
  action: RecordButtonAction;
};

export function getRecordButtonState(status: CaptureStatusLike): RecordButtonState;

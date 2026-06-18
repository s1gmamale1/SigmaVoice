export interface CaptureStartStatus {
  enabled?: boolean;
  state?: string;
}

export function canStartManualCapture(status: CaptureStartStatus | null | undefined): boolean {
  return status?.enabled === true && status.state === 'idle';
}

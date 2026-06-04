// SigmaVoice — floating-pill geometry (pure, electron-free so it's unit-testable).

export interface Rect { x: number; y: number; width: number; height: number; }
export interface Point { x: number; y: number; }
export interface Size { width: number; height: number; }

/**
 * Clamp a desired top-left so a window of `size` fits fully inside `workArea`.
 * A saved pill position can land off-screen (a display was disconnected, or the
 * work area shrank) — this pulls it back into view instead of stranding the pill
 * outside every display. When the window is larger than the work area it clamps
 * to the work-area origin.
 */
export function clampToWorkArea(pos: Point, size: Size, workArea: Rect): Point {
  const maxX = workArea.x + workArea.width - size.width;
  const maxY = workArea.y + workArea.height - size.height;
  const x = Math.min(Math.max(pos.x, workArea.x), Math.max(workArea.x, maxX));
  const y = Math.min(Math.max(pos.y, workArea.y), Math.max(workArea.y, maxY));
  return { x: Math.round(x), y: Math.round(y) };
}

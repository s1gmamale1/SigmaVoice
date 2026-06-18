export function captureHint(mode: 'toggle' | 'push-to-talk', platform?: NodeJS.Platform): string;

export function modsFromEvent(
  event: { metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean },
  platform?: NodeJS.Platform,
): string[];

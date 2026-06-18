import type { BrowserWindowConstructorOptions } from 'electron';

export type SettingsWindowChrome = Pick<
  BrowserWindowConstructorOptions,
  'titleBarStyle' | 'vibrancy' | 'transparent' | 'backgroundColor'
> & { backgroundColor: string };

export function platformWindowChrome(platform: NodeJS.Platform): SettingsWindowChrome {
  if (platform === 'darwin') {
    return {
      titleBarStyle: 'hiddenInset',
      vibrancy: 'sidebar',
      transparent: true,
      backgroundColor: '#00000000',
    };
  }
  return { backgroundColor: '#101014' };
}

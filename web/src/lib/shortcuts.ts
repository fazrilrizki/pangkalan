export type ShortcutAction =
  | { type: 'new' }
  | { type: 'close' }
  | { type: 'cycle'; step: 1 | -1 }
  | { type: 'jump'; index: number };

/**
 * App shortcuts use Ctrl+Alt so they never collide with the browser (Ctrl+Shift+T/W and
 * Ctrl+Tab are reserved by Chrome) or with keys the CLIs themselves use (Ctrl+C, Alt+…).
 */
export function matchShortcut(
  e: Pick<KeyboardEvent, 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey' | 'code'>,
): ShortcutAction | null {
  if (!e.ctrlKey || !e.altKey || e.shiftKey || e.metaKey) return null;
  switch (e.code) {
    case 'KeyT':
      return { type: 'new' };
    case 'KeyW':
      return { type: 'close' };
    case 'BracketRight':
      return { type: 'cycle', step: 1 };
    case 'BracketLeft':
      return { type: 'cycle', step: -1 };
  }
  const digit = /^Digit([1-9])$/.exec(e.code);
  return digit ? { type: 'jump', index: Number(digit[1]) - 1 } : null;
}

export const SHORTCUT_HELP: [string, string][] = [
  ['Ctrl+Alt+T', 'Sesi baru (project & CLI sama)'],
  ['Ctrl+Alt+W', 'Tutup tab aktif'],
  ['Ctrl+Alt+] / [', 'Tab berikut / sebelumnya'],
  ['Ctrl+Alt+1…9', 'Lompat ke tab'],
];

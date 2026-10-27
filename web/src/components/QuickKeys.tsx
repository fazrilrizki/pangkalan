/** Keys that are painful to type on a phone keyboard, sent straight to the PTY. */
const KEYS: ReadonlyArray<{ label: string; aria: string; data: string }> = [
  { label: 'y', aria: 'Kirim y lalu Enter', data: 'y\r' },
  { label: 'n', aria: 'Kirim n lalu Enter', data: 'n\r' },
  { label: 'Enter', aria: 'Enter', data: '\r' },
  { label: 'Esc', aria: 'Escape', data: '\x1b' },
  { label: '↑', aria: 'Panah atas', data: '\x1b[A' },
  { label: '↓', aria: 'Panah bawah', data: '\x1b[B' },
  { label: 'Tab', aria: 'Tab', data: '\t' },
  { label: '^C', aria: 'Ctrl+C', data: '\x03' },
];

export function QuickKeys({ onKey }: { onKey: (data: string) => void }) {
  return (
    <div
      role="toolbar"
      aria-label="Tombol cepat"
      className="-mx-1 flex shrink-0 gap-1 overflow-x-auto border-t border-line pt-2 md:hidden"
    >
      {KEYS.map((key) => (
        <button
          key={key.label}
          type="button"
          aria-label={key.aria}
          className="min-h-11 min-w-11 shrink-0 rounded-md border border-line-strong bg-panel px-3 font-mono text-sm text-fg active:bg-selected"
          // Keep focus (and the phone keyboard) on the terminal.
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => onKey(key.data)}
        >
          {key.label}
        </button>
      ))}
    </div>
  );
}

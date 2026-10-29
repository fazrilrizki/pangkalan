import { create } from 'zustand';

const KEY = 'integrasi.preview';
export const MIN_PREVIEW_WIDTH = 0.2;
export const MAX_PREVIEW_WIDTH = 0.8;

export const PREVIEW_DEVICES = {
  desktop: { label: 'Desktop', width: null },
  tablet: { label: 'Tablet', width: 820 },
  phone: { label: 'HP', width: 390 },
} as const;
export type PreviewDevice = keyof typeof PREVIEW_DEVICES;

interface Saved {
  open: boolean;
  device: PreviewDevice;
  /** Share of the workspace width taken by the preview pane. */
  width: number;
}

const clampWidth = (width: number) =>
  Math.min(MAX_PREVIEW_WIDTH, Math.max(MIN_PREVIEW_WIDTH, width));

function recall(): Saved {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Saved>;
    return {
      open: saved.open === true,
      device: saved.device && saved.device in PREVIEW_DEVICES ? saved.device : 'desktop',
      width: typeof saved.width === 'number' ? clampWidth(saved.width) : 0.5,
    };
  } catch {
    return { open: false, device: 'desktop', width: 0.5 };
  }
}

function remember({ open, device, width }: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ open, device, width }));
  } catch {
    // per-viewer convenience only
  }
}

interface PreviewState extends Saved {
  toggle(): void;
  setOpen(open: boolean): void;
  setWidth(width: number): void;
  setDevice(device: PreviewDevice): void;
}

export const usePreviewStore = create<PreviewState>()((set, get) => ({
  ...recall(),
  toggle() {
    get().setOpen(!get().open);
  },
  setOpen(open) {
    set({ open });
    remember(get());
  },
  setWidth(width) {
    set({ width: clampWidth(width) });
    remember(get());
  },
  setDevice(device) {
    set({ device });
    remember(get());
  },
}));

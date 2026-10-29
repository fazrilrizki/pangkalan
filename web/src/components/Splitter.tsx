import type { RefObject } from 'react';
import { useState } from 'react';
import { MAX_PREVIEW_WIDTH, MIN_PREVIEW_WIDTH, usePreviewStore } from '../stores/preview-store';

const KEY_STEP = 0.05;

/**
 * Vertical divider between the terminal and the preview. Drag it, or focus it and use the
 * arrow keys; the width is the preview's share of `container`.
 */
export function Splitter({ container }: { container: RefObject<HTMLElement | null> }) {
  const width = usePreviewStore((s) => s.width);
  const { setWidth } = usePreviewStore.getState();
  const [dragging, setDragging] = useState(false);

  function widthAt(clientX: number) {
    const rect = container.current?.getBoundingClientRect();
    return rect ? (rect.right - clientX) / rect.width : width;
  }

  function stop() {
    setDragging(false);
    delete document.documentElement.dataset.resizing;
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Ubah lebar preview"
      aria-valuemin={Math.round(MIN_PREVIEW_WIDTH * 100)}
      aria-valuemax={Math.round(MAX_PREVIEW_WIDTH * 100)}
      aria-valuenow={Math.round(width * 100)}
      tabIndex={0}
      className="group relative z-10 -mx-1 w-2 shrink-0 cursor-col-resize touch-none focus-visible:outline-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        document.documentElement.dataset.resizing = '';
      }}
      onPointerMove={(e) => {
        if (dragging) setWidth(widthAt(e.clientX));
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onDoubleClick={() => setWidth(0.5)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') setWidth(width + KEY_STEP);
        else if (e.key === 'ArrowRight') setWidth(width - KEY_STEP);
        else if (e.key === 'Home') setWidth(MAX_PREVIEW_WIDTH);
        else if (e.key === 'End') setWidth(MIN_PREVIEW_WIDTH);
        else return;
        e.preventDefault();
      }}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-1/2 -translate-x-1/2 transition-[width,background-color] ${
          dragging
            ? 'w-0.5 bg-accent'
            : 'w-px bg-line group-hover:w-0.5 group-hover:bg-accent/60 group-focus-visible:w-0.5 group-focus-visible:bg-accent'
        }`}
      />
    </div>
  );
}

import { useEffect, useRef } from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Native <dialog> gives us focus trapping and Esc-to-close without window.confirm. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal?.();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(420px,calc(100vw-32px))] rounded-xl border border-white/10 bg-panel p-0 text-fg shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="p-5">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted">{message}</p>
      </div>
      <div className="flex justify-end gap-2 border-t border-white/5 bg-black/20 px-5 py-3">
        <button className="btn-ghost" onClick={onCancel} autoFocus>
          Batal
        </button>
        <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

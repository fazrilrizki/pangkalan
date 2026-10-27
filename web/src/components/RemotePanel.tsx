import { useEffect, useRef, useState } from 'react';
import type { RemoteStatus } from '@integrasi/shared';
import { useRemoteAccess } from '../hooks/use-remote-access';
import type { RemoteAccess } from '../hooks/use-remote-access';
import { ConfirmDialog } from './ConfirmDialog';
import { Icon } from './Icon';
import { RemoteQr } from './RemoteQr';
import { RemoteSetup, tailscaleReady } from './RemoteSetup';
import { RemoteUsers } from './RemoteUsers';

/** Settings for opening Pangkalan from a phone over Tailscale. Changes are only allowed locally. */
export function RemotePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const remote = useRemoteAccess(open);
  const { status, busy, error } = remote;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal?.();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="remote-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto max-h-[calc(100dvh-32px)] w-[min(480px,calc(100vw-32px))] overflow-y-auto rounded-lg border border-line-strong bg-panel p-0 text-fg shadow-overlay backdrop:bg-black/50"
    >
      <header className="flex items-center justify-between gap-2 border-b border-line py-3 pr-2 pl-5">
        <h2 id="remote-title" className="text-base font-semibold">
          Akses dari HP
        </h2>
        <button className="icon-btn" aria-label="Tutup" onClick={onClose}>
          <Icon name="x" />
        </button>
      </header>

      <div className="space-y-6 p-5" aria-busy={busy}>
        {error && (
          <p
            role="alert"
            className="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-sm text-error"
          >
            {error}
          </p>
        )}
        {!status && <p className="text-sm text-muted">Memeriksa Tailscale di laptop ini…</p>}
        {status?.viewer === 'remote' && (
          <p className="text-sm leading-relaxed text-muted">
            Kamu membuka Pangkalan lewat Tailscale. Pengaturan akses hanya bisa diubah dari laptop,
            supaya akses dari HP tidak bisa melebarkan dirinya sendiri.
          </p>
        )}
        {status?.viewer === 'local' && <LocalSettings status={status} remote={remote} />}
      </div>
    </dialog>
  );
}

function LocalSettings({ status, remote }: { status: RemoteStatus; remote: RemoteAccess }) {
  const { busy } = remote;
  const tailscale = status.tailscale!;
  const ready = tailscaleReady(tailscale);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  return (
    <>
      <p className="text-sm leading-relaxed text-muted">
        Pantau dan jawab sesi dari HP lewat tailnet pribadimu. Server tetap tertutup dari internet;
        hanya akun Tailscale di daftar bawah yang bisa masuk.
      </p>

      {(!ready || !status.enabled) && (
        <RemoteSetup tailscale={tailscale} busy={busy} onRecheck={() => void remote.refresh()} />
      )}

      <div className="flex items-start justify-between gap-4 border-y border-line py-4">
        <div>
          <p id="remote-switch-label" className="text-sm font-medium">
            Izinkan akses dari HP
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {status.enabled
              ? `Aktif di ${status.origin?.replace('https://', '')}`
              : ready
                ? 'Menjalankan tailscale serve untuk port Pangkalan.'
                : 'Selesaikan persiapan di atas dulu.'}
          </p>
        </div>
        <Switch
          checked={status.enabled}
          disabled={busy || (!status.enabled && !ready)}
          labelledBy="remote-switch-label"
          onChange={(on) => void (on ? remote.enable() : remote.disable())}
        />
      </div>

      {status.enabled && status.url && (
        <Connect
          url={status.url}
          serving={tailscale.serving}
          busy={busy}
          onReserve={() => void remote.enable()}
        />
      )}

      {status.users.length > 0 && (
        <RemoteUsers
          users={status.users}
          owner={tailscale.login}
          busy={busy}
          onChange={(users) => void remote.setUsers(users)}
        />
      )}

      <section aria-labelledby="remote-revoke-title" className="border-t border-line pt-4">
        <h3 id="remote-revoke-title" className="text-sm font-medium">
          Cabut semua akses
        </h3>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">
          Membuat token baru. Terminal yang terbuka di HP langsung terputus, dan HP perlu scan QR
          baru. Browser ini tetap masuk.
        </p>
        <button
          className="btn-ghost mt-2 border border-line-strong !text-error"
          disabled={busy}
          onClick={() => setConfirmRevoke(true)}
        >
          Buat token baru
        </button>
      </section>

      {status.source === 'env' && (
        <p className="text-xs text-muted">
          Server dijalankan dengan <code className="font-mono">PANGKALAN_REMOTE_*</code>. Perubahan
          di sini berlaku sampai server di-restart, lalu env dipakai lagi.
        </p>
      )}

      <ConfirmDialog
        open={confirmRevoke}
        title="Buat token baru?"
        message="Semua perangkat lain, termasuk HP, harus membuka URL bertoken yang baru. Sesi yang berjalan tidak dimatikan."
        confirmLabel="Buat token baru"
        danger
        onCancel={() => setConfirmRevoke(false)}
        onConfirm={() => {
          setConfirmRevoke(false);
          void remote.rotateToken();
        }}
      />
    </>
  );
}

function Connect({
  url,
  serving,
  busy,
  onReserve,
}: {
  url: string;
  serving: boolean;
  busy: boolean;
  onReserve: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <section
      aria-labelledby="remote-connect-title"
      className="flex flex-col gap-4 sm:flex-row sm:items-start"
    >
      <RemoteQr value={url} />
      <div className="min-w-0 flex-1">
        <h3 id="remote-connect-title" className="text-sm font-medium">
          Buka di HP
        </h3>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">
          Scan dengan kamera HP yang sudah login Tailscale. Token tersimpan di browser HP, jadi
          cukup sekali.
        </p>
        <div className="mt-3 flex items-center gap-1 rounded-md border border-line bg-term py-1 pr-1 pl-2.5">
          <span className="min-w-0 flex-1 truncate font-mono text-xs" title={url}>
            {url}
          </span>
          <button
            className="icon-btn"
            aria-label={copied ? 'URL tersalin' : 'Salin URL'}
            onClick={() => void navigator.clipboard.writeText(url).then(() => setCopied(true))}
          >
            <Icon name={copied ? 'check' : 'copy'} size={14} />
          </button>
        </div>
        <p className="sr-only" aria-live="polite">
          {copied ? 'URL tersalin' : ''}
        </p>
        {!serving && (
          <div className="mt-3 text-xs text-waiting">
            <p>tailscale serve tidak sedang meneruskan ke Pangkalan, jadi HP belum bisa masuk.</p>
            <button
              className="btn-ghost mt-2 border border-line-strong px-3 py-1 text-xs"
              disabled={busy}
              onClick={onReserve}
            >
              Jalankan ulang tailscale serve
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function Switch({
  checked,
  disabled,
  labelledBy,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  labelledBy: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative mt-0.5 inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50 [@media(pointer:coarse)]:my-2.5 ${
        checked ? 'border-accent bg-accent' : 'border-line-strong bg-panel-2'
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute size-4 rounded-full transition-[left] ${
          checked ? 'left-[19px] bg-on-accent' : 'left-[3px] bg-muted'
        }`}
      />
    </button>
  );
}

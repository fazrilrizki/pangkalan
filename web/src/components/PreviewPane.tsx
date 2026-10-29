import { useEffect, useState } from 'react';
import { useActivePreview } from '../hooks/use-active-preview';
import type { PreviewSource } from '../lib/preview';
import { isCrossSitePreview, isLocalHost } from '../lib/preview';
import { useAppStore } from '../stores/app-store';
import type { PreviewDevice } from '../stores/preview-store';
import { PREVIEW_DEVICES, usePreviewStore } from '../stores/preview-store';
import type { IconName } from './Icon';
import { Icon } from './Icon';

const SOURCE_LABEL: Record<PreviewSource, string> = {
  manual: 'manual',
  session: 'otomatis',
  project: 'otomatis',
};

const DEVICE_ICON: Record<PreviewDevice, IconName> = {
  desktop: 'monitor',
  tablet: 'tablet',
  phone: 'phone',
};

function parseHttpUrl(value: string): string | null {
  try {
    const url = new URL(value.includes('://') ? value : `http://${value}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * The project's web app in an iframe next to the terminal, so a UI change made by an agent
 * can be checked without leaving Pangkalan. Dev servers refresh it themselves through HMR.
 */
export function PreviewPane() {
  const { project, resolved } = useActivePreview();
  const device = usePreviewStore((s) => s.device);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const url = resolved?.url ?? null;
  const local = isLocalHost(location.hostname);
  const frameWidth = PREVIEW_DEVICES[device].width;

  useEffect(() => {
    if (url && local) setLoading(true);
  }, [url, reloadKey, local]);

  return (
    <section aria-label="Preview web" className="flex h-full min-w-0 flex-col bg-panel">
      <PreviewToolbar
        key={url ?? ''}
        url={url}
        source={resolved?.source ?? null}
        projectId={local ? (project?.id ?? null) : null}
        canLoad={!!url && local}
        onReload={() => setReloadKey((k) => k + 1)}
      />
      {url && local && isCrossSitePreview(url, location) && (
        <p className="shrink-0 border-b border-line bg-waiting/10 px-3 py-1.5 text-xs leading-relaxed text-fg">
          <span className="font-semibold">Login tidak akan bertahan di preview ini.</span> Domain{' '}
          {new URL(url).host} beda site dengan Pangkalan ({location.host}), jadi browser memblokir
          cookie session-nya (Laravel menampilkan "419 Page Expired"). Pakai alamat{' '}
          <span className="font-mono">
            {location.protocol}//{location.hostname}:PORT
          </span>
          , misalnya <span className="font-mono">php artisan serve</span>, atau buka di tab baru.
        </p>
      )}
      <div className="relative min-h-0 flex-1 overflow-auto bg-panel-2">
        {loading && (
          // One sweep per load: says the frame is fetching, then gets out of the way.
          <div
            className="preview-progress absolute inset-x-0 top-0 z-10 h-0.5 bg-accent"
            role="progressbar"
            aria-label="Memuat preview"
          />
        )}
        {!local ? (
          <PreviewMessage
            title="Preview hanya tersedia di laptop"
            body="Dev server berjalan di localhost laptop. Dari HP, alamat localhost menunjuk ke HP itu sendiri. Buka Pangkalan di laptop untuk melihat preview."
          />
        ) : !url ? (
          <PreviewMessage
            title="Belum ada dev server terdeteksi"
            body={
              project
                ? 'Jalankan dev server project ini di terminal, misalnya npm run dev. URL localhost yang muncul di output langsung dipakai di sini, atau isi URL-nya di kolom atas.'
                : 'Sesi ini tidak terhubung ke project. Jalankan dev server di sesi ini; URL localhost dari outputnya akan dipakai di sini.'
            }
          />
        ) : (
          <div className={`flex h-full ${frameWidth ? 'justify-center p-4' : ''}`}>
            <div
              className={`flex h-full flex-col ${
                frameWidth
                  ? 'shrink-0 overflow-hidden rounded-lg border border-line-strong shadow-overlay'
                  : 'w-full'
              }`}
              style={frameWidth ? { width: frameWidth } : undefined}
            >
              <iframe
                key={`${url}#${reloadKey}`}
                src={url}
                title={`Preview ${project?.name ?? url}`}
                className="min-h-0 w-full flex-1 bg-white"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
                referrerPolicy="no-referrer"
                onLoad={() => setLoading(false)}
              />
            </div>
          </div>
        )}
      </div>
      {url && local && frameWidth && (
        <p className="shrink-0 border-t border-line px-3 py-1 text-center font-mono text-[11px] text-muted">
          {PREVIEW_DEVICES[device].label} · {frameWidth}px
        </p>
      )}
    </section>
  );
}

/** Address bar plus view controls. Remounted when the URL changes so the draft resets. */
function PreviewToolbar({
  url,
  source,
  projectId,
  canLoad,
  onReload,
}: {
  url: string | null;
  source: PreviewSource | null;
  /** Null when there is no project to save a manual URL on (or the viewer is remote). */
  projectId: string | null;
  canLoad: boolean;
  onReload: () => void;
}) {
  const device = usePreviewStore((s) => s.device);
  const { setDevice, setOpen } = usePreviewStore.getState();
  const { updateProject, setError } = useAppStore.getState();
  const [draft, setDraft] = useState(url ?? '');
  const [invalid, setInvalid] = useState(false);

  function saveManual(previewUrl: string | null) {
    if (!projectId) return;
    updateProject(projectId, { previewUrl }).catch((err: unknown) =>
      setError(`Gagal menyimpan URL preview: ${String(err)}`),
    );
  }

  function submit() {
    const value = draft.trim();
    if (value === '') {
      if (source === 'manual') saveManual(null);
      return;
    }
    const parsed = parseHttpUrl(value);
    if (!parsed) setInvalid(true);
    else if (parsed === url) onReload();
    else saveManual(parsed);
  }

  return (
    <>
      <div className="flex shrink-0 items-center gap-1 border-b border-line px-2 py-1.5">
        <form
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-md border bg-term pr-1 pl-2.5 focus-within:border-accent ${
            invalid ? 'border-error' : 'border-line-strong'
          }`}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Icon
            name="globe"
            size={14}
            className={`shrink-0 ${canLoad ? 'text-accent' : 'text-muted'}`}
          />
          <input
            aria-label="URL preview"
            aria-invalid={invalid}
            aria-describedby={invalid ? 'preview-url-error' : undefined}
            disabled={!projectId}
            className="min-w-0 flex-1 bg-transparent py-1 font-mono text-xs text-fg outline-none placeholder:text-muted disabled:cursor-not-allowed"
            placeholder="http://localhost:5173"
            spellCheck={false}
            autoComplete="off"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setInvalid(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setDraft(url ?? '');
                setInvalid(false);
              }
            }}
          />
          {source && (
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                source === 'manual' ? 'bg-accent/15 text-accent' : 'bg-hover text-muted'
              }`}
              title={
                source === 'manual'
                  ? 'URL diisi manual untuk project ini'
                  : 'URL dideteksi dari output terminal'
              }
            >
              {SOURCE_LABEL[source]}
            </span>
          )}
          {source === 'manual' && projectId && (
            <button
              type="button"
              className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-muted hover:bg-hover hover:text-fg"
              onClick={() => saveManual(null)}
            >
              Pakai otomatis
            </button>
          )}
        </form>
        <div
          role="group"
          aria-label="Ukuran layar"
          className="flex shrink-0 items-center rounded-md border border-line p-0.5"
        >
          {(Object.keys(PREVIEW_DEVICES) as PreviewDevice[]).map((key) => {
            const { label, width } = PREVIEW_DEVICES[key];
            return (
              <button
                key={key}
                type="button"
                aria-label={label}
                aria-pressed={device === key}
                title={width ? `${label} (${width}px)` : label}
                className={`rounded p-1 transition-colors ${
                  device === key ? 'bg-selected text-fg' : 'text-muted hover:text-fg'
                }`}
                onClick={() => setDevice(key)}
              >
                <Icon name={DEVICE_ICON[key]} size={14} />
              </button>
            );
          })}
        </div>
        <button
          className="icon-btn"
          aria-label="Muat ulang preview"
          disabled={!canLoad}
          onClick={onReload}
        >
          <Icon name="refresh" size={14} />
        </button>
        {url && canLoad ? (
          <a
            className="icon-btn"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Buka preview di tab baru"
            title="Buka di tab baru"
          >
            <Icon name="external" size={14} />
          </a>
        ) : (
          <button className="icon-btn" aria-label="Buka preview di tab baru" disabled>
            <Icon name="external" size={14} />
          </button>
        )}
        <button className="icon-btn" aria-label="Tutup preview" onClick={() => setOpen(false)}>
          <Icon name="x" size={14} />
        </button>
      </div>
      {invalid && (
        <p
          id="preview-url-error"
          role="alert"
          className="shrink-0 border-b border-line px-3 py-1.5 text-xs text-error"
        >
          URL harus http:// atau https://, misalnya http://localhost:5173
        </p>
      )}
    </>
  );
}

function PreviewMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid h-full place-items-center overflow-y-auto px-6 text-sm text-muted">
      <div className="max-w-xs">
        <Icon name="globe" size={28} className="text-line-strong" />
        <p className="mt-3 font-semibold text-fg">{title}</p>
        <p className="mt-1.5 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

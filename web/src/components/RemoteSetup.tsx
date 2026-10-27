import type { ReactNode } from 'react';
import type { TailscaleInfo } from '@integrasi/shared';
import { Icon } from './Icon';

export const tailscaleReady = (t: TailscaleInfo) => t.installed && t.running && t.httpsEnabled;

const link = (href: string, label: string) => (
  <a href={href} target="_blank" rel="noreferrer" className="text-fg underline underline-offset-2">
    {label}
  </a>
);

/** What remote access needs from Tailscale, in the order the user has to fix it. */
export function RemoteSetup({
  tailscale,
  busy,
  onRecheck,
}: {
  tailscale: TailscaleInfo;
  busy: boolean;
  onRecheck: () => void;
}) {
  const steps: { ok: boolean; label: string; hint: ReactNode }[] = [
    {
      ok: tailscale.installed,
      label: 'Tailscale terpasang di laptop',
      hint: <>{link('https://tailscale.com/download', 'Unduh Tailscale')}, pasang juga di HP.</>,
    },
    {
      ok: tailscale.running,
      label: 'Login dan tersambung ke tailnet',
      hint: (
        <>
          Login lewat aplikasi Tailscale, atau jalankan{' '}
          <code className="font-mono">tailscale up</code>. HP harus login ke tailnet yang sama.
        </>
      ),
    },
    {
      ok: tailscale.httpsEnabled,
      label: 'HTTPS Certificates aktif',
      hint: (
        <>
          Nyalakan MagicDNS dan HTTPS Certificates di{' '}
          {link('https://login.tailscale.com/admin/dns', 'pengaturan DNS tailnet')}.
        </>
      ),
    },
  ];
  // Later steps can't be checked until the earlier ones pass, so only the first gap gets a hint.
  const firstGap = steps.findIndex((step) => !step.ok);

  return (
    <section aria-labelledby="remote-setup-title">
      <div className="flex items-center justify-between">
        <h3 id="remote-setup-title" className="text-xs font-medium text-muted">
          Persiapan
        </h3>
        <button className="btn-ghost -mr-2 px-2 py-1 text-xs" disabled={busy} onClick={onRecheck}>
          <Icon name="refresh" size={13} />
          Periksa ulang
        </button>
      </div>
      <ol className="mt-1 space-y-2">
        {steps.map((step, i) => (
          <li key={step.label} className="flex gap-2.5 text-sm">
            <Icon
              name={step.ok ? 'check' : 'circle'}
              size={16}
              className={`mt-0.5 shrink-0 ${step.ok ? 'text-idle' : 'text-muted'}`}
            />
            <div className="min-w-0">
              <p className={step.ok ? 'text-muted' : 'text-fg'}>
                {step.label}
                <span className="sr-only">{step.ok ? ': siap' : ': belum'}</span>
              </p>
              {i === firstGap && (
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{step.hint}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

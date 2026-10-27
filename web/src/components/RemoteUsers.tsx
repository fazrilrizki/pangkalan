import { useState } from 'react';
import type { FormEvent } from 'react';
import { remoteUserSchema } from '@integrasi/shared';
import { Icon } from './Icon';

/** Tailscale logins allowed through. The last one cannot be removed: turn remote off instead. */
export function RemoteUsers({
  users,
  owner,
  busy,
  onChange,
}: {
  users: string[];
  owner: string | null;
  busy: boolean;
  onChange: (users: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  function add(e: FormEvent) {
    e.preventDefault();
    const parsed = remoteUserSchema.safeParse(draft);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Login tidak valid');
    if (users.includes(parsed.data)) return setError('Akun ini sudah ada di daftar');
    setError(null);
    setDraft('');
    onChange([...users, parsed.data]);
  }

  return (
    <section aria-labelledby="remote-users-title">
      <h3 id="remote-users-title" className="text-xs font-medium text-muted">
        Akun Tailscale yang diizinkan
      </h3>
      <ul className="mt-2 divide-y divide-line rounded-md border border-line">
        {users.map((user) => (
          <li key={user} className="flex items-center gap-2 py-1 pr-1 pl-3 text-sm">
            <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{user}</span>
            {user === owner && <span className="text-xs text-muted">pemilik laptop</span>}
            <button
              className="icon-btn hover:!text-error"
              aria-label={`Hapus ${user}`}
              title={
                users.length === 1
                  ? 'Minimal satu akun. Matikan akses untuk menutup semuanya.'
                  : undefined
              }
              disabled={busy || users.length === 1}
              onClick={() => onChange(users.filter((u) => u !== user))}
            >
              <Icon name="x" size={14} />
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-2 flex gap-2">
        <label className="sr-only" htmlFor="remote-user-input">
          Login Tailscale
        </label>
        <input
          id="remote-user-input"
          className="field font-mono"
          placeholder="nama@github"
          value={draft}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error !== null}
          aria-describedby={error ? 'remote-user-error' : undefined}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="submit"
          className="btn-ghost shrink-0 border border-line-strong"
          disabled={busy || !draft.trim()}
        >
          Tambah
        </button>
      </form>
      {error && (
        <p id="remote-user-error" role="alert" className="mt-1.5 text-xs text-error">
          {error}
        </p>
      )}
      <p className="mt-1.5 text-xs text-muted">
        Siapa pun di daftar ini bisa menjalankan perintah di laptopmu. Tambahkan akunmu sendiri
        saja.
      </p>
    </section>
  );
}

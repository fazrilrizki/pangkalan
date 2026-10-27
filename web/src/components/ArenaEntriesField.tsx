import type { CliInfo } from '@integrasi/shared';
import { ARENA_MAX_ENTRIES, ARENA_MIN_ENTRIES } from '@integrasi/shared';
import { Icon } from './Icon';

export const LETTERS = ['A', 'B', 'C', 'D'];

export interface EntryDraft {
  key: number;
  cliId: string;
  args: string;
}

/** Identical contestants compare nothing; usually the args field was left empty. */
function duplicateLetters(entries: EntryDraft[]): string[] {
  const signature = (d: EntryDraft) => `${d.cliId}\u0000${d.args.trim().split(/\s+/).join(' ')}`;
  const signatures = entries.map(signature);
  return entries
    .map((_, i) => i)
    .filter((i) => signatures.filter((s) => s === signatures[i]).length > 1)
    .map((i) => LETTERS[i]!);
}

/**
 * The contestant rows of the arena form. On a phone each row wraps so the args field gets the
 * full width under the CLI picker instead of being squeezed beside it.
 */
export function ArenaEntriesField({
  entries,
  clis,
  onChange,
}: {
  entries: EntryDraft[];
  clis: CliInfo[];
  onChange: (entries: EntryDraft[]) => void;
}) {
  const update = (key: number, patch: Partial<EntryDraft>) =>
    onChange(entries.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const duplicates = duplicateLetters(entries);

  return (
    <fieldset>
      <legend className="text-xs font-medium text-muted">Peserta</legend>
      <ol className="mt-1.5 space-y-2">
        {entries.map((draft, i) => (
          <li
            key={draft.key}
            className="grid grid-cols-[1rem_1fr_auto] items-center gap-x-2 gap-y-1.5 sm:grid-cols-[1rem_10rem_1fr_auto]"
          >
            <span className="font-mono text-sm font-semibold text-muted">{LETTERS[i]}</span>
            <select
              className="field"
              aria-label={`CLI peserta ${LETTERS[i]}`}
              value={draft.cliId}
              onChange={(e) => update(draft.key, { cliId: e.target.value })}
            >
              {clis.map((cli) => (
                <option key={cli.id} value={cli.id}>
                  {cli.name}
                </option>
              ))}
            </select>
            <input
              className="field col-span-2 col-start-2 row-start-2 min-w-0 font-mono sm:col-span-1 sm:col-start-3 sm:row-start-1"
              aria-label={`Argumen tambahan peserta ${LETTERS[i]}`}
              placeholder="argumen, mis. --model opus"
              value={draft.args}
              spellCheck={false}
              onChange={(e) => update(draft.key, { args: e.target.value })}
            />
            <button
              type="button"
              className="icon-btn col-start-3 row-start-1 sm:col-start-4"
              aria-label={`Hapus peserta ${LETTERS[i]}`}
              disabled={entries.length <= ARENA_MIN_ENTRIES}
              onClick={() => onChange(entries.filter((d) => d.key !== draft.key))}
            >
              <Icon name="x" size={14} />
            </button>
          </li>
        ))}
      </ol>
      {duplicates.length > 0 && (
        <p className="mt-2 text-xs text-waiting">
          Peserta {duplicates.join(', ')} sama persis. Beda CLI atau argumen (mis.{' '}
          <code className="font-mono">--model</code>) membuat adu ini membandingkan sesuatu.
        </p>
      )}
      {entries.length < ARENA_MAX_ENTRIES && (
        <button
          type="button"
          className="btn-ghost mt-2 -ml-3 text-xs"
          onClick={() =>
            onChange([
              ...entries,
              {
                key: Math.max(...entries.map((d) => d.key)) + 1,
                cliId: clis[0]?.id ?? '',
                args: '',
              },
            ])
          }
        >
          <Icon name="plus" size={13} />
          Tambah peserta
        </button>
      )}
    </fieldset>
  );
}

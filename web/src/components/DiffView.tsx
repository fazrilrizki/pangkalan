import { useMemo, useRef } from 'react';
import type { ArenaEntryDiff } from '@integrasi/shared';

interface FileSection {
  path: string;
  /** Shown beside the path when the file is not simply modified. */
  change: 'baru' | 'dihapus' | 'diganti nama' | null;
  /** Hunk lines from the first `@@` on; git's header lines are summarised above instead. */
  lines: string[];
  binary: boolean;
}

/** Splits a unified diff into one section per file. */
export function splitPatch(patch: string): FileSection[] {
  const sections: FileSection[] = [];
  let current: FileSection | null = null;
  let inHunks = false;
  for (const line of patch.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const path = line.match(/ b\/(.+)$/)?.[1] ?? line.slice('diff --git '.length);
      current = { path, change: null, lines: [], binary: false };
      sections.push(current);
      inHunks = false;
    } else if (!current) {
      continue;
    } else if (inHunks || line.startsWith('@@')) {
      inHunks = true;
      current.lines.push(line);
    } else if (line.startsWith('new file mode')) {
      current.change = 'baru';
    } else if (line.startsWith('deleted file mode')) {
      current.change = 'dihapus';
    } else if (line.startsWith('rename from')) {
      current.change = 'diganti nama';
    } else if (line.startsWith('Binary files')) {
      current.binary = true;
    }
  }
  return sections;
}

const lineClass = (line: string) =>
  line.startsWith('+')
    ? 'bg-idle/10 text-idle'
    : line.startsWith('-')
      ? 'bg-error/10 text-error'
      : line.startsWith('@@')
        ? 'text-working'
        : 'text-muted';

/** File list beside the patch; picking a file scrolls the patch to it. */
export function DiffView({ diff }: { diff: ArenaEntryDiff }) {
  const sections = useMemo(() => splitPatch(diff.patch), [diff.patch]);
  const refs = useRef<(HTMLElement | null)[]>([]);

  return (
    <>
      <nav
        aria-label={`File yang diubah peserta ${diff.letter}`}
        className="max-h-40 shrink-0 overflow-y-auto border-b border-line py-2 md:max-h-none md:w-64 md:border-r md:border-b-0"
      >
        <ul>
          {diff.files.map((f) => {
            const index = sections.findIndex((s) => s.path === f.path);
            return (
              <li key={f.path}>
                <button
                  disabled={index === -1}
                  onClick={() => refs.current[index]?.scrollIntoView({ block: 'start' })}
                  className="flex w-full items-baseline gap-2 px-4 py-1 text-left font-mono text-xs hover:bg-hover disabled:hover:bg-transparent"
                >
                  <span className="min-w-0 flex-1 truncate-start" title={f.path}>
                    <bdi>{f.path}</bdi>
                  </span>
                  {f.binary ? (
                    <span className="text-muted">biner</span>
                  ) : (
                    <span className="shrink-0">
                      <span className="text-idle">+{f.added}</span>{' '}
                      <span className="text-error">−{f.removed}</span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="min-h-0 min-w-0 flex-1 overflow-auto bg-term font-mono text-xs leading-5">
        {sections.map((section, i) => (
          <section
            key={section.path}
            ref={(el) => {
              refs.current[i] = el;
            }}
            aria-label={section.path}
          >
            <h3 className="sticky top-0 z-10 flex items-baseline gap-2 border-y border-line bg-panel-2 px-4 py-1.5 font-semibold text-fg">
              <span className="min-w-0 truncate">{section.path}</span>
              {section.change && (
                <span className="shrink-0 font-sans font-normal text-muted">{section.change}</span>
              )}
            </h3>
            {section.binary ? (
              <p className="px-4 py-2 text-muted">File biner, isinya tidak ditampilkan.</p>
            ) : (
              <pre className="py-1">
                {section.lines.map((line, j) => (
                  <div key={j} className={`px-4 whitespace-pre ${lineClass(line)}`}>
                    {line || ' '}
                  </div>
                ))}
              </pre>
            )}
          </section>
        ))}
        {diff.truncated && (
          <p className="px-4 py-3 text-waiting">
            Diff terpotong karena terlalu besar. Lihat lengkap di worktree peserta.
          </p>
        )}
      </div>
    </>
  );
}

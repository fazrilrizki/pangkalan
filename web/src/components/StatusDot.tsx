import type { SessionStatus } from '@integrasi/shared';

export const STATUS_LABEL: Record<SessionStatus, string> = {
  working: 'Bekerja',
  waiting: 'Menunggu input',
  idle: 'Siap',
  exited: 'Selesai',
  error: 'Error',
};

const COLOR: Record<SessionStatus, string> = {
  working: 'bg-working',
  waiting: 'bg-waiting',
  idle: 'bg-idle',
  exited: 'bg-exited',
  error: 'bg-error',
};

export function StatusDot({ status }: { status: SessionStatus }) {
  return (
    <span
      role="img"
      aria-label={STATUS_LABEL[status]}
      title={STATUS_LABEL[status]}
      className={`inline-block size-2 shrink-0 rounded-full ${COLOR[status]}`}
    />
  );
}

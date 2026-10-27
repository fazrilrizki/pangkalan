import { motion, useReducedMotion } from 'motion/react';
import type { SessionStatus } from '@integrasi/shared';

export const STATUS_LABEL: Record<SessionStatus, string> = {
  working: 'Bekerja',
  waiting: 'Menunggu input',
  idle: 'Siap',
  exited: 'Selesai',
  error: 'Error',
};

const COLOR: Record<SessionStatus, string> = {
  working: 'var(--color-working)',
  waiting: 'var(--color-waiting)',
  idle: 'var(--color-idle)',
  exited: 'var(--color-exited)',
  error: 'var(--color-error)',
};

/**
 * working = blue dot with an expanding pulse ring, waiting = blinking amber dot,
 * idle/exited/error = static dot. Reduced motion keeps every state static but distinct.
 */
export function StatusDot({ status, size = 8 }: { status: SessionStatus; size?: number }) {
  const reduceMotion = useReducedMotion();
  const color = COLOR[status];
  const animate = !reduceMotion;

  return (
    <span
      role="img"
      aria-label={STATUS_LABEL[status]}
      title={STATUS_LABEL[status]}
      data-status={status}
      className="relative inline-grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      {status === 'working' && animate && (
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ background: color }}
          initial={{ scale: 1, opacity: 0.6 }}
          animate={{ scale: 2.6, opacity: 0 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      {status === 'waiting' && !animate && (
        <span
          className="absolute -inset-[3px] rounded-full border"
          style={{ borderColor: color }}
        />
      )}
      <motion.span
        className="relative rounded-full"
        style={{ width: size, height: size, background: color }}
        animate={{ opacity: status === 'waiting' && animate ? [1, 0.3, 1] : 1 }}
        transition={
          status === 'waiting' && animate
            ? { duration: 1.1, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 0.2 }
        }
      />
    </span>
  );
}

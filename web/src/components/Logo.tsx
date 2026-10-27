/** Pangkalan mark: a prompt chevron landing on a platform. Mirrors web/public/favicon.svg. */
export function Logo({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="8" className="fill-accent" />
      <g
        fill="none"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-on-accent"
      >
        <path d="M10.5 8.5 17 14l-6.5 5.5" />
        <path d="M9 24h14" />
      </g>
    </svg>
  );
}

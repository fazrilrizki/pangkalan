import { useMemo } from 'react';
import { encode } from 'uqr';

/**
 * QR for the phone URL. Always dark-on-white whatever the theme: phone cameras read inverted
 * codes poorly, so the white square is part of the code, not decoration.
 */
export function RemoteQr({ value, size = 168 }: { value: string; size?: number }) {
  const { path, modules } = useMemo(() => {
    const { data, size: count } = encode(value, { ecc: 'M', border: 2 });
    let d = '';
    data.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) d += `M${x} ${y}h1v1h-1z`;
      }),
    );
    return { path: d, modules: count };
  }, [value]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${modules} ${modules}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="Kode QR berisi alamat Pangkalan untuk HP"
      className="shrink-0 rounded-md"
    >
      <rect width={modules} height={modules} fill="#ffffff" />
      <path d={path} fill="#161514" />
    </svg>
  );
}

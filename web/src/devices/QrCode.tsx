import { useMemo } from 'react';
import { qrExtent, qrMatrix, qrPath } from './qr';

/**
 * A QR code of a text, drawn by the page: one path of dark modules on a light ground with its quiet zone, in the two
 * colours a scanner needs whatever the theme. Its name says what it is for; the text itself is shown beside it.
 */
export function QrCode({ text, label, testid }: { text: string; label: string; testid?: string }) {
  const { path, extent } = useMemo(() => {
    const matrix = qrMatrix(text);
    return { path: qrPath(matrix), extent: qrExtent(matrix) };
  }, [text]);
  return (
    <svg className="qr-code" viewBox={`0 0 ${extent} ${extent}`} role="img" aria-label={label} shapeRendering="crispEdges" data-testid={testid}>
      <path d={path} />
    </svg>
  );
}

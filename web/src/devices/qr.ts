import QRCode from 'qrcode';

/**
 * A QR code as the page draws it: the library is asked for the matrix of modules only, and the page draws that as
 * one SVG path of its own. No markup made by anything else is put on the page.
 */

/** The light margin a scanner needs round the code, in modules. */
export const QUIET_ZONE = 4;

export interface Matrix {
  size: number;
  /** Row after row, `size` by `size`: true (or 1) where a module is dark. */
  data: ArrayLike<boolean | number>;
}

/** The matrix of a text, at the middle level of error correction. */
export function qrMatrix(text: string): Matrix {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  return { size: modules.size, data: modules.data };
}

/**
 * The dark modules as one path, inside the quiet zone: each run of dark modules in a row is one rectangle one
 * module high, so that two next to each other leave no seam between them.
 */
export function qrPath(matrix: Matrix, quiet: number = QUIET_ZONE): string {
  const parts: string[] = [];
  for (let row = 0; row < matrix.size; row += 1) {
    let column = 0;
    while (column < matrix.size) {
      if (!matrix.data[row * matrix.size + column]) {
        column += 1;
        continue;
      }
      const start = column;
      while (column < matrix.size && matrix.data[row * matrix.size + column]) column += 1;
      parts.push(`M${start + quiet} ${row + quiet}h${column - start}v1h-${column - start}z`);
    }
  }
  return parts.join('');
}

/** The width and height of the whole drawing, quiet zone included, in modules. */
export const qrExtent = (matrix: Matrix, quiet: number = QUIET_ZONE): number => matrix.size + 2 * quiet;

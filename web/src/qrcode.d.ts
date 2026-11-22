/** The one part of the `qrcode` package the page uses: the matrix of a code, which the page draws itself. It has no types of its own. */
declare module 'qrcode' {
  interface BitMatrix {
    size: number;
    data: Uint8Array;
  }
  interface CreateOptions {
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  }
  export function create(text: string, options?: CreateOptions): { modules: BitMatrix };
  const qrcode: { create: typeof create };
  export default qrcode;
}

/** The one part of the `qrcode` package this code uses: drawing a code as text for a terminal. It has no types of its own. */
declare module 'qrcode' {
  interface ToStringOptions {
    type?: 'utf8' | 'terminal' | 'svg';
    small?: boolean;
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    margin?: number;
  }
  export function toString(text: string, options?: ToStringOptions): Promise<string>;
  const qrcode: { toString: typeof toString };
  export default qrcode;
}

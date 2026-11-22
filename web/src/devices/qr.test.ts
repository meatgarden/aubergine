import { describe, expect, it } from 'vitest';
import { qrExtent, qrMatrix, qrPath } from './qr';

describe('the path of a QR code', () => {
  it('draws each run of dark modules in a row as one rectangle, inside the quiet zone', () => {
    // 1 1 0
    // 0 0 0
    // 1 0 1
    const matrix = { size: 3, data: [1, 1, 0, 0, 0, 0, 1, 0, 1] };
    expect(qrPath(matrix, 1)).toBe('M1 1h2v1h-2zM1 3h1v1h-1zM3 3h1v1h-1z');
    expect(qrPath(matrix, 0)).toBe('M0 0h2v1h-2zM0 2h1v1h-1zM2 2h1v1h-1z');
    expect(qrExtent(matrix, 4)).toBe(11);
    expect(qrPath({ size: 2, data: [0, 0, 0, 0] })).toBe('');
  });

  it("is made from the library's matrix of the text", () => {
    const matrix = qrMatrix('https://aubergine.example.test/#pair=ABCDEFGHJK');
    expect(matrix.size).toBeGreaterThanOrEqual(21);
    expect(matrix.data.length).toBe(matrix.size * matrix.size);
    const path = qrPath(matrix);
    expect(path).toMatch(/^(M\d+ \d+h\d+v1h-\d+z)+$/);
    // The finder pattern in the top left corner: a row of seven dark modules just inside the quiet zone.
    expect(path.startsWith('M4 4h7v1h-7z')).toBe(true);
  });
});

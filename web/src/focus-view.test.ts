import { describe, expect, it } from 'vitest';
import { columnsFrom } from './focus-view';

describe('the columns of the focus view', () => {
  const closed = { canvases: false, details: false, note: false };

  it('are all closed where nothing is remembered', () => {
    expect(columnsFrom(null)).toEqual(closed);
  });

  it('are what this browser remembered', () => {
    expect(columnsFrom('{"canvases":true,"details":false,"note":true}')).toEqual({ canvases: true, details: false, note: true });
    expect(columnsFrom('{"canvases":false,"details":true,"note":false,"later":1}')).toEqual({ canvases: false, details: true, note: false });
  });

  it('are all closed where what is remembered is wrong in any way', () => {
    for (const wrong of ['', 'open', '[]', '[true,true,true]', 'null', '1', '"x"', '{', '{}', '{"canvases":true,"details":true}', '{"canvases":"yes","details":true,"note":true}', '{"canvases":1,"details":true,"note":true}']) {
      expect(columnsFrom(wrong), wrong).toEqual(closed);
    }
  });
});

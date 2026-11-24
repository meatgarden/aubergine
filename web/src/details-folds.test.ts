import { describe, expect, it } from 'vitest';
import { foldsFrom } from './details-folds';

describe('the folds of a terminal\'s details', () => {
  const open = { known: false, links: false };

  it('are open where nothing is remembered', () => {
    expect(foldsFrom(null)).toEqual(open);
  });

  it('are what this browser remembered', () => {
    expect(foldsFrom('{"known":true,"links":false}')).toEqual({ known: true, links: false });
    expect(foldsFrom('{"known":false,"links":true,"later":1}')).toEqual({ known: false, links: true });
  });

  it('are open where what is remembered is wrong in any way', () => {
    for (const wrong of ['', 'folded', '[]', '[true,true]', 'null', '1', '"x"', '{', '{}', '{"known":true}', '{"known":"yes","links":true}', '{"known":1,"links":0}']) {
      expect(foldsFrom(wrong), wrong).toEqual(open);
    }
  });
});

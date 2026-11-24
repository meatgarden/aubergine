import { describe, expect, it } from 'vitest';
import { foldsFrom } from './details-folds';

describe('the folds of a terminal\'s details', () => {
  const open = { known: false, fields: false, links: false };

  it('are open where nothing is remembered', () => {
    expect(foldsFrom(null)).toEqual(open);
  });

  it('are what this browser remembered', () => {
    expect(foldsFrom('{"known":true,"fields":true,"links":false}')).toEqual({ known: true, fields: true, links: false });
    expect(foldsFrom('{"known":false,"fields":false,"links":true,"later":1}')).toEqual({ known: false, fields: false, links: true });
  });

  it('read an entry from before fields existed, with the fields open', () => {
    expect(foldsFrom('{"known":true,"links":false}')).toEqual({ known: true, fields: false, links: false });
    expect(foldsFrom('{"known":false,"links":true,"fields":"yes"}')).toEqual({ known: false, fields: false, links: true });
  });

  it('are open where what is remembered is wrong in any way', () => {
    for (const wrong of ['', 'folded', '[]', '[true,true]', 'null', '1', '"x"', '{', '{}', '{"known":true}', '{"known":"yes","links":true}', '{"known":1,"links":0}']) {
      expect(foldsFrom(wrong), wrong).toEqual(open);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { MAX_FIELDS } from '@aubergine/shared';
import { fieldsAfter, moved } from './fields-model';

const ticket = { label: 'Ticket', value: 'DEMO-12' };
const owner = { label: 'Owner', value: 'Sam' };
const env = { label: 'Environment', value: 'staging' };

describe('the fields after a change', () => {
  it('adds one at the end', () => {
    expect(fieldsAfter([ticket], owner, null)).toEqual({ fields: [ticket, owner] });
  });

  it('changes one in its place, its label too', () => {
    expect(fieldsAfter([ticket, owner, env], { label: 'Lead', value: 'Alex' }, 'owner')).toEqual({ fields: [ticket, { label: 'Lead', value: 'Alex' }, env] });
    expect(fieldsAfter([ticket, owner], { label: 'OWNER', value: 'Alex' }, 'Owner')).toEqual({ fields: [ticket, { label: 'OWNER', value: 'Alex' }] });
  });

  it('refuses a label that is there already, whatever its capitals', () => {
    expect(fieldsAfter([ticket, owner], { label: 'ticket', value: 'X' }, null)).toEqual({ problem: expect.stringContaining('There is a field “Ticket” already') });
    expect(fieldsAfter([ticket, owner], { label: 'Ticket', value: 'X' }, 'Owner')).toEqual({ problem: expect.stringContaining('“Ticket”') });
  });

  it('refuses one more than the most there may be', () => {
    const full = Array.from({ length: MAX_FIELDS }, (_, i) => ({ label: `F${i}`, value: 'x' }));
    expect(fieldsAfter(full, ticket, null)).toEqual({ problem: expect.stringContaining(`at most ${MAX_FIELDS}`) });
    expect(fieldsAfter(full, { label: 'F0', value: 'y' }, 'F0')).toEqual({ fields: [{ label: 'F0', value: 'y' }, ...full.slice(1)] });
  });
});

describe('moving a field', () => {
  it('swaps it with its neighbour, and leaves the ends as they are', () => {
    expect(moved([ticket, owner, env], 1, -1)).toEqual([owner, ticket, env]);
    expect(moved([ticket, owner, env], 1, 1)).toEqual([ticket, env, owner]);
    expect(moved([ticket, owner], 0, -1)).toEqual([ticket, owner]);
    expect(moved([ticket, owner], 1, 1)).toEqual([ticket, owner]);
  });
});

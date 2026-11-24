import { describe, expect, it } from 'vitest';
import { applyEvent } from './events';
import { Session, createInitialState } from './entities';
import { FieldsInput, MAX_FIELDS, TerminalFields, fieldFromLine, lineOfField, ownerSetFields, removeOwnField, setOwnField, useSuggestedField, type FieldInput, type TerminalField } from './fields';
import { newId } from './ids';
import { PatchSessionRequest, UpdateSessionRequest } from './protocol';
import { z } from 'zod';

const AT = '2026-03-01T10:00:00.000Z';
const LATER = '2026-03-01T11:00:00.000Z';

const problemOf = (line: string): string | null => {
  const read = fieldFromLine(line);
  return 'problem' in read ? read.problem : null;
};
const fieldOf = (line: string): FieldInput | null => {
  const read = fieldFromLine(line);
  return 'field' in read ? read.field : null;
};

describe('a line read as a field', () => {
  it('is the label before the first colon and the value after it', () => {
    expect(fieldOf('Ticket: DEMO-12')).toEqual({ label: 'Ticket', value: 'DEMO-12' });
    expect(fieldOf('Owner:Sam')).toEqual({ label: 'Owner', value: 'Sam' });
    // A colon inside the value is the value's, as in an address or a time.
    expect(fieldOf('Ticket: https://example.com/t/DEMO-12')).toEqual({ label: 'Ticket', value: 'https://example.com/t/DEMO-12' });
    expect(fieldOf('Deploy at: 09:30')).toEqual({ label: 'Deploy at', value: '09:30' });
    // Spaces round either side are not kept.
    expect(fieldOf('   Environment  :   staging   ')).toEqual({ label: 'Environment', value: 'staging' });
  });

  it('says what is wrong with one that is not a field', () => {
    expect(problemOf('DEMO-12')).toMatch(/colon/);
    expect(problemOf('')).toMatch(/colon/);
    expect(problemOf(': DEMO-12')).toBe('Write a label before the colon.');
    expect(problemOf('   : DEMO-12')).toBe('Write a label before the colon.');
    expect(problemOf('Ticket:')).toBe('Write a value after “Ticket:”.');
    expect(problemOf('Ticket:    ')).toBe('Write a value after “Ticket:”.');
    expect(problemOf(`${'x'.repeat(41)}: value`)).toMatch(/at most 40 characters; this one has 41/);
    expect(problemOf(`Notes: ${'x'.repeat(201)}`)).toMatch(/at most 200 characters; this one has 201/);
    expect(problemOf('Ticket: one\ntwo')).toMatch(/one line of plain text/);
    expect(problemOf('Tick\u0007et: x')).toMatch(/one line of plain text/);
    expect(problemOf('Ticket: ‮evil')).toMatch(/one line of plain text/);
    expect(problemOf('Ticket: tab\there')).toMatch(/one line of plain text/);
  });

  it('comes back as the line that made it', () => {
    for (const line of ['Ticket: DEMO-12', 'Ticket: https://example.com/t/DEMO-12', 'Deploy at: 09:30']) expect(lineOfField(fieldOf(line)!)).toBe(line);
  });
});

describe('the list of fields', () => {
  it('holds at most a dozen, each label once whatever its capitals', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `Field ${i}`, value: 'x' }));
    expect(TerminalFields.safeParse(many(MAX_FIELDS)).success).toBe(true);
    expect(TerminalFields.safeParse(many(MAX_FIELDS + 1)).success).toBe(false);
    expect(TerminalFields.safeParse([{ label: 'Owner', value: 'Sam' }, { label: 'OWNER ', value: 'Alex' }]).success).toBe(false);
    expect(TerminalFields.safeParse([{ label: 'a:b', value: 'x' }]).success).toBe(false);
    // Stored before fields said who set them: the owner's.
    expect(TerminalFields.parse([{ label: ' Owner ', value: ' Sam ' }])).toEqual([{ label: 'Owner', value: 'Sam', source: 'owner' }]);
  });

  it('is sent as labels and values only: who set one is never read from what is sent', () => {
    expect(FieldsInput.parse([{ label: 'Owner', value: 'Sam', source: 'agent', suggested: { value: 'x', at: AT } }])).toEqual([{ label: 'Owner', value: 'Sam' }]);
    expect(PatchSessionRequest.parse({ fields: [{ label: 'Owner', value: 'Sam', source: 'agent' }] }).fields).toEqual([{ label: 'Owner', value: 'Sam' }]);
    expect(UpdateSessionRequest.parse({ fields: [{ label: 'Owner', value: 'Sam', source: 'agent' }] }).fields).toEqual([{ label: 'Owner', value: 'Sam' }]);
  });

  it('can be described', () => {
    expect(() => z.toJSONSchema(TerminalFields)).not.toThrow();
    expect(() => z.toJSONSchema(PatchSessionRequest)).not.toThrow();
  });

  it('is something to update on both bodies, and leaving it out is not an empty list', () => {
    expect(PatchSessionRequest.safeParse({ fields: [] }).success).toBe(true);
    expect(UpdateSessionRequest.safeParse({ fields: [] }).success).toBe(true);
    expect(PatchSessionRequest.parse({ name: 'x' })).not.toHaveProperty('fields');
    expect(UpdateSessionRequest.parse({ name: 'x' })).not.toHaveProperty('fields');
  });

  it('is none on a session from before fields existed, and an event replaces it', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const initial = createInitialState(now);
    const session = Session.parse({ id: newId(), projectId: initial.projects[0]!.id, name: 'api', createdAt: now.toISOString() });
    expect(session.fields).toEqual([]);
    const fields: TerminalField[] = [{ label: 'Ticket', value: 'DEMO-12', source: 'owner' }];
    const after = applyEvent({ ...initial, sessions: [session] }, { type: 'session.fields', sessionId: session.id, fields });
    expect(after.sessions[0]!.fields).toEqual(fields);
    expect(applyEvent(after, { type: 'session.fields', sessionId: session.id, fields: [] }).sessions[0]!.fields).toEqual([]);
  });
});

const owners = (label: string, value: string): TerminalField => ({ label, value, source: 'owner' });
const agents = (label: string, value: string): TerminalField => ({ label, value, source: 'agent' });
function set(fields: readonly TerminalField[], label: string, value: string, now = AT) {
  const result = setOwnField(fields, label, value, now);
  if ('problem' in result) throw new Error(result.problem);
  return result;
}

describe('what the agent in a terminal sets', () => {
  it('adds a label nobody set at the end, as the agent’s', () => {
    const result = set([owners('Ticket', 'DEMO-12')], '  Branch ', ' fix-session-time ');
    expect(result.fields).toEqual([owners('Ticket', 'DEMO-12'), agents('Branch', 'fix-session-time')]);
    expect(result.field).toEqual(agents('Branch', 'fix-session-time'));
    expect(result.kept).toBe(true);
  });

  it('replaces its own where it stands, whatever the capitals of the label', () => {
    const before = [agents('Branch', 'one'), owners('Ticket', 'DEMO-12')];
    const result = set(before, 'branch', 'two');
    expect(result.fields).toEqual([agents('branch', 'two'), owners('Ticket', 'DEMO-12')]);
    expect(result.kept).toBe(true);
  });

  it('leaves the owner’s value as it is and keeps what was sent on it as a suggestion', () => {
    const before = [owners('Environment', 'staging')];
    const result = set(before, 'environment', 'production');
    expect(result.kept).toBe(false);
    expect(result.fields).toEqual([{ ...owners('Environment', 'staging'), suggested: { value: 'production', at: AT } }]);
    // Said again, the newer suggestion replaces the older.
    const again = set(result.fields, 'Environment', 'canary', LATER);
    expect(again.fields[0]!.suggested).toEqual({ value: 'canary', at: LATER });
    expect(again.fields[0]!.value).toBe('staging');
    // The owner's own value said again: nothing to suggest, and the earlier suggestion goes.
    const same = set(again.fields, 'Environment', 'staging');
    expect(same.fields).toEqual([owners('Environment', 'staging')]);
    expect(same.kept).toBe(true);
  });

  it('is refused at the limit, which counts every field, and only for a new label', () => {
    const full = [...Array.from({ length: MAX_FIELDS - 1 }, (_, i) => owners(`Owner ${i}`, 'x')), agents('Mine', 'a')];
    const refused = setOwnField(full, 'Another', 'b', AT);
    expect(refused).toEqual({ problem: expect.stringMatching(new RegExp(`${MAX_FIELDS} fields, the most it can have`)), reason: 'full' });
    // Replacing its own, or suggesting for the owner's, still works at the limit.
    expect(set(full, 'Mine', 'b').fields).toHaveLength(MAX_FIELDS);
    expect(set(full, 'Owner 0', 'y').fields[0]!.suggested?.value).toBe('y');
  });

  it('says in one sentence what is wrong with a label or a value', () => {
    const problem = (label: string, value: string): string | null => {
      const result = setOwnField([], label, value, AT);
      return 'problem' in result ? result.problem : null;
    };
    expect(problem('', 'x')).toMatch(/needs a label/);
    expect(problem('a:b', 'x')).toBe('A label holds no colon.');
    expect(problem('Ticket', '  ')).toMatch(/value/);
    expect(problem('x'.repeat(41), 'x')).toMatch(/at most 40 characters/);
    expect(problem('Ticket', 'x'.repeat(201))).toMatch(/at most 200 characters/);
    expect(problem('Ticket', 'one\ntwo')).toMatch(/one line of plain text/);
    expect(problem('Tick\u202eet', 'x')).toMatch(/one line of plain text/);
    expect(setOwnField([], 'a:b', 'x', AT)).toMatchObject({ reason: 'input' });
  });
});

describe('what the agent in a terminal removes', () => {
  it('is only its own', () => {
    const before = [owners('Ticket', 'DEMO-12'), agents('Branch', 'fix')];
    expect(removeOwnField(before, 'branch')).toEqual({ fields: [owners('Ticket', 'DEMO-12')] });
    expect(removeOwnField(before, 'Ticket')).toEqual({ problem: expect.stringMatching(/owner’s: only they remove it/), reason: 'owners' });
    expect(removeOwnField(before, 'Nothing')).toEqual({ problem: 'This terminal has no field “Nothing”.', reason: 'none' });
  });
});

describe('the owner replacing the list', () => {
  it('makes what is sent the owner’s, except a field sent as it stood, which keeps who set it', () => {
    const before = [agents('Branch', 'fix'), agents('Build', '#12'), owners('Ticket', 'DEMO-12')];
    const after = ownerSetFields(before, [
      { label: 'Ticket', value: 'DEMO-12' },
      { label: 'Branch', value: 'fix' },
      { label: 'Build', value: '#13' },
      { label: 'New', value: 'one' },
    ]);
    expect(after).toEqual([owners('Ticket', 'DEMO-12'), agents('Branch', 'fix'), owners('Build', '#13'), owners('New', 'one')]);
    // A label written with other capitals is the owner's writing.
    expect(ownerSetFields(before, [{ label: 'branch', value: 'fix' }])).toEqual([owners('branch', 'fix')]);
  });

  it('keeps a suggestion while the value stays, and drops it when the owner changes the value', () => {
    const suggested = { ...owners('Environment', 'staging'), suggested: { value: 'production', at: AT } };
    expect(ownerSetFields([suggested], [{ label: 'Environment', value: 'staging' }])).toEqual([suggested]);
    expect(ownerSetFields([suggested], [{ label: 'Env', value: 'staging' }, { label: 'Environment', value: 'qa' }])).toEqual([owners('Env', 'staging'), owners('Environment', 'qa')]);
    expect(ownerSetFields([suggested], [])).toEqual([]);
  });
});

describe('the owner using a suggestion', () => {
  it('puts the suggested value in place, as the owner’s', () => {
    const before = [agents('Branch', 'fix'), { ...owners('Environment', 'staging'), suggested: { value: 'production', at: AT } }];
    expect(useSuggestedField(before, 'environment')).toEqual({ fields: [agents('Branch', 'fix'), owners('Environment', 'production')] });
    expect(useSuggestedField(before, 'Branch')).toEqual({ problem: 'Nothing was suggested for that field.' });
    expect(useSuggestedField(before, 'Nothing')).toEqual({ problem: 'Nothing was suggested for that field.' });
  });
});

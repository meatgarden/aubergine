import { describe, expect, it } from 'vitest';
import { applyEvent } from './events';
import { Session, createInitialState } from './entities';
import { MAX_FIELDS, TerminalFields, fieldFromLine, lineOfField, type TerminalField } from './fields';
import { newId } from './ids';
import { PatchSessionRequest, UpdateSessionRequest } from './protocol';
import { z } from 'zod';

const problemOf = (line: string): string | null => {
  const read = fieldFromLine(line);
  return 'problem' in read ? read.problem : null;
};
const fieldOf = (line: string): TerminalField | null => {
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
    expect(TerminalFields.parse([{ label: ' Owner ', value: ' Sam ' }])).toEqual([{ label: 'Owner', value: 'Sam' }]);
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
    const fields = [{ label: 'Ticket', value: 'DEMO-12' }];
    const after = applyEvent({ ...initial, sessions: [session] }, { type: 'session.fields', sessionId: session.id, fields });
    expect(after.sessions[0]!.fields).toEqual(fields);
    expect(applyEvent(after, { type: 'session.fields', sessionId: session.id, fields: [] }).sessions[0]!.fields).toEqual([]);
  });
});

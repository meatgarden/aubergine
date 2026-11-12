import { describe, expect, it } from 'vitest';
import type { TerminalClientMessage } from '@aubergine/shared';
import { Outbox } from './outbox';

const key = (data: string): TerminalClientMessage => ({ t: 'input', data });

describe('Outbox', () => {
  it('holds keystrokes typed before the first connection and sends them in order', () => {
    const sent: TerminalClientMessage[] = [];
    const outbox = new Outbox((m) => sent.push(m));
    outbox.send(key('l'), false);
    outbox.send(key('s'), false);
    outbox.send({ t: 'resize', cols: 80, rows: 24 }, false);
    expect(sent).toEqual([]);
    outbox.opened();
    expect(sent).toEqual([key('l'), key('s')]);
    outbox.send(key('\r'), true);
    expect(sent).toEqual([key('l'), key('s'), key('\r')]);
  });

  it('drops keystrokes typed while reconnecting', () => {
    const sent: TerminalClientMessage[] = [];
    const outbox = new Outbox((m) => sent.push(m));
    outbox.opened();
    outbox.send(key('rm -rf x\r'), false);
    outbox.opened();
    expect(sent).toEqual([]);
  });
});

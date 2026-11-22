import { describe, expect, it } from 'vitest';
import { COMMANDS, NOT_AT_THIS_COMPUTER, commandById, offeredHere } from '../commands';
import { terminalActions } from '../panel/sections/terminals';
import { atThisComputer, type AppStore } from '../store';

const session = { state: 'open' } as Parameters<typeof terminalActions>[0];
const where = { here: true, parked: false, canMove: false, hasNotes: false };

describe('what acts on the desktop of the computer Aubergine runs on', () => {
  it("is offered where the server said the page came in under that computer's own name", () => {
    expect(atThisComputer({ here: true })).toBe(true);
    expect(atThisComputer({ here: false })).toBe(false);
  });

  it('leaves "Open on desktop" out of a terminal\'s menu on another device, and nothing else', () => {
    const at = terminalActions(session, { ...where, desktop: true }).map((a) => a.key);
    const away = terminalActions(session, { ...where, desktop: false }).map((a) => a.key);
    expect(at).toContain('desktop');
    expect(away).not.toContain('desktop');
    expect(at.filter((key) => key !== 'desktop')).toEqual(away);
  });

  it('keeps the two commands registered, and offers them only at that computer', () => {
    const only = COMMANDS.filter((command) => command.atThisComputerOnly).map((command) => command.id).sort();
    expect(only).toEqual(['outside.open', 'terminal.openOnDesktop']);
    for (const id of only) {
      const command = commandById(id);
      expect(offeredHere(command, { here: true })).toBe(true);
      expect(offeredHere(command, { here: false })).toBe(false);
    }
    expect(commandById('outside.open').available({ here: false } as AppStore)).toBe(false);
    expect(commandById('outside.open').available({ here: true } as AppStore)).toBe(true);
    expect(COMMANDS.filter((command) => !offeredHere(command, { here: false })).map((c) => c.id).sort()).toEqual(only);
    expect(NOT_AT_THIS_COMPUTER).toMatch(/^Not available on this device/);
  });
});

import { describe, expect, it } from 'vitest';
import { isTerminalReply } from './terminal-replies';

describe('isTerminalReply', () => {
  it('recognises what a terminal sends by itself', () => {
    const replies = [
      '\x1b[?1;2c', // primary device attributes
      '\x1b[>0;276;0c', // secondary device attributes
      '\x1b[0n', // device status
      '\x1b[12;40R', // cursor position
      '\x1b[I', // focus in
      '\x1b[O', // focus out
      '\x1b[?2004;1$y', // a mode report
      '\x1b]11;rgb:1010/1111/1414\x07', // background color
      '\x1b]10;rgb:d7d7/dada/e0e0\x1b\\',
      '\x1bP>|xterm.js(6.0.0)\x1b\\', // terminal name
      '\x1b[8;24;80t', // window size
      '\x1b[?1;2c\x1b[>0;276;0c\x1b[I', // several at once
    ];
    for (const reply of replies) expect(isTerminalReply(reply), JSON.stringify(reply)).toBe(true);
  });

  it('counts everything a person can do as typing', () => {
    const typed = [
      'a',
      'echo hello\r',
      '\r',
      '\t',
      '\x03', // Ctrl+C
      '\x1b', // Escape
      '\x1b[A', // arrow up
      '\x1b[1;3D', // Option+Left
      '\x1b[Z', // Shift+Tab
      '\x1bb', // Alt+b
      '\x1b[200~pasted text\x1b[201~', // a bracketed paste
      '\x1b[3~', // Delete
      '\x1bOP', // F1
      '\x1b[I and then text', // a report followed by typing
      'x\x1b[I',
      '',
    ];
    for (const input of typed.slice(0, -1)) expect(isTerminalReply(input), JSON.stringify(input)).toBe(false);
    expect(isTerminalReply('')).toBe(false);
  });
});

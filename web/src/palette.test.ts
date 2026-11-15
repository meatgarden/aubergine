import { describe, expect, it } from 'vitest';
import { newId, type Canvas } from '@aubergine/shared';
import { COMMANDS } from './commands';
import { paletteStep, parseQuery, searchCanvases, searchCommands } from './palette';

const canvas = (name: string, order: number): Canvas => ({
  id: newId(),
  projectId: newId(),
  name,
  color: 'none',
  order,
  labels: {},
  createdAt: '2026-01-01T00:00:00.000Z',
  layout: { nodes: [], frames: [] },
});
const canvases = [canvas('Main', 0), canvas('Deploys', 1), canvas('Design work', 2)];

describe('parseQuery', () => {
  it('takes ">" in front to mean commands only', () => {
    expect(parseQuery('>park')).toEqual({ commandsOnly: true, text: 'park' });
    expect(parseQuery(' > new canvas ')).toEqual({ commandsOnly: true, text: 'new canvas' });
    expect(parseQuery('>')).toEqual({ commandsOnly: true, text: '' });
    expect(parseQuery('api > logs')).toEqual({ commandsOnly: false, text: 'api > logs' });
    expect(parseQuery('')).toEqual({ commandsOnly: false, text: '' });
  });
});

describe('searchCommands', () => {
  it('lists every command but the one that opens the palette when nothing is typed', () => {
    const all = searchCommands(COMMANDS, '');
    expect(all).toHaveLength(COMMANDS.length - 1);
    expect(all.some((c) => c.id === 'palette.toggle')).toBe(false);
  });

  it('needs every word, and puts matches in the title first', () => {
    expect(searchCommands(COMMANDS, 'new canvas').map((c) => c.id)[0]).toBe('canvas.new');
    expect(searchCommands(COMMANDS, 'park').map((c) => c.id).slice(0, 2)).toEqual(['terminal.park', 'parked.restoreLast']);
    expect(searchCommands(COMMANDS, 'waiting')[0]?.id).toBe('attention.next');
    // Found by its name too, as it is written in the settings file.
    expect(searchCommands(COMMANDS, 'view.fit').map((c) => c.id)).toEqual(['view.fit']);
    expect(searchCommands(COMMANDS, 'zebra crossing')).toEqual([]);
  });
});

describe('searchCanvases', () => {
  it('matches names, in tab order', () => {
    expect(searchCanvases(canvases, '').map((c) => c.name)).toEqual(['Main', 'Deploys', 'Design work']);
    expect(searchCanvases(canvases, 'de').map((c) => c.name)).toEqual(['Deploys', 'Design work']);
    expect(searchCanvases(canvases, 'work design').map((c) => c.name)).toEqual(['Design work']);
  });
});

describe('paletteStep', () => {
  it('turns a digit or a bracket into a canvas command only while nothing is typed', () => {
    expect(paletteStep('', '2')).toBe('canvas.go.2');
    expect(paletteStep('', '9')).toBe('canvas.go.9');
    expect(paletteStep('', '[')).toBe('canvas.previous');
    expect(paletteStep('', ']')).toBe('canvas.next');
    expect(paletteStep('', '0')).toBeNull();
    expect(paletteStep('', 'a')).toBeNull();
    expect(paletteStep('port 808', '2')).toBeNull();
    expect(paletteStep('list[', ']')).toBeNull();
  });
});

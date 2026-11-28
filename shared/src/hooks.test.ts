import { describe, expect, it } from 'vitest';
import { ATTRIBUTE_HOOKS, PART_HOOKS, PART_NAMES, ROOT_HOOKS, TERMINAL_PARTS, TOKEN_HOOKS, UI_HOOKS, hooksReferencePage, isPartName, writtenHook } from './hooks';
import { asksPlain, customCssHref, customCssStarter, plainHref } from './custom-css';
import { THEME_COLORS } from './themes';

describe('the hooks', () => {
  it('are one list of four kinds, each name once in its kind, and every part an attribute is on is a part', () => {
    expect(UI_HOOKS).toHaveLength(TOKEN_HOOKS.length + ROOT_HOOKS.length + PART_HOOKS.length + ATTRIBUTE_HOOKS.length);
    for (const kind of ['token', 'root', 'part', 'attribute'] as const) {
      const names = UI_HOOKS.filter((hook) => hook.kind === kind).map((hook) => hook.name);
      expect(new Set(names).size, kind).toBe(names.length);
      expect(names.length, kind).toBeGreaterThan(0);
    }
    for (const hook of ATTRIBUTE_HOOKS) for (const part of hook.on) expect(isPartName(part), `${hook.name} on ${part}`).toBe(true);
    for (const part of TERMINAL_PARTS) expect(PART_NAMES).toContain(part);
  });

  it('name their parts short and plain, and the attributes as attributes', () => {
    for (const part of PART_NAMES) expect(part).toMatch(/^[a-z]+(-[a-z]+)*$/);
    for (const hook of [...ROOT_HOOKS, ...ATTRIBUTE_HOOKS]) expect(hook.name).toMatch(/^data-[a-z]+(-[a-z]+)*$/);
    for (const hook of [...ROOT_HOOKS, ...PART_HOOKS, ...ATTRIBUTE_HOOKS]) expect(hook.says, hook.name).toMatch(/\.$/);
  });

  it('hold every part the brief promised, and every token the colors of a theme are', () => {
    for (const part of ['top-bar', 'canvas-tabs', 'canvas-tab', 'side-panel', 'terminal-list', 'terminal-row', 'terminal', 'terminal-title', 'terminal-body', 'terminal-note', 'canvas', 'canvas-bar', 'map', 'details', 'frame', 'page', 'dialog', 'menu', 'toast', 'focus-head', 'focus-body']) expect(PART_NAMES).toContain(part);
    const tokens = TOKEN_HOOKS.map((hook) => hook.name);
    for (const color of THEME_COLORS) expect(tokens, color).toContain(color);
    for (const color of THEME_COLORS) expect(TOKEN_HOOKS.find((hook) => hook.name === color)?.color, color).toBe(true);
    expect(TOKEN_HOOKS.find((hook) => hook.name === 'space-4')).toMatchObject({ color: false, group: 'space' });
    expect(TOKEN_HOOKS.find((hook) => hook.name === 'shadow-menu')).toMatchObject({ group: 'shadow' });
  });

  it('are written in a stylesheet as a property, a part or an attribute', () => {
    expect(writtenHook(TOKEN_HOOKS[0]!)).toBe(`var(--${TOKEN_HOOKS[0]!.name})`);
    expect(writtenHook(PART_HOOKS[0])).toBe('[data-part="top-bar"]');
    expect(writtenHook(ROOT_HOOKS[0])).toBe('[data-theme]');
  });

  it('make the reference: every hook named in it, and what is not promised said', () => {
    const page = hooksReferencePage();
    for (const hook of UI_HOOKS) expect(page, hook.name).toContain(hook.kind === 'token' ? `\`--${hook.name}\`` : `\`${hook.name}\``);
    expect(page).toMatch(/Not promised:\*\* class names, test IDs/);
    expect(page).toMatch(/only ever added; none is renamed or removed/);
  });
});

describe('the starter stylesheet', () => {
  it('lists every hook in a comment, and switches nothing on', () => {
    const text = customCssStarter();
    for (const hook of UI_HOOKS) expect(text, hook.name).toContain(hook.name);
    expect(text.replace(/\/\*[\s\S]*?\*\//g, '').trim()).toBe('');
  });
});

describe('the addresses', () => {
  it('link the stylesheet by its version, and the page without it by ?plain', () => {
    expect(customCssHref('0123456789ab')).toBe('/api/v1/custom.css?v=0123456789ab');
    expect(plainHref('http://127.0.0.1:4600/c/abc')).toBe('http://127.0.0.1:4600/c/abc?plain');
    expect(plainHref('http://127.0.0.1:4600/c/abc?x=1#pair=CODE')).toBe('http://127.0.0.1:4600/c/abc?x=1&plain');
    expect(plainHref('http://127.0.0.1:4600/?plain')).toBe('http://127.0.0.1:4600/?plain');
    expect(asksPlain('?plain')).toBe(true);
    expect(asksPlain('?x=1&plain=yes')).toBe(true);
    expect(asksPlain('?plainly')).toBe(false);
    expect(asksPlain('')).toBe(false);
  });
});

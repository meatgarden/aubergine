import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, Settings } from './settings';

describe('Settings', () => {
  it('fills in defaults for everything left out', () => {
    expect(Settings.parse({})).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toMatchObject({ theme: 'dark', shell: null, defaultFolder: null });
    expect(DEFAULT_SETTINGS.font.size).toBe(13);
    expect(DEFAULT_SETTINGS.agents.logPrompts).toBe(true);
    expect(DEFAULT_SETTINGS.agents.claudeCommand).toBe('claude');
    expect(Settings.safeParse({ agents: { claudeCommand: '   ' } }).success).toBe(false);
    expect(Settings.parse({ font: { size: 15 } }).font).toEqual({ ...DEFAULT_SETTINGS.font, size: 15 });
  });

  it('accepts a full file', () => {
    const full = {
      font: { family: 'JetBrains Mono, monospace', size: 14 },
      theme: 'light',
      shell: '/bin/bash',
      defaultFolder: '~/work',
      agents: { logPrompts: false, claudeCommand: 'mytool launch -- claude' },
    };
    expect(Settings.parse(full)).toEqual(full);
  });

  it('rejects values that cannot work', () => {
    expect(Settings.safeParse({ theme: 'sepia' }).success).toBe(false);
    expect(Settings.safeParse({ font: { size: 2 } }).success).toBe(false);
    expect(Settings.safeParse({ shell: 'bash' }).success).toBe(false);
    expect(Settings.safeParse({ font: { family: '  ' } }).success).toBe(false);
  });
});

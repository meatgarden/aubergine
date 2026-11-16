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
      away: { afterMinutes: 45 },
      agents: { logPrompts: false, claudeCommand: 'mytool launch -- claude' },
      api: { rateLimitPerMinute: 120, maxBodyBytes: 65536, activityLogMaxBytes: 1048576 },
      workflows: { maxElements: 12, maxElementChars: 4000, quietAfterSeconds: 120 },
      terminal: { protectNewSessions: true, protectAgentSessions: false, inputCallsPerMinute: 10, inputCharsPerCall: 500, inputCharsPerMinute: 2000, maxWaitingRuns: 2, auditInput: true },
      messages: { perSenderPerMinute: 3, perPairPerHour: 12, pauseAfter: 4, maxUnread: 5, nudgeIntervalSeconds: 60, keepDays: 7, logMaxBytes: 65536 },
      shortcuts: { 'terminal.park': 'X', 'view.fit': null },
      shortcutsInAppWindow: { 'canvas.go.1': ['Meta+1'] },
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

import { z } from 'zod';
import { ShortcutSettings } from './shortcuts';
import { Appearance } from './themes';

export const DEFAULT_FONT_FAMILY = 'Menlo, Monaco, "DejaVu Sans Mono", Consolas, monospace';

/**
 * User settings, kept as `config.json` in the data folder. Every field is
 * optional in the file; anything left out takes its default.
 */
/** The three choices of how the page looks. */
export const THEMES = ['light', 'dark', 'system'] as const;
export const ThemeSetting = z.enum(THEMES);
export type ThemeSetting = z.infer<typeof ThemeSetting>;
export const THEME_WORDS: Record<ThemeSetting, string> = { light: 'Light', dark: 'Dark', system: 'Match the system' };
/** The theme that is drawn: the one chosen, or for "match the system" the one the system has. */
export const themeShown = (setting: ThemeSetting, systemIsLight: boolean): 'light' | 'dark' => (setting === 'system' ? (systemIsLight ? 'light' : 'dark') : setting);

export const Settings = z.object({
  font: z
    .object({
      family: z.string().trim().min(1).max(300).default(DEFAULT_FONT_FAMILY).describe('The fonts of a terminal’s text, as a CSS font-family list: the first one found is used.'),
      size: z.number().int().min(8).max(32).default(13).describe('The size of a terminal’s text, in pixels.'),
    })
    .prefault({})
    .describe('A terminal’s text.'),
  theme: ThemeSetting.default('system').describe('Light, dark, or whichever the system is set to (`system`), following it when that changes.'),
  appearance: Appearance.catch(() => Appearance.parse({}))
    .prefault({})
    .describe('How the page looks beyond light or dark: the color theme of each, a terminal’s theme and cursor, and colors set by hand.'),
  shell: z.string().startsWith('/').nullable().default(null).describe('The whole path of the shell new terminals start. Null: your own `$SHELL`.'),
  defaultFolder: z.string().min(1).nullable().default(null).describe('The folder new terminals start in (`~` may begin it). Null: the home folder.'),
  away: z
    .object({
      afterMinutes: z.number().int().min(0).max(10_080).default(30).describe('After this many minutes without the page being looked at, coming back shows what changed meanwhile. 0 switches that off.'),
    })
    .prefault({})
    .describe('What changed while you were away.'),
  agents: z
    .object({
      logPrompts: z.boolean().default(true).describe('Keep the prompts given to agents in the terminal’s note log. Turn this off if prompts may hold secrets.'),
      claudeCommand: z
        .string()
        .trim()
        .min(1)
        .max(1000)
        .default('claude')
        .describe('The command line that starts Claude Code. It may be a whole launcher, such as `mytool launch -- claude`; Aubergine’s own flags are added at the end, or where `{flags}` is.'),
    })
    .prefault({})
    .describe('Agents Aubergine starts.'),
  api: z
    .object({
      rateLimitPerMinute: z.number().int().min(1).max(100_000).default(600).describe('How many calls one API token may make in a minute.'),
      maxBodyBytes: z
        .number()
        .int()
        .min(1024)
        .max(64 * 1024 * 1024)
        .default(1024 * 1024)
        .describe('The largest request body the server takes, in bytes.'),
      activityLogMaxBytes: z
        .number()
        .int()
        .min(4096)
        .max(1024 * 1024 * 1024)
        .default(5 * 1024 * 1024)
        .describe('How large the activity log may grow before its older half is dropped, in bytes.'),
    })
    .prefault({})
    .describe('Limits on calls made with API tokens. They apply from the next start of the server.'),
  workflows: z
    .object({
      maxElements: z.number().int().min(1).max(200).default(50).describe('How many steps one workflow may have.'),
      maxElementChars: z.number().int().min(100).max(100_000).default(20_000).describe('How long the text of one step (or the text for every step) may be, in characters.'),
      quietAfterSeconds: z.number().int().min(10).max(86_400).default(300).describe('A running run is marked quiet when its terminal has printed for this many seconds after the last report.'),
    })
    .prefault({})
    .describe('Limits on workflows, and when a run counts as quiet.'),
  library: z
    .object({
      fetchTimeoutSeconds: z.number().int().min(5).max(3600).default(60).describe('The longest one Git command of a refresh may run, in seconds.'),
      maxFetchMegabytes: z.number().int().min(1).max(10_000).default(100).describe('The largest file Git may write while fetching, in megabytes: a source that needs more is refused.'),
    })
    .prefault({})
    .describe('The library: how long and how much a fetch of a Git source may take. They apply from the next start of the server.'),
  messages: z
    .object({
      perSenderPerMinute: z.number().int().min(1).max(1000).default(6).describe('How many messages one sender may send in a minute, to anyone.'),
      perPairPerHour: z.number().int().min(1).max(10_000).default(30).describe('How many messages may pass between the same two in an hour, both ways together.'),
      pauseAfter: z.number().int().min(1).max(1000).default(6).describe('After this many messages between two that are not the owner, without the owner having looked, the thread pauses.'),
      maxUnread: z.number().int().min(1).max(1000).default(20).describe('How many unread messages a terminal may have waiting. One more is refused.'),
      nudgeIntervalSeconds: z.number().int().min(1).max(86_400).default(120).describe('The fixed sentence that says a message is waiting is not typed into the same terminal again within this many seconds.'),
      keepDays: z.number().int().min(1).max(3650).default(30).describe('Read messages older than this many days are left out of what is listed.'),
      logMaxBytes: z
        .number()
        .int()
        .min(4096)
        .max(1024 * 1024 * 1024)
        .default(4 * 1024 * 1024)
        .describe('How large the file of messages may grow before its older part is set aside, in bytes.'),
    })
    .prefault({})
    .describe('Messages between terminals: how many, how often, and when a thread waits for the owner. They apply from the next start of the server.'),
  describe: z
    .object({
      remind: z.boolean().default(true).describe('Whether an agent that stops with its terminal not named, or with no summary, is told once to set them.'),
      pullRequests: z.boolean().default(true).describe('Whether the pull request of a terminal’s branch is asked of the `gh` tool, where that is installed and signed in.'),
    })
    .prefault({})
    .describe('What a terminal says about itself.'),
  desktop: z
    .object({
      app: z
        .string()
        .regex(/^[a-z][a-z0-9-]{0,39}$/)
        .nullable()
        .default(null)
        .describe('Which application opens a terminal on the desktop: `terminal` or `iterm` (macOS), or `command` for a command line of your own. Null: the usual one for this system, `terminal` on macOS, and `command` elsewhere once one is written.'),
      command: z.string().max(1000).nullable().default(null).describe('For `command`: the command line, with `{file}` where the script file goes. It is started without a shell.'),
      openNew: z.boolean().default(false).describe('New terminals made in the page also open on the desktop.'),
    })
    .prefault({})
    .describe('Opening a canvas terminal in your own terminal application.'),
  schedules: z
    .object({
      lateWithinHours: z
        .number()
        .min(0)
        .max(24)
        .default(6)
        .describe('A time that passed while the server was stopped or the computer asleep still runs, marked late, when it is at most this many hours old; older, it is missed. 0: never late. It applies from the next start of the server.'),
    })
    .prefault({})
    .describe('Schedules.'),
  terminal: z
    .object({
      protectNewSessions: z.boolean().default(false).describe('New terminals are “people only” from the start.'),
      protectAgentSessions: z.boolean().default(true).describe('New terminals that start an agent are “people only” from the start: a token typing into an agent is the riskiest case.'),
      inputCallsPerMinute: z.number().int().min(1).max(10_000).default(60).describe('How many input calls one token may make to one terminal in a minute.'),
      inputCharsPerCall: z.number().int().min(1).max(20_000).default(4000).describe('How many characters one input call may carry.'),
      inputCharsPerMinute: z.number().int().min(1).max(1_000_000).default(20_000).describe('How many characters one token may type into one terminal in a minute.'),
      maxWaitingRuns: z.number().int().min(1).max(100).default(8).describe('How many commands may be waited for at once, over all terminals.'),
      auditInput: z.boolean().default(false).describe('Keep the text that tokens type, itself, in `input.log` in the data folder. Off: only its length and a fingerprint are recorded.'),
    })
    .prefault({})
    .describe('Terminal access for programs with an API token: what is people only from the start, the limits, and the audit of typed text.'),
  /**
   * Read when the server starts; no route writes them. An entry that is wrong is reported and skipped
   * (`accessProblem`); a list that is not a list is reported and taken as empty, and the rest of the file still counts.
   */
  access: z
    .object({
      addresses: z.array(z.unknown()).max(20).catch([]).default([]).describe('HTTPS origins this server also answers under, through something on this computer that carries HTTPS to it. Read when the server starts.'),
      pages: z.array(z.unknown()).max(20).catch([]).default([]).describe('Origins of the pages of another Aubergine that may show this server. Read when the server starts.'),
    })
    .catch({ addresses: [], pages: [] })
    .prefault({})
    .describe('Reaching this server from another device or page. Written by hand only; a wrong entry is reported and skipped.'),
  shortcuts: ShortcutSettings.default({}).describe('Keys: a command’s name to a chord (`"Ctrl+Meta+J"`), a list of chords, or null for no key. A wrong entry is reported and skipped.'),
  shortcutsInAppWindow: ShortcutSettings.default({}).describe('Keys as `shortcuts`, applied over them only in a window of its own (an installed app).'),
});
export type Settings = z.infer<typeof Settings>;

export const DEFAULT_SETTINGS: Settings = Settings.parse({});

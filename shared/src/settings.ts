import { z } from 'zod';
import { ShortcutSettings } from './shortcuts';

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
      /** CSS font-family list for terminals. */
      family: z.string().trim().min(1).max(300).default(DEFAULT_FONT_FAMILY),
      /** Terminal font size in pixels. */
      size: z.number().int().min(8).max(32).default(13),
    })
    .prefault({}),
  /** Light, dark, or whichever the system is set to (and following it when that changes). A file that says dark or light keeps meaning that. */
  theme: ThemeSetting.default('system'),
  /** Absolute path of the shell to start. `null` means the user's own `$SHELL`. */
  shell: z.string().startsWith('/').nullable().default(null),
  /** Folder new terminals start in (`~` is allowed). `null` means the home folder. */
  defaultFolder: z.string().min(1).nullable().default(null),
  away: z
    .object({
      /** After this many minutes without the page being looked at, coming back shows what changed meanwhile. 0 switches that off. */
      afterMinutes: z.number().int().min(0).max(10_080).default(30),
    })
    .prefault({}),
  agents: z
    .object({
      /**
       * Keep the prompts given to agents in the session's note log. Turn this
       * off if prompts may contain secrets.
       */
      logPrompts: z.boolean().default(true),
      /**
       * The command line that starts Claude Code. It may be a whole launcher,
       * such as `mytool launch -- claude`. Aubergine's own flags are added at
       * the end, or where `{flags}` appears.
       */
      claudeCommand: z.string().trim().min(1).max(1000).default('claude'),
    })
    .prefault({}),
  /** Limits on calls made with API tokens. They apply from the next start of the server. */
  api: z
    .object({
      /** How many calls one token may make in a minute. */
      rateLimitPerMinute: z.number().int().min(1).max(100_000).default(600),
      /** The largest request body the server accepts, in bytes. */
      maxBodyBytes: z.number().int().min(1024).max(64 * 1024 * 1024).default(1024 * 1024),
      /** How large the activity log may grow before the older half is dropped, in bytes. */
      activityLogMaxBytes: z.number().int().min(4096).max(1024 * 1024 * 1024).default(5 * 1024 * 1024),
    })
    .prefault({}),
  /** Limits on workflows, and when a run counts as quiet. */
  workflows: z
    .object({
      /** How many elements one workflow may have. */
      maxElements: z.number().int().min(1).max(200).default(50),
      /** How long the text of one element (or the standing text) may be, in characters. */
      maxElementChars: z.number().int().min(100).max(100_000).default(20_000),
      /** A running run is marked quiet when its session has printed this many seconds after the last report. */
      quietAfterSeconds: z.number().int().min(10).max(86_400).default(300),
    })
    .prefault({}),
  /** The library: how long and how much a fetch of a Git source may take. They apply from the next start of the server. */
  library: z
    .object({
      /** The longest one Git command of a refresh may run, in seconds. */
      fetchTimeoutSeconds: z.number().int().min(5).max(3600).default(60),
      /** The largest file Git may write while fetching, in megabytes: a source that needs more is refused. */
      maxFetchMegabytes: z.number().int().min(1).max(10_000).default(100),
    })
    .prefault({}),
  /** Messages between sessions: how many, how often, and when a thread waits for the owner. They apply from the next start of the server. */
  messages: z
    .object({
      /** How many messages one sender may send in a minute, to anyone. */
      perSenderPerMinute: z.number().int().min(1).max(1000).default(6),
      /** How many messages may pass between the same two in an hour, both ways together. */
      perPairPerHour: z.number().int().min(1).max(10_000).default(30),
      /** After this many messages between two that are not the owner, without the owner having looked, the thread pauses. */
      pauseAfter: z.number().int().min(1).max(1000).default(6),
      /** How many unread messages a session may have waiting. One more is refused. */
      maxUnread: z.number().int().min(1).max(1000).default(20),
      /** The fixed sentence that says a message is waiting is not typed into the same terminal again within this many seconds. */
      nudgeIntervalSeconds: z.number().int().min(1).max(86_400).default(120),
      /** Read messages older than this many days are left out of what is listed. */
      keepDays: z.number().int().min(1).max(3650).default(30),
      /** How large the file of messages may grow before the older part is set aside, in bytes. */
      logMaxBytes: z.number().int().min(4096).max(1024 * 1024 * 1024).default(4 * 1024 * 1024),
    })
    .prefault({}),
  /** What a terminal says about itself. */
  describe: z
    .object({
      /** Whether an agent that stops with its terminal not named, or with no summary, is told once to set them. The page changes this one. */
      remind: z.boolean().default(true),
      /** Whether the pull request of a terminal's branch is asked of the `gh` tool, where that is installed and signed in. Written by hand. */
      pullRequests: z.boolean().default(true),
    })
    .prefault({}),
  /** Opening a canvas terminal in the owner's own terminal application. */
  desktop: z
    .object({
      /**
       * Which application: `terminal` or `iterm` (macOS), or `command` for a command line of your own. Null: the
       * usual one for this system, which is `terminal` on macOS, and `command` elsewhere once one is written.
       */
      app: z
        .string()
        .regex(/^[a-z][a-z0-9-]{0,39}$/)
        .nullable()
        .default(null),
      /** For `command`: the command line, with `{file}` where the script file goes. Started without a shell. */
      command: z.string().max(1000).nullable().default(null),
      /** New terminals made in the page also open on the desktop. */
      openNew: z.boolean().default(false),
    })
    .prefault({}),
  /** Schedules. */
  schedules: z
    .object({
      /**
       * A time that passed while the server was stopped or the computer asleep still runs, marked late, when it is
       * at most this many hours old. Older than that it does not run and its row says it was missed. 0: never late.
       */
      lateWithinHours: z.number().min(0).max(24).default(6),
    })
    .prefault({}),
  /** Terminal access for programs with an API token: what is protected by default, the limits, and the audit of typed text. */
  terminal: z
    .object({
      /** New sessions are "people only" from the start. */
      protectNewSessions: z.boolean().default(false),
      /** New sessions that start an agent are "people only" from the start: a token typing into an agent is the riskiest case. */
      protectAgentSessions: z.boolean().default(true),
      /** How many input calls one token may make to one session in a minute. */
      inputCallsPerMinute: z.number().int().min(1).max(10_000).default(60),
      /** How many characters one input call may carry. */
      inputCharsPerCall: z.number().int().min(1).max(20_000).default(4000),
      /** How many characters one token may type into one session in a minute. */
      inputCharsPerMinute: z.number().int().min(1).max(1_000_000).default(20_000),
      /** How many runs may be waited for at once, over all sessions. */
      maxWaitingRuns: z.number().int().min(1).max(100).default(8),
      /** Keep the text that tokens type, itself, in `input.log` in the data folder. Off: only its length and a fingerprint are recorded. */
      auditInput: z.boolean().default(false),
    })
    .prefault({}),
  /**
   * Keys: command name to a chord (`"Ctrl+Meta+J"`), a list of chords, or
   * `null` for no key. Entries that are wrong are reported and skipped.
   */
  shortcuts: ShortcutSettings.default({}),
  /** The same, applied on top only in a window of its own (an installed app). */
  shortcutsInAppWindow: ShortcutSettings.default({}),
});
export type Settings = z.infer<typeof Settings>;

export const DEFAULT_SETTINGS: Settings = Settings.parse({});

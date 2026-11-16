import { z } from 'zod';
import { ShortcutSettings } from './shortcuts';

export const DEFAULT_FONT_FAMILY = 'Menlo, Monaco, "DejaVu Sans Mono", Consolas, monospace';

/**
 * User settings, kept as `config.json` in the data folder. Every field is
 * optional in the file; anything left out takes its default.
 */
export const Settings = z.object({
  font: z
    .object({
      /** CSS font-family list for terminals. */
      family: z.string().trim().min(1).max(300).default(DEFAULT_FONT_FAMILY),
      /** Terminal font size in pixels. */
      size: z.number().int().min(8).max(32).default(13),
    })
    .prefault({}),
  theme: z.enum(['dark', 'light']).default('dark'),
  /** Absolute path of the shell to start. `null` means the user's own `$SHELL`. */
  shell: z.string().startsWith('/').nullable().default(null),
  /** Folder new terminals start in (`~` is allowed). `null` means the home folder. */
  defaultFolder: z.string().min(1).nullable().default(null),
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

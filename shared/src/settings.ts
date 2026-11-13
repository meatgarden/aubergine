import { z } from 'zod';

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
});
export type Settings = z.infer<typeof Settings>;

export const DEFAULT_SETTINGS: Settings = Settings.parse({});

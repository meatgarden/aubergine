import { aubergineCommand } from '../agents/claude-code';

export const HOOK_START = '# >>> aubergine: new terminal tabs start on the canvas >>>';
export const HOOK_END = '# <<< aubergine <<<';

/**
 * A snippet for the user to add to their own `.zshrc`, by hand. With it, a
 * new interactive terminal tab starts inside a new canvas session.
 *
 * It is written so that it can never leave someone without a shell: it only
 * acts in an interactive terminal that is not already inside Aubergine or
 * tmux, it can be switched off with a variable, and if anything at all goes
 * wrong (the server is stopped or slow, the command is missing or fails) the
 * normal shell simply carries on.
 */
export function zshHookSnippet(command: string = aubergineCommand()): string {
  return `${HOOK_START}
# Remove these lines to undo. For one plain tab, run:  AUBERGINE_DISABLE=1 zsh
if [[ -o interactive && -t 0 && -t 1 && -z "$AUBERGINE_DISABLE" && -z "$AUBERGINE_SESSION_ID" && -z "$TMUX" ]]; then
  if ${command} here --from-shell-hook; then
    # The tab was a view of its canvas session until now. The session lives on.
    exit
  fi
  # No canvas this time: carry on as a normal shell, and leave shells started from here alone too.
  export AUBERGINE_DISABLE=1
fi
${HOOK_END}`;
}

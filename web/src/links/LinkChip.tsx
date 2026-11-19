import { KIND_WORDS, middleCut, showControl, splitAddresses, tellLink, type FoundPullRequest, type LinkKind } from '@aubergine/shared';
import type { ReactNode } from 'react';

/**
 * A link as a chip: the two letters of its kind, a short label cut in the middle where it is long, and nothing of
 * the address itself, which is in the tooltip. Pressing it opens the address, exactly as stored, in a new tab. This
 * is the one way a link is drawn: in the details, a terminal's title, a note and the owner's list.
 */
export function LinkChip({ url, kind, label, about, state, markOnly = false, testid = 'link-chip' }: { url: string; kind: LinkKind; label: string; about?: string | undefined; state?: FoundPullRequest['state'] | undefined; markOnly?: boolean; testid?: string }) {
  const words = KIND_WORDS[kind];
  const shown = showControl(label);
  return (
    <a
      className={`ui-chip link-chip${markOnly ? ' is-mark' : ''}`}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={[`${words.name}: ${shown}`, about, showControl(url)].filter(Boolean).join('\n')}
      aria-label={`${words.name}: ${shown}${state ? `, ${state}` : ''}`}
      // A chip in a terminal's title or a row is pressed for itself, not for what it stands in.
      onClick={(event) => event.stopPropagation()}
      data-testid={testid}
      data-kind={kind}
    >
      <span className="link-mark" aria-hidden="true">
        {words.mark}
      </span>
      {!markOnly && <span className="link-label">{middleCut(shown)}</span>}
      {!markOnly && state && (
        <span className={`link-state is-${state}`} data-testid="link-state">
          {state}
        </span>
      )}
    </a>
  );
}

/** A text with the addresses in it drawn as chips. The text itself is as it was stored; what is not an address is drawn as it is. */
export function WithLinks({ text }: { text: string }): ReactNode {
  const pieces = splitAddresses(text);
  if (!pieces.some((piece) => 'address' in piece)) return text;
  return pieces.map((piece, index) => {
    if ('text' in piece) return <span key={index}>{piece.text}</span>;
    const told = tellLink(piece.address);
    return <LinkChip key={index} url={piece.address} kind={told.kind} label={told.label} testid="inline-link" />;
  });
}

/** Whether a text has an address in it that would be drawn as a chip. */
export const hasAddress = (text: string): boolean => splitAddresses(text).some((piece) => 'address' in piece);

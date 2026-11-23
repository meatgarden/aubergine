import { useEffect, useState } from 'react';
import { GROUP_LINKS_OVER, KIND_WORDS, LINK_KINDS, LINK_LABEL_MAX, addressProblem, ago, groupedLinks, showControl, sortedLinks, tellLink, type LinkKind, type SeenLink, type SessionLink } from '@aubergine/shared';
import { api } from '../api';
import { useApp } from '../store';
import { MenuButton, MenuItem } from '../ui';
import { LinkChip } from './LinkChip';

/** Who added a link and when, in words, for its tooltip. */
function addedBy(link: SessionLink, now: number): string {
  const who = link.source === 'owner' ? 'you' : link.source === 'agent' ? (link.by ? showControl(link.by) : 'the agent') : link.fromTerminal ? 'Aubergine, seen in this terminal' : 'Aubergine';
  return `Added by ${who}, ${ago(link.at, new Date(now))} ago`;
}

/**
 * The links of a terminal, in its details: chips, under three quiet headings where there are more than four, each
 * with a small menu; then the way to add one by hand, and, folded, the addresses that were only seen in the terminal.
 * `typing` says whether this part has the one text box of the details; asking for it is `onTyping`.
 */
export function LinksPart({ sessionId, typing, onTyping }: { sessionId: string; typing: boolean; onTyping: (on: boolean) => void }) {
  const links = useApp((s) => s.app?.sessions.find((x) => x.id === sessionId)?.links) ?? NO_LINKS;
  const [mode, setMode] = useState<{ kind: 'add' } | { kind: 'edit'; id: string } | null>(null);
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<LinkKind>('link');
  const [problem, setProblem] = useState<string | null>(null);
  const [seen, setSeen] = useState<SeenLink[]>([]);
  const now = Date.now();
  // When the details open on a terminal: the server looks at its folder and its screen again, and says what was seen.
  useEffect(() => {
    let live = true;
    setMode(null);
    setProblem(null);
    void api
      .lookAgain(sessionId)
      .catch(() => null)
      .then(() => api.seenLinks(sessionId))
      .then((answer) => live && setSeen(answer.seen), () => live && setSeen([]));
    return () => {
      live = false;
    };
  }, [sessionId]);
  // Another part of the details took the text box: this one puts its field away.
  useEffect(() => {
    if (!typing) setMode(null);
  }, [typing]);
  const close = (): void => {
    setMode(null);
    setProblem(null);
    onTyping(false);
  };
  const doing = (work: Promise<unknown>, then?: () => void): void => {
    setProblem(null);
    work.then(() => then?.(), (error: unknown) => setProblem((error as Error).message));
  };
  const add = (): void => {
    const why = addressProblem(address);
    if (why) return setProblem(why);
    doing(api.addLink(sessionId, { url: address.trim() }), () => {
      setAddress('');
      close();
    });
  };
  const startEdit = (link: SessionLink): void => {
    setLabel(link.label);
    setKind(link.kind);
    setMode({ kind: 'edit', id: link.id });
    setProblem(null);
    onTyping(true);
  };
  const chip = (link: SessionLink) => (
    <span className="links-item" key={link.id} data-testid="links-item" data-link={link.id}>
      <LinkChip url={link.url} kind={link.kind} label={link.label} about={addedBy(link, now)} />
      <MenuButton more label={`More for ${showControl(link.label)}`} testid="link-more" menuTestid="link-menu" className="link-menu" againstWindow>
        <MenuItem
          onClick={() => {
            void navigator.clipboard.writeText(link.url).then(
              () => useApp.getState().say('Copied the address.'),
              () => setProblem('Could not copy the address.'),
            );
          }}
          data-testid="link-copy"
        >
          Copy address
        </MenuItem>
        <MenuItem onClick={() => startEdit(link)} data-testid="link-edit">
          Edit…
        </MenuItem>
        {link.suggested && (
          <MenuItem hint={`The agent calls it “${showControl(link.suggested.label)}” (${KIND_WORDS[link.suggested.kind].name.toLowerCase()}).`} onClick={() => doing(api.useSuggestion(sessionId, { what: 'link', linkId: link.id }))} data-testid="link-use">
            Use the agent’s words
          </MenuItem>
        )}
        <MenuItem onClick={() => doing(api.removeLink(sessionId, link.id), () => useApp.getState().say(`Removed the link “${showControl(link.label)}”.`, { label: 'Undo', run: () => void api.addLink(sessionId, { url: link.url, label: link.label, kind: link.kind }).catch(() => {}) }))} data-testid="link-remove">
          Remove
        </MenuItem>
      </MenuButton>
    </span>
  );
  const editing = mode?.kind === 'edit' ? links.find((link) => link.id === mode.id) : undefined;
  const kept = new Set(links.map((link) => link.url));
  const unkept = seen.filter((one) => !kept.has(one.url));
  return (
    <section className="links-part" aria-label="Links" data-testid="links-part">
      <h3 className="links-title">Links</h3>
      {links.length === 0 && <p className="links-none">Tickets, threads, designs, documents and pull requests of this work will be listed here.</p>}
      {links.length > GROUP_LINKS_OVER ? (
        groupedLinks(links).map((group) => (
          <div className="links-group" key={group.group} data-testid="links-group" data-group={group.group}>
            <span className="links-group-title">{group.title}</span>
            <span className="links-chips">{group.links.map(chip)}</span>
          </div>
        ))
      ) : links.length > 0 ? (
        <span className="links-chips">{sortedLinks(links).map(chip)}</span>
      ) : null}
      {editing && (
        <form
          className="links-form"
          onSubmit={(event) => {
            event.preventDefault();
            doing(api.changeLink(sessionId, editing.id, { label: label.trim() || tellLink(editing.url).label, kind }), close);
          }}
          data-testid="link-edit-form"
        >
          <input value={label} maxLength={LINK_LABEL_MAX} aria-label="Label of the link" placeholder="A few words for it" autoFocus onChange={(event) => setLabel(event.target.value)} data-testid="link-label" />
          <select value={kind} aria-label="Kind of the link" onChange={(event) => setKind(event.target.value as LinkKind)} data-testid="link-kind">
            {LINK_KINDS.map((one) => (
              <option key={one} value={one}>
                {KIND_WORDS[one].name}
              </option>
            ))}
          </select>
          <button type="submit" data-testid="link-save">
            Save
          </button>
          <button type="button" className="quiet" onClick={close}>
            Cancel
          </button>
        </form>
      )}
      {mode?.kind === 'add' ? (
        <form
          className="links-form"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <input value={address} aria-label="Address of the link" placeholder="Paste or type an address…" autoFocus spellCheck={false} onChange={(event) => setAddress(event.target.value)} onPaste={() => setProblem(null)} data-testid="link-address" />
          <button type="submit" disabled={address.trim() === ''} data-testid="link-add">
            Add
          </button>
          <button type="button" className="quiet" onClick={close}>
            Cancel
          </button>
        </form>
      ) : (
        !editing && (
          <button
            type="button"
            className="quiet ui-start links-add"
            onClick={() => {
              setMode({ kind: 'add' });
              setProblem(null);
              onTyping(true);
            }}
            data-testid="link-add-open"
          >
            Add a link
          </button>
        )
      )}
      {problem && (
        <p className="dialog-error" role="alert" data-testid="link-problem">
          {problem}
        </p>
      )}
      {unkept.length > 0 && (
        <details className="ui-fold links-seen" data-testid="links-seen">
          <summary>Seen in this terminal ({unkept.length})</summary>
          <span className="links-chips">
            {unkept.map((one) => (
              <span className="links-item" key={one.url} data-testid="seen-item">
                <LinkChip url={one.url} kind={one.kind} label={one.label} about="Seen in this terminal, not kept" testid="seen-chip" />
                <button type="button" className="quiet" title="Keep it among this terminal’s links" onClick={() => doing(api.keepSeen(sessionId, one.url), () => setSeen((all) => all.filter((other) => other.url !== one.url)))} data-testid="seen-keep">
                  Keep
                </button>
              </span>
            ))}
          </span>
        </details>
      )}
    </section>
  );
}

const NO_LINKS: SessionLink[] = [];

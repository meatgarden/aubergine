import { BY_TAG_MAX, TAG_MAX_LENGTH, colorThemeShown, normaliseTags, type ThemeByTag } from '@aubergine/shared';
import { useMemo, useState } from 'react';
import { useApp } from '../store';
import { setThemesByTag, useThemeShown } from '../theme';
import { ThemeSelect } from '../TerminalTheme';
import { Button, MenuButton, MenuItem, TextField } from '../ui';

/** A list with one entry moved up or down, or removed. Pure. */
export function movedEntry<T>(list: readonly T[], at: number, by: -1 | 1): T[] {
  const to = at + by;
  if (to < 0 || to >= list.length) return [...list];
  const next = [...list];
  [next[at], next[to]] = [next[to] as T, next[at] as T];
  return next;
}

/** A tag written in a row: trimmed, or null where nothing that can be a tag is written. Pure. */
export function tagOfText(text: string): string | null {
  const tag = text.trim();
  return tag === '' || tag.length > TAG_MAX_LENGTH ? null : tag;
}

/** Every tag a terminal has now, without repeats, in the order of a name: offered while one is written. Pure. */
export function knownTags(sessions: readonly { tags: readonly string[] }[]): string[] {
  return normaliseTags(sessions.flatMap((session) => session.tags)).sort((a, b) => a.localeCompare(b));
}

/**
 * Settings → Appearance, under Terminal theme: the themes of terminals by tag. A row is a tag and a theme; the first
 * row whose tag a terminal has wins, and a terminal's own theme comes before all of them. Which theme a terminal is
 * drawn in is `terminalThemeOf`, and nothing here decides it: this only writes the list (`appearance.byTag`).
 */
export function ByTag() {
  const byTag = useApp((s) => s.settings.appearance.byTag);
  const appearance = useApp((s) => s.settings.appearance);
  const userThemes = useApp((s) => s.themes.themes);
  const sessions = useApp((s) => s.whole?.sessions);
  const shown = useThemeShown();
  const tags = useMemo(() => knownTags(sessions ?? []), [sessions]);
  /** A row being added, not saved until it has a tag. */
  const [draft, setDraft] = useState<ThemeByTag | null>(null);
  const save = (next: ThemeByTag[]): void => setThemesByTag(next);
  const change = (at: number, entry: ThemeByTag): void => save(byTag.map((one, i) => (i === at ? entry : one)));
  const full = byTag.length >= BY_TAG_MAX;
  const takeDraft = (): void => {
    const tag = draft === null ? null : tagOfText(draft.tag);
    if (draft === null || tag === null) return;
    save([...byTag, { tag, theme: draft.theme }]);
    setDraft(null);
  };
  return (
    <div className="appearance-by-tag" data-testid="by-tag">
      <h5 id="appearance-by-tag-heading">By tag</h5>
      <p className="ui-meta" id="appearance-by-tag-says" data-testid="by-tag-says">
        A terminal with one of these tags is drawn in its theme. The first line whose tag it has wins, and a terminal’s own theme comes before all of them.
      </p>
      <datalist id="appearance-by-tag-tags">
        {tags.map((tag) => (
          <option key={tag} value={tag} />
        ))}
      </datalist>
      {byTag.length > 0 && (
        <ul className="appearance-by-tag-rows" aria-labelledby="appearance-by-tag-heading">
          {byTag.map((entry, at) => (
            <li key={`${at} ${entry.tag}`} className="settings-line appearance-by-tag-row" data-testid="by-tag-row" data-tag={entry.tag}>
              <TextField
                className="appearance-by-tag-tag"
                defaultValue={entry.tag}
                maxLength={TAG_MAX_LENGTH}
                list="appearance-by-tag-tags"
                aria-label={`Tag of line ${at + 1}`}
                onBlur={(e) => {
                  const tag = tagOfText(e.target.value);
                  if (tag === null) e.target.value = entry.tag;
                  else if (tag !== entry.tag) change(at, { ...entry, tag });
                }}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                data-testid="by-tag-tag"
              />
              <ThemeSelect className="appearance-by-tag-theme" value={entry.theme} onChange={(theme) => theme !== null && change(at, { ...entry, theme })} aria-label={`Theme of the terminals tagged ${entry.tag}`} data-testid="by-tag-theme" />
              <Button kind="quiet" onClick={() => save(byTag.filter((_, i) => i !== at))} data-testid="by-tag-remove">
                Remove
              </Button>
              <MenuButton label={`More for the line of ${entry.tag}`} more testid="by-tag-more" menuTestid="by-tag-menu" againstWindow>
                <MenuItem disabled={at === 0} title={at === 0 ? 'It is the first already.' : undefined} onClick={() => save(movedEntry(byTag, at, -1))} data-testid="by-tag-up">
                  Move up
                </MenuItem>
                <MenuItem disabled={at === byTag.length - 1} title={at === byTag.length - 1 ? 'It is the last already.' : undefined} onClick={() => save(movedEntry(byTag, at, 1))} data-testid="by-tag-down">
                  Move down
                </MenuItem>
              </MenuButton>
            </li>
          ))}
        </ul>
      )}
      {draft !== null && (
        <div
          className="settings-line appearance-by-tag-row"
          data-testid="by-tag-draft"
          // Taken once the keyboard or the pointer leaves the new line with a tag written in it.
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) takeDraft();
          }}
        >
          <TextField
            className="appearance-by-tag-tag"
            autoFocus
            placeholder="A tag"
            value={draft.tag}
            maxLength={TAG_MAX_LENGTH}
            list="appearance-by-tag-tags"
            aria-label="Tag of the new line"
            onChange={(e) => setDraft({ ...draft, tag: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') takeDraft();
              else if (e.key === 'Escape') {
                e.stopPropagation();
                setDraft(null);
              }
            }}
            data-testid="by-tag-draft-tag"
          />
          <ThemeSelect className="appearance-by-tag-theme" value={draft.theme} onChange={(theme) => theme !== null && setDraft({ ...draft, theme })} aria-label="Theme of the new line" data-testid="by-tag-draft-theme" />
          <Button kind="quiet" onClick={() => setDraft(null)} data-testid="by-tag-draft-remove">
            Remove
          </Button>
        </div>
      )}
      <div className="settings-line">
        {full ? (
          <p className="ui-meta" data-testid="by-tag-full">
            There are {BY_TAG_MAX} lines, as many as there can be. Remove one to add another.
          </p>
        ) : (
          <Button
            kind="quiet"
            className="ui-start"
            disabled={draft !== null}
            onClick={() => setDraft({ tag: '', theme: colorThemeShown(appearance, shown, userThemes) })}
            aria-describedby="appearance-by-tag-says"
            data-testid="by-tag-add"
          >
            Add a rule
          </Button>
        )}
      </div>
    </div>
  );
}

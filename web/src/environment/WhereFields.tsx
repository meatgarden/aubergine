import { useEffect, useState } from 'react';
import type { EnvironmentOffers } from '@aubergine/shared';
import { api } from '../api';
import { useApp } from '../store';

/** Where a new terminal starts: a folder, and the kind of environment it works in. A kind left at null is the server's own choice. */
export interface Where {
  folder: string;
  kind: string | null;
}

/** The folder a dialog proposes: where the selected terminal works, taken back to the owner's own checkout when that terminal is in a copy. */
export function proposedFolder(): string {
  const state = useApp.getState();
  const target = state.selected;
  const session = target ? state.app?.sessions.find((s) => s.id === target) : undefined;
  const environment = target ? state.app?.environments.find((e) => e.sessionId === target) : undefined;
  return environment?.projectFolder ?? session?.cwd ?? '';
}

/**
 * The fields that say where a new terminal works. It knows no kind: it asks
 * the server what there is for the folder that was typed, and shows each
 * kind's own title, its own words for how far it keeps an agent apart, why
 * it cannot be had where it cannot, and what to know before choosing it.
 */
export function WhereFields({ where, onChange }: { where: Where; onChange: (where: Where) => void }) {
  const [offers, setOffers] = useState<EnvironmentOffers | null>(null);
  const [error, setError] = useState<string | null>(null);
  const folder = where.folder.trim();

  // Asked a moment after the typing stops. A timer, not an animation frame.
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (folder !== '' && !folder.startsWith('/')) {
        setOffers(null);
        setError('A folder is given by its whole path, starting with /.');
        return;
      }
      void api.environmentOffers(folder === '' ? undefined : folder).then(
        (found) => {
          if (cancelled) return;
          setError(null);
          setOffers(found as EnvironmentOffers);
        },
        (e: unknown) => !cancelled && setError((e as Error).message),
      );
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [folder]);

  // What was chosen cannot be had for this folder after all: back to the first that can.
  const chosen = offers?.offers.find((offer) => offer.kind === where.kind);
  const first = offers?.offers.find((offer) => offer.available)?.kind ?? null;
  useEffect(() => {
    if (offers && (!chosen || !chosen.available) && where.kind !== first) onChange({ ...where, kind: first });
  }, [offers, chosen, first]); // eslint-disable-line react-hooks/exhaustive-deps -- only when what is offered changes

  return (
    <fieldset className="token-scopes where-fields" data-testid="where-fields">
      <legend>Where it works</legend>
      <label className="wf-field">
        <span>Folder</span>
        <input value={where.folder} placeholder={offers && folder === '' ? offers.folder : 'the folder new terminals start in'} spellCheck={false} onChange={(e) => onChange({ ...where, folder: e.target.value })} data-testid="where-folder" />
      </label>
      {error && <p className="dialog-error">{error}</p>}
      {(offers?.offers ?? []).map((offer) => (
        <label key={offer.kind} className={offer.available ? undefined : 'is-unavailable'} data-testid="where-kind" data-kind={offer.kind} data-available={offer.available}>
          <input type="radio" name="where-kind" checked={where.kind === offer.kind} disabled={!offer.available} onChange={() => onChange({ ...where, kind: offer.kind })} />
          <span>
            <strong>{offer.title}.</strong> {offer.words}
            {!offer.available && offer.reason && (
              <span className="where-reason" data-testid="where-reason">
                {' '}
                Not here: {offer.reason}
              </span>
            )}
            {offer.available && where.kind === offer.kind && offer.notes.length > 0 && (
              <span className="where-notes" data-testid="where-notes">
                {offer.notes.map((note) => (
                  <span key={note}>{note}</span>
                ))}
              </span>
            )}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

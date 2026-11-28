import { useEffect } from 'react';
import { CUSTOM_CSS_FILE, asksPlain, customCssHref, plainHref } from '@aubergine/shared';
import { ownApi } from './api';
import { useApp } from './store';

/**
 * The owner's own stylesheet on the page. The server links it as the last thing in the `<head>` of the page it sends
 * (`data-custom-css`), so that it wins and is there from the first paint; this keeps that link as the settings and the
 * file change, without a reload: switched off, it is taken away; read again with a new version, its address changes
 * and the browser takes the new one; switched on, it is put back last in the head. A page asked for `?plain` never
 * links it, whatever is chosen. The stylesheet is the own server's, whatever server is shown.
 */

/** Whether this page was asked for without the owner's own: read once, as the page was opened; nothing keeps it. */
const PLAIN = typeof location !== 'undefined' && asksPlain(location.search);
export const shownPlain = (): boolean => PLAIN;

/** The address of this page without the owner's own stylesheet. */
export const plainAddress = (): string => plainHref(location.href);

/** What the link should be now: the address to link, or null for none. Pure. */
export function stylesheetLink(version: string | null, on: boolean, plain: boolean): string | null {
  return version !== null && on && !plain ? customCssHref(version) : null;
}

/** Puts the link on the page as it should be: last in the head, at that address, or not at all. */
export function applyStylesheet(href: string | null, head: HTMLElement = document.head): void {
  const links = [...head.querySelectorAll<HTMLLinkElement>('link[data-custom-css]')];
  if (href === null) {
    for (const link of links) link.remove();
    return;
  }
  const [link, ...more] = links;
  for (const extra of more) extra.remove();
  if (link && link.getAttribute('href') === href) return;
  const next = link ?? document.createElement('link');
  next.rel = 'stylesheet';
  next.setAttribute('data-custom-css', '');
  next.setAttribute('href', href);
  // Last in the head, so that it still comes after the app's own stylesheets.
  if (!link) head.appendChild(next);
}

/** Keeps the link as the settings and the file say. Used once, at the root of the app. */
export function useOwnStylesheet(): void {
  const version = useApp((s) => s.customCss.stylesheet?.version ?? null);
  const on = useApp((s) => s.settings.appearance.customCss);
  // Only once the state is read: until then the link the server wrote stands as it is.
  const ready = useApp((s) => s.phase === 'ready');
  useEffect(() => {
    if (ready) applyStylesheet(stylesheetLink(version, on, PLAIN));
  }, [version, on, ready]);
}

/** Reads the owner's stylesheet again, on the own server, and links what it found. The answer is said in one sentence. */
export async function readStylesheetAgain(): Promise<void> {
  try {
    const answer = await ownApi.readStylesheet();
    useApp.getState().setCustomCss(answer);
    const said = answer.stylesheet ? `${CUSTOM_CSS_FILE} is read: ${sizeWords(answer.stylesheet.bytes)}.` : answer.problem ? answer.problem : `There is no ${CUSTOM_CSS_FILE} in the data folder.`;
    useApp.getState().say(said);
  } catch (error) {
    useApp.getState().setNotice(`Your stylesheet could not be read again: ${(error as Error).message}`);
  }
}

/** A file's size in words: bytes under a kilobyte, else kilobytes. Pure. */
export function sizeWords(bytes: number): string {
  if (bytes < 1024) return `${bytes} ${bytes === 1 ? 'byte' : 'bytes'}`;
  return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
}

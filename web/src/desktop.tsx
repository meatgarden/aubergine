import { api, isSuperseded } from './api';
import { atThisComputer, useApp } from './store';

/**
 * Opening a terminal in the owner's own terminal application, as the page
 * does it. One place: the menu's line, the dialogs' box, the node's tool and
 * the row's menu all come here.
 */

const STORAGE_KEY = 'aubergine.hint.desktop-size';

/** Said once, where a window on the desktop is first asked for: the two views are one terminal, with one size. */
export const DESKTOP_SIZE_HINT = 'It is the same terminal in both places, and they share one size: the view you used last sets it. In the other, a smaller view shows part of it and a larger one leaves the rest empty. Closing the window ends nothing.';

/** Whether to say it now. Remembered in this browser at once; where that cannot be remembered, it is not said at all. */
export function shouldSayDesktopSize(storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage()): boolean {
  if (!storage) return false;
  try {
    if (storage.getItem(STORAGE_KEY) !== null) return false;
    storage.setItem(STORAGE_KEY, 'said');
    return true;
  } catch {
    return false;
  }
}

function safeStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** What to tell the owner after a window was asked for: why it could not be, or, the first time, the note about size. Null: nothing. */
export function afterOpening(did: { opened: boolean; says: string }, sayOnce: () => boolean = shouldSayDesktopSize): string | null {
  if (!did.opened) return `Not opened on the desktop: ${did.says}`;
  return sayOnce() ? `Opened on the desktop. ${DESKTOP_SIZE_HINT}` : null;
}

/** "Open on desktop" for a terminal that is running. */
export async function openOnDesktop(sessionId: string): Promise<void> {
  const { setNotice } = useApp.getState();
  try {
    setNotice(afterOpening(await api.openOnDesktop(sessionId)));
  } catch (error) {
    if (isSuperseded(error)) return;
    setNotice(`Not opened on the desktop: ${(error as Error).message}`);
  }
}

/** The line in the menu beside "+ New terminal": shows the setting and changes it. */
export async function setOpenNew(value: boolean): Promise<void> {
  const state = useApp.getState();
  try {
    const now = await api.setDesktopOpenNew(value);
    state.setDesktopOpenNew(now.openNew);
    if (now.openNew && shouldSayDesktopSize()) state.setNotice(`New terminals will also open on the desktop. ${DESKTOP_SIZE_HINT}`);
  } catch (error) {
    if (isSuperseded(error)) return;
    state.setNotice(`The setting was not changed: ${(error as Error).message}`);
  }
}

/** The box a dialog that makes a terminal shows: ticked or not by the setting, and changed there for that one terminal. */
export function DesktopBox({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  // On another device there is no desktop of this computer to open it on.
  const here = useApp(atThisComputer);
  if (!here) return null;
  return (
    <label className="wf-inline" title="A window of your terminal application that shows this same terminal. Closing the window ends nothing.">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid="desktop-box" />
      <span>Also open it on the desktop</span>
    </label>
  );
}

import { needsUser, type ChangeEvent, type Session } from '@aubergine/shared';

/** Sessions waiting for the user, the one that has waited longest first. Parked ones count too. */
export function waitingQueue(sessions: readonly Session[]): Session[] {
  return sessions
    .filter((s) => s.state !== 'exited' && needsUser(s.attention))
    .sort((a, b) => (a.attention.at ?? '').localeCompare(b.attention.at ?? ''));
}

/** The session to jump to next: the first in the queue after `currentId`, wrapping around. */
export function nextWaiting(sessions: readonly Session[], currentId: string | null): Session | null {
  const queue = waitingQueue(sessions);
  if (queue.length === 0) return null;
  const index = queue.findIndex((s) => s.id === currentId);
  return queue[(index + 1) % queue.length] ?? null;
}

const STORAGE_KEY = 'aubergine.notifications';

export function notificationsWanted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on' && 'Notification' in window && Notification.permission === 'granted';
  } catch {
    return false;
  }
}

/**
 * Turns desktop notifications on or off. Must be called from a click: the
 * browser only shows its permission question in answer to one.
 */
export async function setNotificationsWanted(on: boolean): Promise<boolean> {
  try {
    if (!on || !('Notification' in window)) {
      localStorage.setItem(STORAGE_KEY, 'off');
      return false;
    }
    const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    localStorage.setItem(STORAGE_KEY, permission === 'granted' ? 'on' : 'off');
    return permission === 'granted';
  } catch {
    return false;
  }
}

/** What to announce for a change event, if anything: a session has just started waiting for the user. */
export function announcement(
  event: ChangeEvent,
  before: readonly Session[],
): { title: string; body: string; sessionId: string } | null {
  if (event.type !== 'session.attention' || !needsUser(event.attention)) return null;
  const session = before.find((s) => s.id === event.sessionId);
  if (!session || session.attention.state === event.attention.state) return null;
  return {
    sessionId: session.id,
    title: event.attention.state === 'waiting' ? `${session.name} is waiting for you` : `${session.name} has finished`,
    body: event.attention.message ?? '',
  };
}

import { needsUser, sessionsWaiting, type ChangeEvent, type Run, type Session } from '@aubergine/shared';

/**
 * Sessions waiting for the user, the one that has waited longest first. Parked ones count too.
 * A session with a message for the owner, or with a thread that is paused until the owner has looked, waits as well.
 */
export function waitingQueue(sessions: readonly Session[], runs: readonly Run[] = []): Session[] {
  // The same test the owner's list is made with: the count in the toolbar and the items there cannot disagree.
  return sessionsWaiting(sessions, runs).map((waiting) => waiting.session);
}

/** The session to jump to next: the first in the queue after `currentId`, wrapping around. */
export function nextWaiting(sessions: readonly Session[], currentId: string | null, runs: readonly Run[] = []): Session | null {
  const queue = waitingQueue(sessions, runs);
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

const SHELLS = new Set(['zsh', 'bash', 'fish', 'sh', 'dash', 'ksh', 'tcsh', 'csh']);

/**
 * Whether to offer "Resume agent" on a session: an agent conversation is
 * known for it, and its shell is sitting at a prompt (so the agent is not
 * running there now).
 */
export function canResumeAgent(session: Session): boolean {
  if (session.state !== 'open' || !session.agent?.conversationId) return false;
  if (session.status.state === 'busy') return false;
  if (session.status.state === 'idle') return true;
  // No report from the shell: go by what is in the foreground.
  return session.command !== null && SHELLS.has(session.command.replace(/^-/, ''));
}

/** Shows a notification of the browser, where the owner switched those on. Never asks for permission: that happens at a click. */
export function showNotification(title: string, body: string): boolean {
  try {
    if (!notificationsWanted()) return false;
    new Notification(title, { body });
    return true;
  } catch {
    return false;
  }
}

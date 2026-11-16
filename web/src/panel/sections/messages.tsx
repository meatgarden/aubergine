import { messagesWantOwner } from '@aubergine/shared';
import { ThreadList } from '../../Messages';
import { useApp } from '../../store';
import { registerSection } from '../registry';

/** Every thread between terminals, programs and the owner: the ones that want the owner first. */
function MessagesSection() {
  const canvases = useApp((s) => s.app?.canvases);
  const on = (canvases ?? []).filter((canvas) => canvas.messagesFrom.includes(canvas.id)).map((canvas) => canvas.name);
  return (
    <div className="messages-section" data-testid="messages-section">
      <p className="sheet-note" data-testid="messages-switch-note">
        {on.length === 0 ? 'Terminals may not message each other on any canvas. You can message any terminal.' : `Terminals may message each other on: ${on.join(', ')}.`} The switch is on each canvas’s tab.
      </p>
      <ThreadList />
    </div>
  );
}

registerSection({
  id: 'messages',
  title: 'Messages',
  order: 30,
  icon: '✉',
  useCount: () => useApp((s) => (s.app?.sessions ?? []).filter((session) => messagesWantOwner(session.messages)).length) || null,
  useBadges: () => {
    const sessions = useApp((s) => s.app?.sessions);
    return [
      { key: 'paused', mark: '‖', count: (sessions ?? []).filter((session) => session.messages.paused > 0).length, title: 'with a paused thread' },
      { key: 'for-you', mark: '✉', count: (sessions ?? []).filter((session) => session.messages.forOwner > 0).length, title: 'with a message for you' },
    ];
  },
  Component: MessagesSection,
});

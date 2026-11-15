import { useSyncExternalStore } from 'react';
import { runCommand } from '../commands';
import { hint } from '../shortcuts';
import { useApp } from '../store';
import { PANEL_STRIP_WIDTH, panelSections, sectionById, subscribeToSections, type PanelSection } from './registry';
import './sections';

/**
 * The panel down the left side. It is only a shell: it draws the registered
 * sections, each foldable, lets the whole panel collapse to a strip and be
 * resized, and shows a section's drawer beside itself. What the sections
 * contain is their own business.
 */
export function SidePanel() {
  const prefs = useApp((s) => s.side);
  const sections = useSyncExternalStore(subscribeToSections, panelSections);
  useApp((s) => s.settings.shortcuts);

  if (!prefs.open) {
    return (
      <aside className="side-panel collapsed" style={{ width: PANEL_STRIP_WIDTH }} aria-label="Side panel" data-testid="side-panel">
        <button type="button" className="quiet strip-open" aria-label="Open the side panel" title={hint('panel.toggle', 'Open the side panel')} onClick={() => runCommand('panel.toggle')}>
          ›
        </button>
        {sections.map((section) => (
          <StripEntry key={section.id} section={section} />
        ))}
      </aside>
    );
  }

  const startResize = (event: React.PointerEvent): void => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = prefs.width;
    const move = (e: PointerEvent): void => useApp.getState().setSide({ width: startWidth + e.clientX - startX });
    const stop = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  const toggleFold = (id: string): void => {
    const folded = prefs.folded.includes(id) ? prefs.folded.filter((f) => f !== id) : [...prefs.folded, id];
    useApp.getState().setSide({ folded });
  };

  return (
    <>
      <aside className="side-panel" style={{ width: prefs.width }} aria-label="Side panel" data-testid="side-panel">
        {sections.map((section, index) => {
          const folded = prefs.folded.includes(section.id);
          return (
            <section key={section.id} className={`panel-section${folded ? ' folded' : ''}`} data-section={section.id} aria-label={section.title}>
              <header className="panel-section-head">
                <button type="button" className="panel-fold" aria-expanded={!folded} onClick={() => toggleFold(section.id)} data-testid="section-fold">
                  <span className="list-chevron">{folded ? '▸' : '▾'}</span>
                  {section.title}
                  <SectionCount section={section} />
                </button>
                {index === 0 && (
                  <button type="button" className="quiet" aria-label="Collapse the side panel" title={hint('panel.toggle', 'Collapse the side panel')} onClick={() => runCommand('panel.toggle')}>
                    ‹
                  </button>
                )}
              </header>
              {!folded && (
                <div className="panel-section-body">
                  <section.Component />
                </div>
              )}
            </section>
          );
        })}
        {sections.length === 0 && <p className="list-empty">Nothing to show here yet.</p>}
        <div className="list-resize" role="separator" aria-orientation="vertical" aria-label="Resize the side panel" onPointerDown={startResize} data-testid="panel-resize" />
      </aside>
      <Drawer left={prefs.width} />
    </>
  );
}

function SectionCount({ section }: { section: PanelSection }) {
  const count = section.useCount?.() ?? null;
  return count === null ? null : (
    <span className="list-count" data-testid="section-count">
      {count}
    </span>
  );
}

/** A section on the collapsed strip: its icon, its count, and its badges. */
function StripEntry({ section }: { section: PanelSection }) {
  const count = section.useCount?.() ?? null;
  const badges = section.useBadges?.() ?? [];
  const open = (): void => {
    const { side, setSide } = useApp.getState();
    setSide({ open: true, folded: side.folded.filter((id) => id !== section.id) });
  };
  return (
    <button type="button" className="strip-entry" title={`${section.title}${count === null ? '' : `: ${count}`}`} onClick={open} data-testid="strip-entry" data-section={section.id}>
      <span className="strip-icon" aria-hidden="true">
        {section.icon}
      </span>
      {count !== null && <span className="strip-count">{count}</span>}
      {badges
        .filter((badge) => badge.count > 0)
        .map((badge) => (
          <span key={badge.key} className={`strip-badge is-${badge.key}`} title={`${badge.count} ${badge.title}`} data-testid="strip-badge" data-badge={badge.key}>
            <span aria-hidden="true">{badge.mark}</span>
            {badge.count}
            <span className="visually-hidden"> {badge.title}</span>
          </span>
        ))}
    </button>
  );
}

/**
 * The drawer beside the panel: a section's detail for one of its rows. It
 * lies over the edge of the canvas and moves nothing; the list stays in use
 * while it is open.
 */
function Drawer({ left }: { left: number }) {
  const drawer = useApp((s) => s.drawer);
  const definition = drawer ? sectionById(drawer.section)?.drawers?.[drawer.kind] : undefined;
  if (!drawer || !definition) return null;
  const close = (): void => useApp.getState().openDrawer(null);
  return (
    <aside
      className="panel-drawer"
      style={{ left }}
      aria-label="Details"
      data-testid="panel-drawer"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          close();
        }
      }}
    >
      <header className="panel-drawer-head">
        <DrawerTitle id={drawer.id} useTitle={definition.useTitle} />
        <button type="button" className="node-close" aria-label="Close the drawer" title="Close (Esc)" onClick={close}>
          ×
        </button>
      </header>
      <definition.Component key={`${drawer.kind}:${drawer.id}`} id={drawer.id} onClose={close} />
    </aside>
  );
}

function DrawerTitle({ id, useTitle }: { id: string; useTitle: (id: string) => string }) {
  return <span className="panel-drawer-title">{useTitle(id)}</span>;
}

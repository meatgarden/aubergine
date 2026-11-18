import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { runCommand } from '../commands';
import { hint } from '../shortcuts';
import { useApp } from '../store';
import { PANEL_STRIP_WIDTH, panelSections, sectionById, subscribeToSections, type PanelSection } from './registry';
import './sections';

/**
 * The panel down the left side. It is only a shell: a tab for each registered
 * section, the one section that is chosen with all of the height to itself,
 * a strip to collapse to, a width to drag, and a section's drawer beside it.
 * What the sections contain is their own business.
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

  const active = sections.find((section) => section.id === prefs.tab) ?? sections[0];

  return (
    <>
      <aside className="side-panel" style={{ width: prefs.width }} aria-label="Side panel" data-testid="side-panel">
        <header className="panel-tabs-row">
          <div className="panel-tabs" role="tablist" aria-label="What the panel shows">
            {sections
              .filter((section) => !section.more)
              .map((section) => (
                <Tab key={section.id} section={section} selected={section === active} />
              ))}
            <MoreTabs sections={sections.filter((section) => section.more)} active={active} />
          </div>
          <button type="button" className="quiet panel-collapse" aria-label="Collapse the side panel" title={hint('panel.toggle', 'Collapse the side panel')} onClick={() => runCommand('panel.toggle')}>
            ‹
          </button>
        </header>
        {active ? (
          <section key={active.id} className="panel-section" role="tabpanel" data-section={active.id} aria-label={active.title}>
            <active.Component />
          </section>
        ) : (
          <p className="list-empty">Nothing to show here yet.</p>
        )}
        <div className="list-resize" role="separator" aria-orientation="vertical" aria-label="Resize the side panel" onPointerDown={startResize} data-testid="panel-resize" />
      </aside>
      <Drawer left={prefs.width} />
    </>
  );
}

/** One section's tab: its name and, where it has one, its count. */
function Tab({ section, selected }: { section: PanelSection; selected: boolean }) {
  const count = section.useCount?.() ?? null;
  return (
    <button
      type="button"
      role="tab"
      className={`panel-tab${section.urgent && count ? ' is-urgent' : ''}`}
      aria-selected={selected}
      title={section.title}
      onClick={() => useApp.getState().setSide({ tab: section.id })}
      data-testid="panel-tab"
      data-section={section.id}
    >
      {section.tab ?? section.title}
      {count !== null && (
        <span className="panel-tab-count" data-testid="section-count">
          {count}
        </span>
      )}
    </button>
  );
}

/** The parts that are used less often: one tab that opens a list of them, so that the tabs fit one row. */
function MoreTabs({ sections, active }: { sections: PanelSection[]; active: PanelSection | undefined }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', key, true);
    };
  }, [open]);
  if (sections.length === 0) return null;
  const chosen = sections.find((section) => section === active);
  return (
    <span className="panel-more" ref={root}>
      <button type="button" role="tab" className="panel-tab" aria-selected={chosen !== undefined} aria-haspopup="menu" aria-expanded={open} title={`More: ${sections.map((section) => section.title).join(', ')}`} onClick={() => setOpen((v) => !v)} data-testid="panel-more">
        {chosen ? (chosen.tab ?? chosen.title) : 'More'}
        {sections.map((section) => (
          <MoreCount key={section.id} section={section} />
        ))}
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <span className="ui-menu toolbar-menu panel-more-menu" role="menu" data-testid="panel-more-menu">
          {sections.map((section) => (
            <MoreItem key={section.id} section={section} selected={section === active} onChoose={() => setOpen(false)} />
          ))}
        </span>
      )}
    </span>
  );
}

/** On “More”: the count of a part under it, while that part has something waiting on the owner. */
function MoreCount({ section }: { section: PanelSection }) {
  const count = section.useCount?.() ?? null;
  if (!section.urgent || !count) return null;
  return (
    <span className="panel-tab-count is-urgent" data-testid="more-count">
      {count}
    </span>
  );
}

function MoreItem({ section, selected, onChoose }: { section: PanelSection; selected: boolean; onChoose: () => void }) {
  const count = section.useCount?.() ?? null;
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={() => {
        useApp.getState().setSide({ tab: section.id });
        onChoose();
      }}
      data-testid="panel-tab"
      data-section={section.id}
    >
      {section.title}
      {count !== null && count > 0 && (
        <span className="panel-tab-count" data-testid="section-count">
          {count}
        </span>
      )}
    </button>
  );
}

/** A section on the collapsed strip: its icon, its count, and its badges. */
function StripEntry({ section }: { section: PanelSection }) {
  const count = section.useCount?.() ?? null;
  const badges = section.useBadges?.() ?? [];
  const open = (): void => {
    const { setSide } = useApp.getState();
    setSide({ open: true, tab: section.id });
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
      <header className="panel-drawer-head sheet-head">
        <h2>
          <DrawerTitle id={drawer.id} useTitle={definition.useTitle} />
        </h2>
        <button type="button" className="quiet" aria-label="Close the drawer" title="Close (Esc)" onClick={close}>
          Close
        </button>
      </header>
      <definition.Component key={`${drawer.kind}:${drawer.id}`} id={drawer.id} onClose={close} />
    </aside>
  );
}

function DrawerTitle({ id, useTitle }: { id: string; useTitle: (id: string) => string }) {
  return <span className="panel-drawer-title">{useTitle(id)}</span>;
}

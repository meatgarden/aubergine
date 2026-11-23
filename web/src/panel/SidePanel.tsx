import { useEffect, useRef, useSyncExternalStore } from 'react';
import { runCommand } from '../commands';
import { hint } from '../shortcuts';
import { useApp } from '../store';
import { DRAWER_MAX_WIDTH, DRAWER_MIN_WIDTH, PANEL_STRIP_WIDTH, panelSections, sectionById, subscribeToSections, type PanelSection } from './registry';
import { IconButton, StateDot, Switcher } from '../ui';
import './sections';

/**
 * The panel down the left side, from under the top bar to the foot of the window. It is only a shell: one menu of the
 * registered sections for a head, the one section that is chosen with all of the height to itself, a rail to fold
 * to, a width to drag, and a section's drawer beside it. What the sections contain is their own business.
 */
export function SidePanel() {
  const prefs = useApp((s) => s.side);
  const sections = useSyncExternalStore(subscribeToSections, panelSections);
  useApp((s) => s.settings.shortcuts);

  if (!prefs.open) {
    return (
      <aside className="side-panel collapsed" style={{ width: PANEL_STRIP_WIDTH }} aria-label="Side panel" data-testid="side-panel">
        <IconButton className="rail-open" label="Show the side panel" aria-expanded={false} title={hint('panel.toggle', 'Show the side panel')} onClick={() => runCommand('panel.toggle')} data-testid="panel-fold">
          ›
        </IconButton>
        {sections.map((section) => section.Rail && <section.Rail key={section.id} />)}
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
        <header className="panel-head">
          {active && (
            <Switcher
              fill
              name={active.tab ?? active.title}
              title="What the panel shows. Press for the others."
              testid="panel-switcher"
              nameTestid="panel-switcher-name"
              menuTestid="panel-menu"
              extra={
                <>
                  {/* Keyed by the section: each has hooks of its own for its count. */}
                  <Count key={active.id} section={active} testid="panel-switcher-count" />
                  {sections.map((section) => section !== active && <Waits key={section.id} section={section} />)}
                </>
              }
            >
              {sections.map((section) => (
                <Line key={section.id} section={section} selected={section === active} />
              ))}
            </Switcher>
          )}
        </header>
        {active ? (
          <section key={active.id} className="panel-section" data-section={active.id} aria-label={active.title}>
            <active.Component />
          </section>
        ) : (
          <p className="list-empty">Nothing to show here yet.</p>
        )}
        <Fold />
        <div className="list-resize" role="separator" aria-orientation="vertical" aria-label="Resize the side panel" onPointerDown={startResize} data-testid="panel-resize" />
      </aside>
      <Drawer />
    </>
  );
}

/** The handle on the open panel's own edge that folds it to its rail. */
function Fold() {
  return (
    <button type="button" className="panel-fold" aria-label="Hide the side panel" aria-expanded title={hint('panel.toggle', 'Hide the side panel')} onClick={() => runCommand('panel.toggle')} data-testid="panel-fold">
      <span aria-hidden="true">‹</span>
    </button>
  );
}

/** A section's count: a plain number, in the colour of waiting as text while it counts what waits on the owner. */
function Count({ section, testid }: { section: PanelSection; testid: string }) {
  const count = section.useCount?.() ?? null;
  if (count === null) return null;
  return (
    <span className={`panel-count${section.urgent && count > 0 ? ' is-urgent' : ''}`} data-testid={testid}>
      {count}
    </span>
  );
}

/** On the head, while another section is shown: a small mark that something waits on the owner in this one. */
function Waits({ section }: { section: PanelSection }) {
  const count = section.useCount?.() ?? null;
  if (!section.urgent || !count) return null;
  return <StateDot tone="waiting" word={`${count} waiting in ${section.title}`} className="panel-waits" data-testid="panel-waits" />;
}

/** One section in the menu: its name, what it shows in a line, and its count at the right. */
function Line({ section, selected }: { section: PanelSection; selected: boolean }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={selected} className="panel-line" onClick={() => useApp.getState().setSide({ tab: section.id })} data-testid="panel-tab" data-section={section.id}>
      <span className="panel-line-name">
        {section.tab ?? section.title}
        <Count section={section} testid="section-count" />
      </span>
      <small>{section.says}</small>
    </button>
  );
}

/**
 * The drawer beside the panel: a section's detail for one of its rows. It stands between the panel and the
 * canvas with its bar of tabs: the two are one group of columns, the tabs and the canvas another, which is narrower
 * while the drawer is open. The list stays in use while it is open.
 */
function Drawer() {
  const drawer = useApp((s) => s.drawer);
  const definition = drawer ? sectionById(drawer.section)?.drawers?.[drawer.kind] : undefined;
  const root = useRef<HTMLElement>(null);
  const shown = drawer && definition ? `${drawer.section}:${drawer.kind}` : null;
  // The panel shows the section a drawer belongs to, so that the row it is about is in view beside it.
  const owner = drawer && definition ? drawer.section : null;
  useEffect(() => {
    if (!owner) return;
    const { side } = useApp.getState();
    const showing = panelSections().find((section) => section.id === side.tab) ?? panelSections()[0];
    if (showing?.id !== owner) useApp.getState().setSide({ tab: owner });
  }, [owner, drawer?.id]);
  // It takes the keyboard when it opens, so that Escape closes it from wherever it was opened.
  useEffect(() => {
    if (shown) root.current?.focus();
  }, [shown]);
  // When it closes, however it was closed, the keyboard goes back to where it was opened from: unless something
  // else has taken the keyboard meanwhile, or the drawer now shows another thing.
  const openId = drawer && definition ? drawer.id : null;
  useEffect(() => {
    if (!openId || !definition?.returnTo) return;
    const returnTo = definition.returnTo;
    return () => {
      window.setTimeout(() => {
        if (useApp.getState().drawer !== null) return;
        const active = document.activeElement;
        if (active && active !== document.body && active.isConnected) return;
        returnTo(openId)?.focus();
      }, 0);
    };
  }, [openId, definition]);
  const width = useApp((s) => s.side.drawerWidth);
  if (!drawer || !definition) return null;
  const close = (): void => useApp.getState().openDrawer(null);
  return (
    <>
    <aside
      className="panel-drawer"
      style={{ width }}
      aria-label="Details"
      tabIndex={-1}
      ref={root}
      data-testid="panel-drawer"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.stopPropagation();
          close();
        }
      }}
    >
      {definition.Head ? (
        <definition.Head key={`head:${drawer.kind}:${drawer.id}`} id={drawer.id} onClose={close} />
      ) : (
        <header className="panel-drawer-head sheet-head">
          <h2>
            <DrawerTitle id={drawer.id} useTitle={definition.useTitle} />
          </h2>
          <button type="button" className="quiet" aria-label="Close the drawer" title="Close (Esc)" onClick={close}>
            Close
          </button>
        </header>
      )}
      <definition.Component key={`${drawer.kind}:${drawer.id}`} id={drawer.id} onClose={close} />
    </aside>
    <DrawerResize width={width} />
    </>
  );
}

function DrawerTitle({ id, useTitle }: { id: string; useTitle: (id: string) => string }) {
  return <span className="panel-drawer-title">{useTitle(id)}</span>;
}

/**
 * The drawer's edge, like the panel's: dragged to make the details wider or narrower, or moved with the arrow keys
 * once it has the keyboard. The width is remembered in this browser. The details in the focus view have the same edge.
 */
export function DrawerResize({ width }: { width: number }) {
  const set = (next: number): void => useApp.getState().setSide({ drawerWidth: next });
  const start = (event: React.PointerEvent): void => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const move = (e: PointerEvent): void => set(startWidth + e.clientX - startX);
    const stop = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };
  return (
    <div
      className="drawer-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the details"
      aria-valuemin={DRAWER_MIN_WIDTH}
      aria-valuemax={DRAWER_MAX_WIDTH}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to make the details wider or narrower"
      onPointerDown={start}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 64 : 16;
        if (event.key === 'ArrowLeft') set(width - step);
        else if (event.key === 'ArrowRight') set(width + step);
        else return;
        event.preventDefault();
        event.stopPropagation();
      }}
      data-testid="drawer-resize"
    />
  );
}

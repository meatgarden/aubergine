import { useEffect, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

/**
 * The pieces every surface is made of. Each is a thin name for one anatomy in ui.css and uses only tokens;
 * docs/design.md says when to use which. A plain `<button>`, `<input>` or `<select>` already has the anatomy of
 * a control (the rules are on the elements), so these add the kind, not the look.
 */

const join = (...names: (string | false | null | undefined)[]): string => names.filter(Boolean).join(' ');

export type ButtonKind = 'default' | 'primary' | 'quiet' | 'danger';
const KIND_CLASS: Record<ButtonKind, string> = { default: '', primary: 'primary', quiet: 'quiet', danger: 'danger' };

/** A button. `primary` is the one thing most people came to a surface to do: at most one on a surface. */
export function Button({ kind = 'default', busy = false, className, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: ButtonKind; busy?: boolean }) {
  return <button type={type} className={join(KIND_CLASS[kind], className)} aria-busy={busy || undefined} disabled={rest.disabled || busy} {...rest} />;
}

/** A button that is only a sign: a square, and it always says in words what it does. */
export function IconButton({ label, className, type = 'button', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type={type} className={join('quiet ui-icon-button', className)} aria-label={label} title={rest.title ?? label} {...rest}>
      {children}
    </button>
  );
}

/** One line of text to fill in. */
export function TextField({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={join('ui-field', className)} {...rest} />;
}

/** One of several to choose, from a list that opens. */
export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={join('ui-field', className)} {...rest} />;
}

/** Two or three choices of which one holds, side by side as one control. */
export function Segmented<T extends string>({ value, options, onChange, label, className }: { value: T; options: readonly { value: T; label: string; testid?: string }[]; onChange: (value: T) => void; label: string; className?: string }) {
  return (
    <div className={join('ui-segmented', className)} role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={option.value === value} onClick={() => onChange(option.value)} data-testid={option.testid}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export type Tone = 'neutral' | 'attention' | 'working' | 'ok' | 'danger';
const TONE_CLASS: Record<Tone, string> = { neutral: '', attention: 'is-attention', working: 'is-working', ok: 'is-ok', danger: 'is-danger' };

/** A count or a status: the same pill, in the colour of what it means. */
export function Badge({ tone = 'neutral', className, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={join('ui-badge', TONE_CLASS[tone], className)} {...rest} />;
}

export type DotTone = 'waiting' | 'finished' | 'working' | 'unread' | 'failed' | 'ordinary' | 'hollow';

/**
 * The one mark of a state: a dot of one size in a slot of one width, coloured by the state, hollow for what is put
 * away. Its word is said to whoever cannot see the colour. The list, a terminal's title and the Board use this.
 */
export function StateDot({ tone, word, className, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone: DotTone; word: string }) {
  return (
    <span className={join('ui-dot', `is-${tone}`, className)} role="img" aria-label={word} title={word} data-testid="state-dot" data-tone={tone} {...rest}>
      <span aria-hidden="true" />
    </span>
  );
}

/** A few lines about one thing, set apart. */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={join('ui-card', className)} {...rest} />;
}

/** A row that is pressed as a whole. */
export function Row({ className, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={join('ui-row', className)} {...rest} />;
}

/** The heading of a part of a surface. */
export function SectionTitle({ className, children, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={join('ui-section-title', className)} {...rest}>
      {children}
    </h3>
  );
}

/** Nothing here yet: a sentence, and the one thing to do about it. */
export function EmptyState({ children, action, className, ...rest }: HTMLAttributes<HTMLDivElement> & { action?: ReactNode }) {
  return (
    <div className={join('ui-empty', className)} {...rest}>
      <span>{children}</span>
      {action}
    </div>
  );
}

/** Lines to choose from. Each child is a button: a name and, where it helps, a `<small>` line saying what it is. */
export function Menu({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={join('ui-menu toolbar-menu', className)} role="menu" {...rest} />;
}

/** The head of a screen: its name, a line under it where one helps, and the way out at the right. */
export function ScreenHead({ title, subtitle, onClose, closeTestid, children }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; closeTestid?: string; children?: ReactNode }) {
  return (
    <header className="sheet-head">
      <div>
        <h2>{title}</h2>
        {subtitle && <p className="ui-meta">{subtitle}</p>}
      </div>
      <span className="ui-head-actions">
        {children}
        <Button kind="quiet" onClick={onClose} data-testid={closeTestid}>
          Close
        </Button>
      </span>
    </header>
  );
}

/**
 * A button that opens a menu under itself, and the menu. It closes when a line is chosen, when something else is
 * pressed, and on Escape. `more` draws the button as the sign for "everything else that can be done with this".
 */
export function MenuButton({ label, children, kind = 'default', more = false, testid, menuTestid, className, title }: { label: string; children: ReactNode; kind?: ButtonKind; more?: boolean; testid?: string; menuTestid?: string; className?: string; title?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
    };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', key, true);
    };
  }, [open]);
  return (
    <span className={join('ui-menu-button', className)} ref={root} onClick={(event) => event.stopPropagation()}>
      <button type="button" className={join(more ? 'quiet ui-icon-button' : KIND_CLASS[kind])} aria-haspopup="menu" aria-expanded={open} aria-label={more ? label : undefined} title={title ?? (more ? label : undefined)} onClick={() => setOpen((v) => !v)} data-testid={testid}>
        {more ? '⋯' : label}
        {!more && <span aria-hidden="true">▾</span>}
      </button>
      {open && (
        <span className="ui-menu toolbar-menu ui-menu-under" role="menu" onClick={(event) => (event.target as HTMLElement).closest('[role^="menuitem"]') && setOpen(false)} data-testid={menuTestid}>
          {children}
        </span>
      )}
    </span>
  );
}

/** One line of a menu: a name and, where it helps, a line saying what it is. */
export function MenuItem({ children, hint, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { hint?: ReactNode }) {
  return (
    <button type="button" role="menuitem" {...rest}>
      {children}
      {hint && <small>{hint}</small>}
    </button>
  );
}

/** The parts of a screen, one of which shows. */
export function Tabs<T extends string>({ value, tabs, onChange, label }: { value: T; tabs: readonly { value: T; label: ReactNode; testid?: string }[]; onChange: (value: T) => void; label: string }) {
  return (
    <div className="ui-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button key={tab.value} type="button" role="tab" className="ui-tab" aria-selected={tab.value === value} onClick={() => onChange(tab.value)} data-testid={tab.testid}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/** Something that is explained in a line, with the rest behind "How this works". */
export function HowThisWorks({ line, children }: { line: ReactNode; children: ReactNode }) {
  return (
    <details className="ui-how">
      <summary>
        <span className="ui-how-line">{line}</span> <span className="ui-how-more">How this works</span>
      </summary>
      <div className="ui-how-text">{children}</div>
    </details>
  );
}

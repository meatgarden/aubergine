import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

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

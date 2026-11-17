import { useEffect, useRef, useState } from 'react';
import { NAMED_COLORS, isNamedColor, type NodeColor } from '@aubergine/shared';
import { colorClass, colorStyle } from './color';

/** A dot that opens a small palette: the named colors, and one of your own. */
export function ColorButton({ value, onChange }: { value: NodeColor; onChange: (color: NodeColor) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [open]);

  const own = isNamedColor(value) ? null : value;

  // The picker reports every movement as input; the choice is taken on the browser's own "change", when it is made.
  const ownInput = useRef<HTMLInputElement>(null);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  useEffect(() => {
    const input = ownInput.current;
    if (!open || !input) return;
    const take = (): void => {
      const next = input.value.toLowerCase();
      if (/^#[0-9a-f]{6}$/.test(next) && next !== latest.current.value) latest.current.onChange(next);
    };
    input.addEventListener('change', take);
    return () => input.removeEventListener('change', take);
  }, [open]);

  return (
    <span className="color-button nodrag" ref={root}>
      <button
        type="button"
        className={`color-dot ${colorClass(value, 'swatch')}`}
        style={colorStyle(value)}
        aria-label="Color"
        title="Color"
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <span className="color-palette nowheel" role="menu" data-testid="color-palette">
          {NAMED_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              role="menuitemradio"
              aria-checked={color === value}
              aria-label={color}
              title={color === 'none' ? 'no color' : color}
              className={`color-dot swatch-${color}`}
              onClick={() => {
                setOpen(false);
                if (color !== value) onChange(color);
              }}
            />
          ))}
          <label className="color-own" title="A color of your own">
            <span className={`color-dot swatch-custom${own ? '' : ' is-empty'}`} style={own ? colorStyle(own) : undefined} aria-checked={own !== null} role="menuitemradio" />
            <span>Your own…</span>
            <input
              type="color"
              aria-label="A color of your own"
              data-testid="color-own"
              value={own ?? '#8a6fd1'}
              ref={ownInput}
              onChange={() => {}}
            />
          </label>
        </span>
      )}
    </span>
  );
}

import { useEffect, useRef, useState } from 'react';
import { NodeColor } from '@aubergine/shared';

/** A dot that opens a small palette. */
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

  return (
    <span className="color-button nodrag" ref={root}>
      <button
        type="button"
        className={`color-dot swatch-${value}`}
        aria-label="Color"
        title="Color"
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <span className="color-palette" role="menu">
          {NodeColor.options.map((color) => (
            <button
              key={color}
              type="button"
              role="menuitemradio"
              aria-checked={color === value}
              aria-label={color}
              title={color}
              className={`color-dot swatch-${color}`}
              onClick={() => {
                setOpen(false);
                if (color !== value) onChange(color);
              }}
            />
          ))}
        </span>
      )}
    </span>
  );
}

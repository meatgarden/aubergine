import type { CSSProperties } from 'react';
import { isNamedColor } from '@aubergine/shared';

/**
 * How a color is drawn: a named color is a class the stylesheet knows, a
 * color of one's own is handed to the same styles as the value they read.
 */
export function colorClass(color: string, prefix: 'color' | 'swatch' = 'color'): string {
  return `${prefix}-${isNamedColor(color) ? color : 'custom'}`;
}

export function colorStyle(color: string): CSSProperties | undefined {
  return isNamedColor(color) ? undefined : ({ '--swatch': color } as CSSProperties);
}

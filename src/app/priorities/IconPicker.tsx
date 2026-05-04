'use client';

import { useState } from 'react';
import { ICON_COLORS, ICON_STYLES } from '@/lib/priorities-validation';

const STYLE_FONT: Record<(typeof ICON_STYLES)[number], string> = {
  classic: 'ui-sans-serif, system-ui, sans-serif',
  rounded: 'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", Quicksand, Comfortaa, sans-serif',
  serif: 'ui-serif, Georgia, "Times New Roman", serif',
  script: '"Snell Roundhand", "Apple Chancery", "Brush Script MT", cursive',
};

type Props = {
  initialColor?: string;
  initialStyle?: (typeof ICON_STYLES)[number];
};

export function IconPicker({
  initialColor = ICON_COLORS[0],
  initialStyle = 'classic',
}: Props) {
  const [color, setColor] = useState<string>(initialColor);
  const [style, setStyle] = useState<(typeof ICON_STYLES)[number]>(initialStyle);

  return (
    <div className="space-y-3">
      <input type="hidden" name="iconColor" value={color} />
      <input type="hidden" name="iconStyle" value={style} />

      <div className="flex items-center gap-3">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-border bg-background text-3xl font-semibold leading-none"
          style={{ color, fontFamily: STYLE_FONT[style] }}
          aria-label="Icon preview"
        >
          P
        </span>
        <p className="text-xs text-muted-foreground">
          Pick a color and a letter style. The icon shows on every Priority card.
        </p>
      </div>

      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Color</legend>
        <div className="flex flex-wrap gap-2">
          {ICON_COLORS.map((c) => {
            const selected = c === color;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
                aria-pressed={selected}
                className={`h-9 w-9 rounded-full border-2 ${selected ? 'border-foreground' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Style</legend>
        <div className="flex flex-wrap gap-2">
          {ICON_STYLES.map((s) => {
            const selected = s === style;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStyle(s)}
                aria-pressed={selected}
                className={`flex min-w-16 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm capitalize ${
                  selected ? 'border-foreground bg-muted' : 'border-border hover:bg-muted'
                }`}
              >
                <span
                  className="text-lg font-semibold leading-none"
                  style={{ color, fontFamily: STYLE_FONT[s] }}
                  aria-hidden
                >
                  P
                </span>
                {s}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

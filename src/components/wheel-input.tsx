'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const ITEM = 36;

/** Number field that can be typed into directly or picked from a scroll wheel. */
export function WheelInput({
  name,
  options,
  defaultValue,
  center,
  min,
  max,
  step = 'any',
  label,
}: {
  name: string;
  options: number[];
  defaultValue?: number | null;
  /** Value the wheel starts at while the field is empty. */
  center: number;
  min: number;
  max: number;
  step?: number | 'any';
  label: string;
}) {
  const [value, setValue] = useState(defaultValue == null ? '' : String(defaultValue));
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const wheel = useRef<HTMLSpanElement>(null);
  const settle = useRef<number | undefined>(undefined);
  const ignoreScroll = useRef(false);

  const nearest = (target: number) =>
    options.reduce(
      (best, option, i) => (Math.abs(option - target) < Math.abs(options[best] - target) ? i : best),
      0,
    );
  const numeric = value === '' ? NaN : Number(value);
  const active = Number.isFinite(numeric) ? nearest(numeric) : -1;

  const scrollToIndex = (index: number, behavior: ScrollBehavior) => {
    const el = wheel.current;
    if (!el || el.scrollTop === index * ITEM) return;
    if (behavior === 'instant') ignoreScroll.current = true;
    el.scrollTo({ top: index * ITEM, behavior });
  };

  useEffect(() => {
    if (!open) return;
    scrollToIndex(active >= 0 ? active : nearest(center), 'instant');
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
    // Only re-align when the wheel opens; typing re-aligns explicitly.
  }, [open]);

  useEffect(() => () => window.clearTimeout(settle.current), []);

  const pick = (index: number) => {
    const option = options[Math.max(0, Math.min(options.length - 1, index))];
    setValue(String(option));
    return option;
  };

  return (
    <span className={`wheel-input${open ? ' open' : ''}`} ref={root}>
      <span className="wheel-field">
        <input
          name={name}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            const typed = Number(event.target.value);
            if (open && event.target.value !== '' && Number.isFinite(typed))
              scrollToIndex(nearest(typed), 'instant');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && open) {
              event.preventDefault();
              setOpen(false);
            } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault();
              const from = active >= 0 ? active : nearest(center);
              const next = Math.max(
                0,
                Math.min(options.length - 1, from + (event.key === 'ArrowDown' ? 1 : -1)),
              );
              pick(next);
              if (open) scrollToIndex(next, 'smooth');
            }
          }}
        />
        <button
          type="button"
          className="wheel-toggle"
          aria-label={label}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronDown size={16} />
        </button>
      </span>
      {open && (
        <span className="wheel-popover">
          <span
            ref={wheel}
            className="wheel-list"
            role="listbox"
            aria-label={label}
            onScroll={(event) => {
              const el = event.currentTarget;
              window.clearTimeout(settle.current);
              settle.current = window.setTimeout(() => {
                if (ignoreScroll.current) {
                  ignoreScroll.current = false;
                  return;
                }
                pick(Math.round(el.scrollTop / ITEM));
              }, 90);
            }}
          >
            {options.map((option, i) => (
              <span
                key={option}
                role="option"
                aria-selected={i === active}
                className="wheel-item"
                onClick={(event) => {
                  // Keep the surrounding <label> from focusing the input (avoids the mobile keyboard).
                  event.preventDefault();
                  pick(i);
                  scrollToIndex(i, 'smooth');
                }}
              >
                {option}
              </span>
            ))}
          </span>
        </span>
      )}
    </span>
  );
}

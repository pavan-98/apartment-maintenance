"use client";

// The app's own pickers, used instead of the browser's <select>. Native dropdowns
// look different on every phone and computer (on a Mac they cover the page with a
// grey menu), so choices are shown as buttons or as a small menu we draw ourselves.

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { MonthKey } from "@/lib/types";
import { monthLabel } from "@/lib/dates";

export interface Option<T extends string> {
  v: T;
  l: ReactNode;
  /** Small second line under the label. */
  hint?: ReactNode;
}

/** A row of buttons for a few choices (2–4), e.g. Cash / UPI / Bank / Other. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  stack = false,
  className = "",
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  /** One choice per line on phones (for longer labels); side by side on wider screens. */
  stack?: boolean;
  className?: string;
}) {
  const layout = stack ? "grid grid-cols-1 sm:grid-cols-3" : "flex flex-wrap";
  return (
    <div role="radiogroup" aria-label={label} className={`${layout} gap-1 rounded-xl bg-surface-2 p-1 ring-1 ring-line ${className}`}>
      {options.map((o) => {
        const on = o.v === value;
        return (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.v)}
            className={`min-w-fit flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${on ? "bg-brand text-brand-ink shadow-sm" : "text-ink-2 hover:bg-surface hover:text-ink"}`}
          >
            {o.l}
            {o.hint && <span className={`block text-xs font-normal ${on ? "opacity-90" : "text-muted"}`}>{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Wrapping chips for a longer list of short choices, e.g. expense categories. */
export function ChipPicker<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.v === value;
        return (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.v)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 transition ${on ? "bg-brand text-brand-ink ring-brand" : "bg-surface text-ink-2 ring-line hover:text-ink"}`}
          >
            {o.l}
          </button>
        );
      })}
    </div>
  );
}

/** Opens on click; closes on a click outside, Escape, or after choosing. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

const Chevron = ({ open }: { open: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`shrink-0 transition ${open ? "rotate-180" : ""}`}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

/** A menu of choices drawn by the app (for lists too long for buttons, e.g. notices). */
export function Dropdown<T extends string>({
  options,
  value,
  onChange,
  label,
  placeholder = "Choose…",
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  placeholder?: string;
}) {
  const { open, setOpen, ref } = usePopover();
  const id = useId();
  const current = options.find((o) => o.v === value);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="input flex items-center justify-between gap-2 text-left"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        onClick={() => setOpen(!open)}
        disabled={options.length === 0}
      >
        <span className={`min-w-0 truncate ${current ? "" : "text-muted"}`}>{current ? current.l : placeholder}</span>
        <Chevron open={open} />
      </button>
      {open && (
        <ul id={id} role="listbox" aria-label={label} className="absolute inset-x-0 z-40 mt-1 max-h-72 overflow-auto rounded-xl bg-surface p-1 shadow-lg ring-1 ring-line">
          {options.map((o) => {
            const on = o.v === value;
            return (
              <li key={o.v} role="option" aria-selected={on}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.v);
                    setOpen(false);
                  }}
                  className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm ${on ? "bg-brand-soft font-bold text-brand" : "hover:bg-surface-2"}`}
                >
                  <span className="w-4 shrink-0" aria-hidden>
                    {on ? "✓" : ""}
                  </span>
                  <span className="min-w-0">
                    {o.l}
                    {o.hint && <span className="block text-xs font-normal text-muted">{o.hint}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Month chooser: ‹ November 2026 › with arrows for the month before / after,
 * and the month name opens a small calendar of the months that can be chosen.
 */
export function MonthNav({
  months,
  value,
  onChange,
  lang = "en",
  big = false,
  labels = { prev: "Previous month", next: "Next month" },
}: {
  /** Months that can be chosen, oldest first. */
  months: MonthKey[];
  value: MonthKey;
  onChange: (m: MonthKey) => void;
  lang?: "en" | "te";
  big?: boolean;
  labels?: { prev: string; next: string };
}) {
  const { open, setOpen, ref } = usePopover();
  const sorted = [...months].sort();
  const i = sorted.indexOf(value);
  const years = [...new Set(sorted.map((m) => m.slice(0, 4)))].reverse();
  const arrow = `btn shrink-0 p-0 ${big ? "h-11 w-11" : "h-10 w-10"}`;
  return (
    <div ref={ref} className="relative flex items-center gap-2">
      <button type="button" className={arrow} disabled={i <= 0} onClick={() => onChange(sorted[i - 1])} aria-label={labels.prev}>
        ‹
      </button>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 font-extrabold transition hover:bg-surface-2 ${big ? "h-11 text-xl" : "h-10 bg-surface text-base ring-1 ring-line"}`}
      >
        <span className="truncate">{monthLabel(value, lang)}</span>
        {sorted.length > 1 && <Chevron open={open} />}
      </button>
      <button type="button" className={arrow} disabled={i < 0 || i >= sorted.length - 1} onClick={() => onChange(sorted[i + 1])} aria-label={labels.next}>
        ›
      </button>
      {open && sorted.length > 1 && (
        <div role="dialog" aria-label="Choose a month" className="absolute left-1/2 top-full z-40 mt-1 w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl bg-surface p-3 shadow-lg ring-1 ring-line">
          {years.map((y) => (
            <div key={y} className="mb-2 last:mb-0">
              <p className="mb-1 px-1 text-xs font-bold text-muted">{y}</p>
              <div className="grid grid-cols-3 gap-1">
                {sorted
                  .filter((m) => m.startsWith(y))
                  .map((m) => {
                    const on = m === value;
                    return (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          onChange(m);
                          setOpen(false);
                        }}
                        className={`rounded-lg px-2 py-2 text-sm font-semibold ${on ? "bg-brand text-brand-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}
                      >
                        {monthLabel(m, lang, true).replace(/\s*\d{4}$/, "")}
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

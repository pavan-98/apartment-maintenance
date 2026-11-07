"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { MonthKey } from "@/lib/types";
import type { Action } from "@/lib/actions";
import { monthLabel, todayISO } from "@/lib/dates";
import { useApp } from "../AppProvider";
import { MonthNav, Segmented } from "../Pickers";

/* ---------- toasts + action runner ---------- */

type Toast = { id: number; text: string; error?: boolean };
const ToastCtx = createContext<{ run: (a: Action, ok?: string) => Promise<boolean>; toast: (text: string, error?: boolean) => void } | null>(null);

export function AdminToasts({ children }: { children: ReactNode }) {
  const { act } = useApp();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((text: string, error = false) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts, { id, text, error }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), error ? 5000 : 2500);
  }, []);
  const run = useCallback(
    async (a: Action, ok = "Saved") => {
      const err = await act(a);
      if (err) toast(err, true);
      else toast(ok);
      return !err;
    },
    [act, toast],
  );
  return (
    <ToastCtx.Provider value={{ run, toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`sheet pointer-events-auto rounded-xl px-4 py-2.5 text-sm font-semibold shadow-lg ${t.error ? "bg-crit text-white" : "bg-ink text-bg"}`}
          >
            {t.error ? "⚠ " : "✓ "}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useAdmin() {
  const c = useContext(ToastCtx);
  if (!c) throw new Error("useAdmin outside AdminToasts");
  return c;
}

/* ---------- inputs ---------- */

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

/** Like Field, for button-based pickers (a <label> would "click" the first button). */
export function Group({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </div>
  );
}

export function MonthPicker({ months, value, onChange }: { months: MonthKey[]; value: MonthKey; onChange: (m: MonthKey) => void }) {
  return <MonthNav months={months} value={value} onChange={onChange} />;
}

export const MODES = [
  { v: "cash", l: "Cash" },
  { v: "upi", l: "UPI" },
  { v: "bank", l: "Bank" },
  { v: "other", l: "Other" },
] as const;

export function ModeSelect({ value, onChange }: { value: string; onChange: (v: "cash" | "upi" | "bank" | "other") => void }) {
  return <Segmented label="Payment mode" options={MODES.map((m) => ({ v: m.v, l: m.l }))} value={value as "cash"} onChange={onChange} />;
}

/** Default payment date: today if it falls in the month, else the 1st of that month. */
export function defaultDateFor(month: MonthKey): string {
  const today = todayISO();
  return today.startsWith(month) ? today : `${month}-01`;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-bold">{children}</h2>
      {action}
    </div>
  );
}

/* ---------- receipt photo upload ---------- */

async function resizeImage(file: File, maxSide = 1400, quality = 0.72): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    let q = quality;
    let data = canvas.toDataURL("image/jpeg", q);
    while (data.length > 850_000 && q > 0.35) {
      q -= 0.1;
      data = canvas.toDataURL("image/jpeg", q);
    }
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ReceiptInput({ value, onChange }: { value?: string; onChange: (id: string | undefined) => void }) {
  const { toast } = useAdmin();
  const [busy, setBusy] = useState(false);
  const onFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await resizeImage(file);
      const res = await fetch("/api/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      onChange(json.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload failed", true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className={`btn btn-sm cursor-pointer ${busy ? "opacity-60" : ""}`}>
        📷 {busy ? "Uploading…" : value ? "Change photo" : "Add bill photo"}
        <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
      {value && (
        <>
          <a className="text-sm font-semibold text-brand underline" href={`/api/receipts/${value}`} target="_blank" rel="noopener noreferrer">
            View
          </a>
          <button type="button" className="text-sm text-crit-ink underline" onClick={() => onChange(undefined)}>
            Remove
          </button>
        </>
      )}
    </div>
  );
}

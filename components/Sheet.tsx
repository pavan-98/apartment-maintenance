"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Bottom sheet on phones, centered dialog on larger screens. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  closeLabel = "Close",
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  closeLabel?: string;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center no-print" role="dialog" aria-modal="true">
      <button aria-label={closeLabel} className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        className={`sheet relative w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"} max-h-[88dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-surface shadow-2xl outline-none`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3">
          <h2 className="text-lg font-bold leading-tight">{title}</h2>
          <button className="btn btn-sm" onClick={onClose} aria-label={closeLabel}>
            ✕
          </button>
        </div>
        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const PAGE_PX = (210 / 25.4) * 96; // A4 width in CSS pixels
const PAGE_H_PX = (296 / 25.4) * 96;

/** Shows an A4 page shrunk to fit the screen; printed at full size. */
export function ScaledPage({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / PAGE_PX));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="book-scale-outer w-full">
      <div className="book-scale-box" style={{ height: PAGE_H_PX * scale, width: PAGE_PX * scale }}>
        <div className="book-scale shadow-lg ring-1 ring-line print:shadow-none print:ring-0" style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: PAGE_PX }}>
          {children}
        </div>
      </div>
    </div>
  );
}

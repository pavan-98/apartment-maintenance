"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Remembers on this phone what the resident has already seen
 * (localStorage, id → updatedAt), plus pop-ups closed during this visit
 * (sessionStorage), and keeps every component in sync.
 */
const EVENT = "apt-seen-changed";

function read(storage: "local" | "session", key: string): Record<string, string> {
  try {
    const s = storage === "local" ? localStorage : sessionStorage;
    return JSON.parse(s.getItem(key) || "{}");
  } catch {
    return {};
  }
}

function write(storage: "local" | "session", key: string, value: Record<string, string>) {
  try {
    const s = storage === "local" ? localStorage : sessionStorage;
    s.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: things may show again next time */
  }
  window.dispatchEvent(new Event(EVENT));
}

export type SeenItem = { id: string; updatedAt: string };

export function useSeen(storage: "local" | "session", key: string) {
  const [map, setMap] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    const sync = () => setMap(read(storage, key));
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, [storage, key]);
  const mark = useCallback(
    (items: SeenItem[]) => {
      if (!items.length) return;
      const cur = read(storage, key);
      let changed = false;
      for (const it of items) {
        if (cur[it.id] !== it.updatedAt) {
          cur[it.id] = it.updatedAt;
          changed = true;
        }
      }
      if (changed) write(storage, key, cur);
    },
    [storage, key],
  );
  /** null until loaded (avoids flashing pop-ups before we know what was seen). */
  const has = useCallback((it: SeenItem) => (map ? map[it.id] === it.updatedAt : true), [map]);
  return { ready: map !== null, has, mark };
}

export const SEEN_NOTICES = "apt-seen-notices";
export const SEEN_RULES = "apt-seen-rules";
export const CLOSED_THIS_VISIT = "apt-closed-popups";

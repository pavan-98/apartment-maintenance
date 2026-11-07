"use client";

import { useCallback, useEffect, useState } from "react";
import type { BookAction, BookDB } from "@/lib/book";

/** Loads the offline book pages (admins only) and runs changes on the server. */
export function useBook(enabled: boolean) {
  const [book, setBook] = useState<BookDB | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/book", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load");
      setBook(json.book);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load");
    }
  }, []);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  /** Runs a change. `conflict` is true when someone else changed the page after it was opened. */
  const send = useCallback(async (action: BookAction): Promise<{ error: string | null; conflict?: boolean; book?: BookDB }> => {
    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
        keepalive: true, // lets a last save finish even if the page is being closed
      });
      const json = await res.json();
      if (!res.ok) return { error: json.error || "Could not save", conflict: !!json.conflict };
      setBook(json.book);
      return { error: null, book: json.book };
    } catch {
      return { error: "No internet connection — not saved" };
    }
  }, []);

  /** Returns an error message, or null when saved. */
  const act = useCallback(async (action: BookAction) => (await send(action)).error, [send]);

  return { book, error, act, send, reload: load };
}

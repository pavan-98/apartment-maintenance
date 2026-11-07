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

  /** Returns an error message, or null when saved. */
  const act = useCallback(async (action: BookAction): Promise<string | null> => {
    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) return json.error || "Could not save";
      setBook(json.book);
      return null;
    } catch {
      return "No internet connection — not saved";
    }
  }, []);

  return { book, error, act, reload: load };
}

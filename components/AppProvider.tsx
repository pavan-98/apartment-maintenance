"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { DB, Role } from "@/lib/types";
import type { Action } from "@/lib/actions";
import { translate, type Key, type Lang } from "@/lib/i18n";

interface Ctx {
  db: DB | null;
  admin: string | null;
  /** "owner" = main admin, "manager" = limited admin, null = resident */
  role: Role | null;
  storage: string | null;
  loading: boolean;
  error: string | null;
  offline: boolean;
  reload: () => Promise<void>;
  /** Run an admin action on the server. Returns an error message, or null on success. */
  act: (action: Action) => Promise<string | null>;
  setAdmin: (name: string | null) => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: Key, vars?: Record<string, string | number>) => string;
}

const AppContext = createContext<Ctx | null>(null);
const CACHE_KEY = "apt-cache-v1";
const LANG_KEY = "apt-lang";

function readLS(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLS(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB | null>(null);
  const [admin, setAdmin] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [storage, setStorage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const l = readLS(LANG_KEY);
    if (l === "te" || l === "en") setLangState(l);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    writeLS(LANG_KEY, l);
  }, []);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/data", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setDb(json.db);
      setAdmin(json.admin);
      setRole(json.role ?? null);
      setStorage(json.storage);
      setError(null);
      setOffline(false);
      if (!json.admin) writeLS(CACHE_KEY, JSON.stringify(json.db));
    } catch (e) {
      const cached = readLS(CACHE_KEY);
      if (cached) {
        try {
          setDb((cur) => cur ?? (JSON.parse(cached) as DB));
          setOffline(true);
        } catch {
          /* ignore */
        }
      }
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    const onFocus = () => {
      if (document.visibilityState === "visible") reload();
    };
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [reload]);

  const act = useCallback(async (action: Action) => {
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (res.status === 401) {
        setAdmin(null);
        setRole(null);
      }
      if (!res.ok) return json.error || "Could not save";
      setDb(json.db);
      return null;
    } catch {
      return "No internet connection — not saved";
    }
  }, []);

  const t = useCallback((key: Key, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang]);

  const value = useMemo(
    () => ({ db, admin, role, storage, loading, error, offline, reload, act, setAdmin, lang, setLang, t }),
    [db, admin, role, storage, loading, error, offline, reload, act, lang, setLang, t],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(AppContext);
  if (!c) throw new Error("useApp outside provider");
  return c;
}

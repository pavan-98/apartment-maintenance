"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * The browser's install offer, caught once for the whole app so both the
 * header button and the notifications prompt can use it. The automatic
 * install banner is suppressed — installing only starts from a button tap.
 */
let deferred: BeforeInstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installedNow = true;
    emit();
  });
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  // iPadOS reports itself as a Mac; touch support gives it away.
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

export function useInstall() {
  const [, rerender] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const f = () => rerender((x) => x + 1);
    listeners.add(f);
    setReady(true);
    return () => {
      listeners.delete(f);
    };
  }, []);
  return {
    /** false until mounted (avoids a server/browser mismatch) */
    ready,
    standalone: ready && (installedNow || isStandalone()),
    ios: ready && isIos(),
    /** The browser offers its own install dialog (Chrome, Edge, Samsung Internet). */
    canPrompt: ready && !!deferred,
    /** Opens the browser's install dialog. Returns true if the person installed. */
    prompt: async (): Promise<boolean> => {
      const d = deferred;
      if (!d) return false;
      await d.prompt();
      const choice = await d.userChoice.catch(() => ({ outcome: "dismissed" as const }));
      deferred = null;
      emit();
      return choice.outcome === "accepted";
    },
  };
}

"use client";

import { useEffect, useState } from "react";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * A quiet "Install app" button. The browser's automatic install banner is
 * suppressed — the install dialog only opens when someone taps this button.
 */
export function InstallButton() {
  const { t } = useApp();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [help, setHelp] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(display-mode: standalone)");
    const nav = navigator as Navigator & { standalone?: boolean };
    setStandalone(mq.matches || nav.standalone === true);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const onPrompt = (e: Event) => {
      e.preventDefault(); // no automatic prompt
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setStandalone(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (standalone) return null;

  const onClick = async () => {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice.catch(() => undefined);
      setDeferred(null);
    } else {
      setHelp(true);
    }
  };

  return (
    <>
      <button className="btn btn-sm no-print" onClick={onClick} title={t("install")}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" />
        </svg>
        <span className="hidden sm:inline">{t("install")}</span>
      </button>
      <Sheet open={help} onClose={() => setHelp(false)} title={t("installTitle")} closeLabel={t("close")}>
        <p className="text-base leading-relaxed">{ios ? t("installIos") : t("installOther")}</p>
      </Sheet>
    </>
  );
}

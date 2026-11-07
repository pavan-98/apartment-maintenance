"use client";

import { useState } from "react";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";
import { useInstall } from "./install";

/**
 * A quiet "Install app" button. The browser's automatic install banner is
 * suppressed — the install dialog only opens when someone taps this button.
 */
export function InstallButton() {
  const { t } = useApp();
  const install = useInstall();
  const [help, setHelp] = useState(false);

  if (!install.ready || install.standalone) return null;

  const onClick = async () => {
    if (install.canPrompt) await install.prompt();
    else setHelp(true);
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
        <p className="text-base leading-relaxed">{install.ios ? t("installIos") : t("installOther")}</p>
      </Sheet>
    </>
  );
}

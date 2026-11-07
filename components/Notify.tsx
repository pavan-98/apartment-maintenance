"use client";

import { useEffect, useState } from "react";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";
import { useInstall } from "./install";
import { usePush } from "./push";

const ASKED_KEY = "apt-notify-asked";
const ASK_AGAIN_DAYS = 7;

function askedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(ASKED_KEY) || 0);
    return Date.now() - at < ASK_AGAIN_DAYS * 86400_000;
  } catch {
    return false;
  }
}

function rememberAsked() {
  try {
    localStorage.setItem(ASKED_KEY, String(Date.now()));
  } catch {
    /* storage unavailable: may ask again next visit */
  }
}

/** iPhone / iPad: Share → Add to Home Screen → open from Home Screen. */
function IosSteps() {
  const { t } = useApp();
  return (
    <>
      <p className="text-base leading-relaxed text-ink-2">{t("notifyIosIntro")}</p>
      <ol className="mt-3 space-y-2">
        {(["notifyIosStep1", "notifyIosStep2", "notifyIosStep3"] as const).map((k, i) => (
          <li key={k} className="flex gap-3 rounded-xl bg-surface-2 p-3 text-base">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-sm font-bold text-white">{i + 1}</span>
            <span>{t(k)}</span>
          </li>
        ))}
      </ol>
    </>
  );
}

/**
 * Shown once all the start-up notice pop-ups are closed: asks the resident to
 * turn on notifications and install the app. "Not now" hides it for a week.
 */
export function NotifyPrompt() {
  const { t, lang } = useApp();
  const push = usePush(lang);
  const install = useInstall();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const wantsPush = push.status === "off" || push.status === "needs-install";
  const wantsInstall = !install.standalone && install.canPrompt;
  const eligible = install.ready && push.status !== "loading" && (wantsPush || wantsInstall);

  useEffect(() => {
    if (!eligible || open || askedRecently()) return;
    // A short pause so it doesn't appear the instant the last notice closes.
    const id = setTimeout(() => setOpen(true), 1500);
    return () => clearTimeout(id);
  }, [eligible, open]);

  if (!open) return null;

  const close = () => {
    rememberAsked();
    setOpen(false);
  };

  const turnOn = async () => {
    setBusy(true);
    setError(false);
    try {
      await push.turnOn();
    } catch {
      setError(true);
    }
    setBusy(false);
  };

  const doInstall = async () => {
    await install.prompt();
    if (push.status !== "off") close();
  };

  // iPhone in a browser tab: the only way to get notifications is to install first.
  if (push.status === "needs-install") {
    return (
      <Sheet open onClose={close} closeLabel={t("close")} title={<span className="flex items-center gap-2">🔔 {t("notifyIosTitle")}</span>}>
        <p className="mb-3 text-base font-semibold">{t("notifyIntro")}</p>
        <IosSteps />
        <button className="btn btn-primary mt-4 w-full text-base" onClick={close}>
          {t("gotIt")}
        </button>
      </Sheet>
    );
  }

  const on = push.status === "on";
  return (
    <Sheet
      open
      onClose={close}
      closeLabel={t("close")}
      title={<span className="flex items-center gap-2">{wantsPush || on ? `🔔 ${t("notifyTitle")}` : `📲 ${t("installTitle")}`}</span>}
    >
      {push.status === "off" && (
        <>
          <p className="text-base leading-relaxed text-ink-2">{t("notifyIntro")}</p>
          <button className="btn btn-primary mt-4 w-full text-base" onClick={turnOn} disabled={busy}>
            {busy ? t("pleaseWait") : `🔔 ${t("notifyTurnOn")}`}
          </button>
          {error && <p className="mt-2 text-center text-sm font-semibold text-crit-ink">{t("notifyFailed")}</p>}
        </>
      )}
      {on && <p className="rounded-xl bg-brand-soft p-3 text-base font-semibold text-brand">{t("notifyOnNow")}</p>}
      {push.status === "denied" && <p className="text-base text-ink-2">{t("notifyBlocked")}</p>}

      {wantsInstall && (
        <div className={wantsPush || on ? "mt-4 border-t border-line pt-4" : ""}>
          <p className="text-base leading-relaxed text-ink-2">{t("installIntro")}</p>
          <button className={`btn mt-3 w-full text-base ${push.status === "off" ? "" : "btn-primary"}`} onClick={doInstall}>
            📲 {t("install")}
          </button>
        </div>
      )}

      <button className="btn mt-3 w-full text-base" onClick={close}>
        {on ? t("close") : t("notNow")}
      </button>
    </Sheet>
  );
}

/** A small card in the Notices tab: turn notifications on, or a note that they are on. */
export function NotifyCard() {
  const { t, lang } = useApp();
  const push = usePush(lang);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [help, setHelp] = useState(false);

  const s = push.status;
  if (s === "loading" || s === "disabled") return null;
  if (s === "unsupported") {
    // Usually an in-app browser (opened from Instagram, Facebook, …): Chrome can receive notifications.
    if (typeof navigator === "undefined" || !/Android/i.test(navigator.userAgent)) return null;
    return (
      <div className="card flex items-center gap-3 p-4 text-sm font-semibold no-print">
        <span className="text-2xl" aria-hidden>
          🔔
        </span>
        <p>{t("notifyOpenInChrome")}</p>
      </div>
    );
  }

  const turnOn = async () => {
    setBusy(true);
    setError(false);
    try {
      await push.turnOn();
    } catch {
      setError(true);
    }
    setBusy(false);
  };

  return (
    <div className="card p-4 no-print">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-2xl" aria-hidden>
          {s === "denied" ? "🔕" : "🔔"}
        </span>
        <p className="min-w-0 flex-1 text-sm font-semibold">
          {s === "on" ? t("notifyCardOn") : s === "needs-install" ? t("notifyIosCard") : s === "denied" ? t("notifyBlocked") : t("notifyCardOff")}
        </p>
        {s === "off" && (
          <button className="btn btn-primary btn-sm" onClick={turnOn} disabled={busy}>
            {busy ? t("pleaseWait") : t("notifyTurnOn")}
          </button>
        )}
        {s === "needs-install" && (
          <button className="btn btn-primary btn-sm" onClick={() => setHelp(true)}>
            {t("notifyHow")}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm font-semibold text-crit-ink">{t("notifyFailed")}</p>}
      <Sheet open={help} onClose={() => setHelp(false)} closeLabel={t("close")} title={t("notifyIosTitle")}>
        <IosSteps />
      </Sheet>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import type { DB, Notice } from "@/lib/types";
import { formatDate } from "@/lib/dates";
import type { Lang } from "@/lib/i18n";
import { activeNotices, noticeShareText } from "@/lib/whatsapp";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";
import { WhatsAppButton } from "./dashboard";

const SEEN_KEY = "apt-seen-notices";

function readSeen(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}");
  } catch {
    return {};
  }
}
function markSeen(n: Notice) {
  try {
    const seen = readSeen();
    seen[n.id] = n.updatedAt;
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    /* storage unavailable: popup will show again next time */
  }
}

/** Notices this device hasn't acknowledged (new, or edited since). */
export function useUnseenNotices(db: DB | null): Notice[] {
  const [seen, setSeen] = useState<Record<string, string> | null>(null);
  useEffect(() => setSeen(readSeen()), [db]);
  return useMemo(() => {
    if (!db || !seen) return [];
    return activeNotices(db).filter((n) => seen[n.id] !== n.updatedAt);
  }, [db, seen]);
}

/** Both languages, the reader's chosen language first. */
export function NoticeBody({ n, lang }: { n: Notice; lang: Lang }) {
  const blocks = [
    { key: "en", title: n.titleEn, body: n.bodyEn, label: "English" },
    { key: "te", title: n.titleTe, body: n.bodyTe, label: "తెలుగు" },
  ].filter((b) => b.title || b.body);
  if (lang === "te") blocks.reverse();
  return (
    <div className="space-y-4">
      {blocks.map((b, i) => (
        <div key={b.key} className={i > 0 ? "border-t border-line pt-4" : ""}>
          {blocks.length > 1 && <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted">{b.label}</p>}
          {b.title && <h3 className="text-lg font-extrabold leading-snug">{b.title}</h3>}
          {b.body && <p className="mt-1.5 whitespace-pre-line text-base leading-relaxed text-ink-2">{b.body}</p>}
        </div>
      ))}
    </div>
  );
}

/** Pops up new notices when the app opens. Tapping OK hides it on this device. */
export function NoticePopup({ db }: { db: DB }) {
  const { t, lang } = useApp();
  const unseen = useUnseenNotices(db).filter((n) => n.popup);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const queue = unseen.filter((n) => !dismissed.includes(n.id));
  const n = queue[0];
  if (!n) return null;
  const total = queue.length + dismissed.filter((id) => unseen.some((u) => u.id === id)).length;
  const index = total - queue.length + 1;
  const ok = () => {
    markSeen(n);
    setDismissed((d) => [...d, n.id]);
  };
  return (
    <Sheet
      open
      onClose={() => setDismissed((d) => [...d, n.id])}
      closeLabel={t("close")}
      title={
        <span className="flex items-center gap-2">
          <span className={`grid h-8 w-8 place-items-center rounded-full ${n.important ? "bg-crit text-white" : "bg-brand-soft text-brand"}`} aria-hidden>
            📢
          </span>
          {t("noticeLabel")} / నోటీసు
          {total > 1 && <span className="text-sm font-semibold text-muted">· {t("ofN", { i: index, n: total })}</span>}
        </span>
      }
    >
      {n.important && <p className="mb-3 rounded-lg bg-crit-bg px-3 py-1.5 text-sm font-bold text-crit-ink">! {t("important")}</p>}
      <NoticeBody n={n} lang={lang} />
      <p className="mt-4 text-xs text-muted">{t("posted", { date: formatDate(n.updatedAt.slice(0, 10), lang) })}</p>
      <button className="btn btn-primary mt-4 w-full text-base" onClick={ok}>
        {queue.length > 1 ? `${t("gotIt")} · ${t("nextNotice")} →` : t("gotIt")}
      </button>
    </Sheet>
  );
}

export function NoticesTab({ db }: { db: DB }) {
  const { t, lang } = useApp();
  const list = activeNotices(db);
  const unseen = new Set(useUnseenNotices(db).map((n) => n.id));
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <section className="space-y-3">
      {list.length === 0 && <p className="card p-6 text-center text-ink-2">{t("noNotices")}</p>}
      {list.map((n) => (
        <article key={n.id} className={`card p-4 ${n.important ? "border-l-4 border-l-crit" : ""}`}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-lg" aria-hidden>📢</span>
            {n.important && <span className="rounded-full bg-crit-bg px-2 py-0.5 text-xs font-bold text-crit-ink">! {t("important")}</span>}
            {unseen.has(n.id) && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-bold text-brand">{t("new")}</span>}
            <span className="ml-auto text-xs text-muted">
              {t("posted", { date: formatDate(n.updatedAt.slice(0, 10), lang) })}
              {n.expiresOn && ` · ${t("showUntil", { date: formatDate(n.expiresOn, lang) })}`}
            </span>
          </div>
          <NoticeBody n={n} lang={lang} />
          <div className="mt-4 flex flex-wrap gap-2">
            <WhatsAppButton small label={t("shareNotice")} text={noticeShareText(db, n, `${origin}/notice?id=${n.id}`)} />
            <a className="btn btn-sm" href={`/notice?id=${n.id}`} target="_blank" rel="noopener noreferrer">
              🖨 {t("print")}
            </a>
          </div>
        </article>
      ))}
    </section>
  );
}

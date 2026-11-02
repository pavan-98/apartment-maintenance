"use client";

import { useEffect, useMemo } from "react";
import type { DB, Notice, Rule } from "@/lib/types";
import { formatDate } from "@/lib/dates";
import type { Lang } from "@/lib/i18n";
import { activeNotices, noticeShareText } from "@/lib/whatsapp";
import { announcedRules, categoryInfo, ruleBody, ruleTitle } from "@/lib/rules";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";
import { WhatsAppButton } from "./dashboard";
import { CLOSED_THIS_VISIT, SEEN_NOTICES, SEEN_RULES, useSeen } from "./seen";

/** Count of notices this phone hasn't seen yet (for the tab badge). */
export function useUnseenNoticeCount(db: DB | null): number {
  const seen = useSeen("local", SEEN_NOTICES);
  return useMemo(() => (db && seen.ready ? activeNotices(db).filter((n) => !seen.has(n)).length : 0), [db, seen]);
}

/** Count of announced rule changes this phone hasn't seen yet. */
export function useUnseenRuleCount(db: DB | null): number {
  const seen = useSeen("local", SEEN_RULES);
  return useMemo(() => (db && seen.ready ? announcedRules(db.rules).filter((r) => !seen.has(r)).length : 0), [db, seen]);
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

type PopupItem = { kind: "notice"; notice: Notice; key: string } | { kind: "rules"; rules: Rule[]; key: string };

/**
 * Pop-ups when the app opens:
 * - notices set to "every time": each time the app is opened, until their end date
 * - notices set to "once": until the resident taps OK on this phone
 * - rules the admin chose to announce: once, after they are added or changed
 * Closing with ✕ hides a pop-up until the app is opened again.
 */
export function StartupPopups({ db }: { db: DB }) {
  const { t, lang } = useApp();
  const seenNotices = useSeen("local", SEEN_NOTICES);
  const seenRules = useSeen("local", SEEN_RULES);
  const closed = useSeen("session", CLOSED_THIS_VISIT);
  const ready = seenNotices.ready && seenRules.ready && closed.ready;

  const queue: PopupItem[] = useMemo(() => {
    if (!ready) return [];
    const items: PopupItem[] = [];
    for (const n of activeNotices(db)) {
      const key = `n:${n.id}`;
      if (closed.has({ id: key, updatedAt: n.updatedAt })) continue;
      if (n.popupMode === "every" || (n.popupMode === "once" && !seenNotices.has(n))) {
        items.push({ kind: "notice", notice: n, key });
      }
    }
    // Recurring notices first (they're about something happening soon).
    items.sort((a, b) => Number(b.kind === "notice" && b.notice.popupMode === "every") - Number(a.kind === "notice" && a.notice.popupMode === "every"));
    const rules = announcedRules(db.rules).filter((r) => !seenRules.has(r));
    const rulesStamp = rules.map((r) => r.updatedAt).sort().pop() ?? "";
    if (rules.length && !closed.has({ id: "rules", updatedAt: rulesStamp })) items.push({ kind: "rules", rules, key: "rules" });
    return items;
  }, [ready, db, closed, seenNotices, seenRules]);

  const item = queue[0];
  if (!item) return null;

  const stamp = item.kind === "notice" ? item.notice.updatedAt : item.rules.map((r) => r.updatedAt).sort().pop() ?? "";
  const close = () => closed.mark([{ id: item.key, updatedAt: stamp }]);
  const ok = () => {
    if (item.kind === "notice") seenNotices.mark([item.notice]);
    else seenRules.mark(item.rules);
    close();
  };
  const more = queue.length > 1;

  if (item.kind === "rules") {
    return (
      <Sheet open onClose={close} closeLabel={t("close")} title={<span className="flex items-center gap-2">📋 {t("rulesUpdated")}</span>}>
        <p className="mb-3 text-ink-2">{t("rulesUpdatedIntro")}</p>
        <ul className="space-y-3">
          {item.rules.map((r) => (
            <li key={r.id} className={`rounded-xl border border-line p-3 ${r.important ? "border-l-4 border-l-crit" : ""}`}>
              <p className="text-xs font-bold text-muted">
                {categoryInfo(r.category).icon} {lang === "te" ? categoryInfo(r.category).te : categoryInfo(r.category).en}
              </p>
              <h3 className="font-bold">{ruleTitle(r, lang)}</h3>
              <p className="mt-1 whitespace-pre-line text-sm text-ink-2">{ruleBody(r, lang)}</p>
            </li>
          ))}
        </ul>
        <button className="btn btn-primary mt-4 w-full text-base" onClick={ok}>
          {more ? `${t("gotIt")} · ${t("nextNotice")} →` : t("gotIt")}
        </button>
      </Sheet>
    );
  }

  const n = item.notice;
  return (
    <Sheet
      open
      onClose={close}
      closeLabel={t("close")}
      title={
        <span className="flex items-center gap-2">
          <span className={`grid h-8 w-8 place-items-center rounded-full ${n.important ? "bg-crit text-white" : "bg-brand-soft text-brand"}`} aria-hidden>
            📢
          </span>
          {t("noticeLabel")} / నోటీసు
        </span>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        {n.important && <span className="rounded-lg bg-crit-bg px-3 py-1 text-sm font-bold text-crit-ink">! {t("important")}</span>}
        {n.expiresOn && (
          <span className="rounded-lg bg-surface-2 px-3 py-1 text-sm font-semibold text-ink-2">📅 {t("untilDate", { date: formatDate(n.expiresOn, lang) })}</span>
        )}
      </div>
      <NoticeBody n={n} lang={lang} />
      <p className="mt-4 text-xs text-muted">{t("posted", { date: formatDate(n.updatedAt.slice(0, 10), lang) })}</p>
      <button className="btn btn-primary mt-4 w-full text-base" onClick={ok}>
        {more ? `${t("gotIt")} · ${t("nextNotice")} →` : t("gotIt")}
      </button>
    </Sheet>
  );
}

export function NoticesTab({ db }: { db: DB }) {
  const { t, lang } = useApp();
  const list = activeNotices(db);
  const seen = useSeen("local", SEEN_NOTICES);
  // Remember which notices were "new" when the tab was opened, then mark them as read.
  const fresh = useMemo(() => new Set(seen.ready ? list.filter((n) => !seen.has(n)).map((n) => n.id) : []), [seen.ready]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (seen.ready) seen.mark(list);
  }, [seen.ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <section className="space-y-3">
      {list.length === 0 && <p className="card p-6 text-center text-ink-2">{t("noNotices")}</p>}
      {list.map((n) => (
        <article key={n.id} className={`card p-4 ${n.important ? "border-l-4 border-l-crit" : ""}`}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-lg" aria-hidden>📢</span>
            {n.important && <span className="rounded-full bg-crit-bg px-2 py-0.5 text-xs font-bold text-crit-ink">! {t("important")}</span>}
            {fresh.has(n.id) && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-bold text-brand">{t("new")}</span>}
            {n.expiresOn && (
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-ink-2">📅 {t("untilDate", { date: formatDate(n.expiresOn, lang) })}</span>
            )}
            <span className="ml-auto text-xs text-muted">{t("posted", { date: formatDate(n.updatedAt.slice(0, 10), lang) })}</span>
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

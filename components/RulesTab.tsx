"use client";

import { useEffect, useMemo } from "react";
import type { DB } from "@/lib/types";
import { formatDate } from "@/lib/dates";
import { announcedRules, groupRules, ruleBody, ruleTitle, rulesShareText } from "@/lib/rules";
import { useApp } from "./AppProvider";
import { WhatsAppButton } from "./dashboard";
import { SEEN_RULES, useSeen } from "./seen";

export function RulesTab({ db }: { db: DB }) {
  const { t, lang } = useApp();
  const groups = groupRules(db.rules);
  const seen = useSeen("local", SEEN_RULES);
  const announced = announcedRules(db.rules);
  const fresh = useMemo(() => new Set(seen.ready ? announced.filter((r) => !seen.has(r)).map((r) => r.id) : []), [seen.ready]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (seen.ready) seen.mark(announced);
  }, [seen.ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const other = lang === "te" ? "en" : "te";
  let n = 0;

  return (
    <section className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-xl" aria-hidden>
          📋
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{t("rulesIntro")}</p>
          <p className="text-sm text-muted">{t("rulesCount", { n: db.rules.length })}</p>
        </div>
        {db.rules.length > 0 && (
          <div className="flex w-full gap-2 sm:w-auto">
            <WhatsAppButton small label={t("shareRules")} text={rulesShareText(db, `${origin}/#rules`)} />
            <a className="btn btn-sm" href="/print-rules" target="_blank" rel="noopener noreferrer">
              🖨 {t("printRules")}
            </a>
          </div>
        )}
      </div>

      {db.rules.length === 0 && <p className="card p-6 text-center text-ink-2">{t("noRules")}</p>}

      {groups.length > 1 && (
        <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" aria-label={t("rules")}>
          {groups.map((g) => (
            <a key={g.category.id} href={`#rules-${g.category.id}`} className="shrink-0 rounded-full bg-surface px-3 py-1.5 text-sm font-semibold ring-1 ring-line hover:bg-surface-2">
              {g.category.icon} {lang === "te" ? g.category.te : g.category.en}
            </a>
          ))}
        </nav>
      )}

      {groups.map((g) => (
        <section key={g.category.id} id={`rules-${g.category.id}`} className="scroll-mt-20">
          <h2 className="mb-2 flex items-center gap-2 px-1 text-base font-extrabold">
            <span aria-hidden>{g.category.icon}</span>
            {lang === "te" ? g.category.te : g.category.en}
          </h2>
          <ol className="space-y-2">
            {g.rules.map((r) => {
              n += 1;
              const otherTitle = ruleTitle(r, other);
              const otherBody = ruleBody(r, other);
              const hasOther = (other === "te" ? r.titleTe || r.bodyTe : r.titleEn || r.bodyEn) && otherBody !== ruleBody(r, lang);
              return (
                <li key={r.id} className={`card p-4 ${r.important ? "border-l-4 border-l-crit" : ""}`}>
                  <div className="flex flex-wrap items-start gap-2">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-bold">{n}</span>
                    <h3 className="min-w-0 flex-1 pt-0.5 text-base font-bold">{ruleTitle(r, lang)}</h3>
                    {r.important && <span className="rounded-full bg-crit-bg px-2 py-0.5 text-xs font-bold text-crit-ink">! {t("important")}</span>}
                    {fresh.has(r.id) && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-bold text-brand">{t("new")}</span>}
                  </div>
                  <p className="mt-2 whitespace-pre-line leading-relaxed text-ink-2">{ruleBody(r, lang)}</p>
                  {hasOther && (
                    <details className="mt-2 text-sm">
                      <summary className="cursor-pointer font-semibold text-brand">{other === "te" ? "తెలుగులో చదవండి" : "Read in English"}</summary>
                      <p className="mt-1 font-semibold">{otherTitle}</p>
                      <p className="whitespace-pre-line text-ink-2">{otherBody}</p>
                    </details>
                  )}
                  <p className="mt-2 text-xs text-muted">{t("updated", { date: formatDate(r.updatedAt.slice(0, 10), lang) })}</p>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </section>
  );
}

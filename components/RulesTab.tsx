"use client";

import type { Rule } from "@/lib/types";
import { formatDate } from "@/lib/dates";
import { useApp } from "./AppProvider";

const NEW_DAYS = 14;

export function isRecent(r: Rule, now = Date.now()): boolean {
  return now - new Date(r.updatedAt).getTime() < NEW_DAYS * 86400000;
}

export function RulesTab({ rules }: { rules: Rule[] }) {
  const { t, lang } = useApp();
  return (
    <section className="space-y-3">
      <div className="card flex items-center gap-3 p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v18M5 7h14M7 7l-3 7a3 3 0 0 0 6 0L7 7Zm10 0-3 7a3 3 0 0 0 6 0l-3-7Z" />
          </svg>
        </span>
        <p className="font-semibold">{t("rulesIntro")}</p>
      </div>
      {rules.length === 0 && <p className="card p-6 text-center text-ink-2">{t("noRules")}</p>}
      <ol className="space-y-3">
        {rules.map((r, i) => (
          <li key={r.id} className={`card p-4 ${r.important ? "border-l-4 border-l-crit" : ""}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-bold">{i + 1}</span>
              <h3 className="flex-1 text-base font-bold">{r.title}</h3>
              {r.important && (
                <span className="rounded-full bg-crit-bg px-2 py-0.5 text-xs font-bold text-crit-ink">! {t("important")}</span>
              )}
              {isRecent(r) && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-bold text-brand">{t("new")}</span>}
            </div>
            <p className="mt-2 whitespace-pre-line leading-relaxed text-ink-2">{r.body}</p>
            <p className="mt-2 text-xs text-muted">{t("updated", { date: formatDate(r.updatedAt.slice(0, 10), lang) })}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

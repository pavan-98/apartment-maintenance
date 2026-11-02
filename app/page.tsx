"use client";

import { useEffect, useMemo, useState } from "react";
import type { Flat } from "@/lib/types";
import { activeMonths, allSummaries, defaultMonth, duesReport, inr } from "@/lib/calc";
import { monthSummaryText } from "@/lib/share";
import { useApp } from "@/components/AppProvider";
import { Header } from "@/components/Header";
import {
  BuildingGrid,
  CollectionsSection,
  DuesAlert,
  ExpenseSection,
  FlatSheet,
  MonthSwitcher,
  SummaryTiles,
  Waterfall,
  WhatsAppButton,
} from "@/components/dashboard";
import { HistoryTab } from "@/components/HistoryTab";
import { RulesTab, isRecent } from "@/components/RulesTab";

type Tab = "month" | "history" | "rules";
const TABS: Tab[] = ["month", "history", "rules"];

export default function Home() {
  const { db, loading, error, offline, reload, t, lang } = useApp();
  const [tab, setTab] = useState<Tab>("month");
  const [month, setMonth] = useState<string | null>(null);
  const [flat, setFlat] = useState<Flat | null>(null);

  useEffect(() => {
    const read = () => {
      const h = window.location.hash.replace("#", "") as Tab;
      if (TABS.includes(h)) setTab(h);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const go = (next: Tab) => {
    setTab(next);
    history.replaceState(null, "", next === "month" ? window.location.pathname : `#${next}`);
    window.scrollTo({ top: 0 });
  };

  const months = useMemo(() => (db ? activeMonths(db) : []), [db]);
  const summaries = useMemo(() => (db ? allSummaries(db) : []), [db]);
  const dues = useMemo(() => (db ? duesReport(db) : null), [db]);
  const current = month && months.includes(month) ? month : db ? defaultMonth(db) : null;
  const s = summaries.find((x) => x.month === current);
  const newRules = db?.rules.filter((r) => isRecent(r)).length ?? 0;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 pb-28 pt-4 sm:pb-10">
        {loading && !db && <p className="py-20 text-center text-ink-2">{t("loading")}</p>}
        {!loading && !db && (
          <div className="card mx-auto mt-10 max-w-md p-6 text-center">
            <p className="text-ink-2">{t("loadError")}</p>
            {error && <p className="mt-1 text-xs text-muted">{error}</p>}
            <button className="btn btn-primary mt-4" onClick={reload}>
              {t("retry")}
            </button>
          </div>
        )}

        {db && dues && s && current && (
          <div className="space-y-4">
            {offline && <p className="rounded-xl bg-surface-2 px-4 py-2 text-sm text-ink-2">{t("offline")}</p>}
            {db.settings.isDemo && (
              <p className="rounded-xl border border-dashed border-brand bg-brand-soft px-4 py-2.5 text-sm font-medium text-brand">
                {t("demoBanner")}
              </p>
            )}

            <DuesAlert db={db} dues={dues} />

            <nav className="hidden gap-1 rounded-xl bg-surface-2 p-1 sm:flex no-print" aria-label="Sections">
              {TABS.map((k) => (
                <TabButton key={k} active={tab === k} onClick={() => go(k)} badge={k === "rules" ? newRules : 0}>
                  {t(k === "month" ? "thisMonth" : k)}
                </TabButton>
              ))}
            </nav>

            {tab === "month" && (
              <>
                <div className="card p-3">
                  <MonthSwitcher months={months} value={current} onChange={setMonth} />
                  <p className="mt-1 text-center text-xs text-muted">{t("monthlyMaint", { amount: inr(s.due) })}</p>
                </div>
                <SummaryTiles s={s} />
                <BuildingGrid s={s} onPick={setFlat} />
                <div className="grid gap-4 lg:grid-cols-2">
                  <ExpenseSection db={db} s={s} />
                  <Waterfall s={s} />
                </div>
                <CollectionsSection s={s} />
                <div className="flex justify-center pt-2">
                  <WhatsAppButton label={t("share")} text={monthSummaryText(db, s, lang, typeof window !== "undefined" ? window.location.origin : "")} />
                </div>
              </>
            )}
            {tab === "history" && (
              <HistoryTab
                summaries={summaries}
                onPickMonth={(m) => {
                  setMonth(m);
                  go("month");
                }}
              />
            )}
            {tab === "rules" && <RulesTab rules={db.rules} />}
          </div>
        )}
      </main>

      {db && (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden no-print"
          aria-label="Sections"
        >
          <div className="grid grid-cols-3">
            {TABS.map((k) => (
              <button
                key={k}
                onClick={() => go(k)}
                className={`relative flex flex-col items-center gap-0.5 py-2.5 text-xs font-semibold ${tab === k ? "text-brand" : "text-muted"}`}
                aria-current={tab === k ? "page" : undefined}
              >
                <TabIcon tab={k} />
                {t(k === "month" ? "thisMonth" : k)}
                {k === "rules" && newRules > 0 && (
                  <span className="absolute right-[calc(50%-22px)] top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-crit px-1 text-[10px] text-white">
                    {newRules}
                  </span>
                )}
              </button>
            ))}
          </div>
        </nav>
      )}
      {flat && db && <FlatSheet db={db} flat={flat} onClose={() => setFlat(null)} />}
    </>
  );
}

function TabButton({ active, onClick, children, badge }: { active: boolean; onClick: () => void; children: React.ReactNode; badge: number }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex-1 rounded-lg px-4 py-2 text-sm font-bold transition ${active ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink"}`}
      aria-current={active ? "page" : undefined}
    >
      {children}
      {badge > 0 && <span className="ml-2 rounded-full bg-crit px-1.5 text-[11px] text-white">{badge}</span>}
    </button>
  );
}

function TabIcon({ tab }: { tab: Tab }) {
  const p = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (tab === "month")
    return (
      <svg {...p}>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 9h18M8 2v4M16 2v4" />
      </svg>
    );
  if (tab === "history")
    return (
      <svg {...p}>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    );
  return (
    <svg {...p}>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5M9 13h7M9 17h5" />
    </svg>
  );
}

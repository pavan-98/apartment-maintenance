"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { allSummaries, defaultMonth, inr } from "@/lib/calc";
import { formatDate, monthLabel } from "@/lib/dates";
import { flatName } from "@/lib/share";
import { useApp } from "@/components/AppProvider";

/** Printable monthly statement — laid out like the maintenance book page. */
export default function ReportPage() {
  const { db, t, lang } = useApp();
  const [month, setMonth] = useState<string | null>(null);
  useEffect(() => {
    setMonth(new URLSearchParams(window.location.search).get("month"));
  }, []);
  const summaries = useMemo(() => (db ? allSummaries(db) : []), [db]);
  if (!db) return <p className="p-8 text-center">{t("loading")}</p>;
  const m = month && summaries.some((s) => s.month === month) ? month : defaultMonth(db);
  const s = summaries.find((x) => x.month === m)!;
  const expenses = db.expenses.filter((e) => e.month === m);

  return (
    <main className="mx-auto max-w-3xl bg-surface p-6 text-[13px] print:max-w-none print:p-0">
      <div className="no-print mb-4 flex gap-2">
        <button className="btn btn-primary" onClick={() => window.print()}>
          🖨 Print / Save as PDF
        </button>
        <Link className="btn" href="/">
          ← Back
        </Link>
      </div>
      <header className="border-b-2 border-ink pb-3 text-center">
        <h1 className="text-xl font-extrabold">{db.settings.apartmentName}</h1>
        <p className="text-base font-semibold">
          {t("maintenance")} — {monthLabel(m, lang)}
        </p>
        {db.settings.isDemo && <p className="mt-1 text-xs font-bold text-crit-ink">SAMPLE DATA</p>}
      </header>

      <table className="mt-4 w-full border-collapse">
        <thead>
          <tr className="border-b border-ink text-left">
            <th className="py-1.5 pr-2">#</th>
            <th className="py-1.5 pr-2">{t("owner")}</th>
            <th className="py-1.5 pr-2">Status</th>
            <th className="py-1.5 pr-2">Date</th>
            <th className="py-1.5 text-right">₹</th>
          </tr>
        </thead>
        <tbody className="tnum">
          {s.flats.map((f) => (
            <tr key={f.flat.id} className="border-b border-line">
              <td className="py-1.5 pr-2 font-bold">{f.flat.id}</td>
              <td className="py-1.5 pr-2">{flatName(f.flat)}</td>
              <td className={`py-1.5 pr-2 font-semibold ${f.status === "paid" ? "text-good-ink" : "text-crit-ink"}`}>
                {t(f.status === "paid" ? "paid" : f.status === "partial" ? "partial" : "unpaid")}
              </td>
              <td className="py-1.5 pr-2">{formatDate(f.lastPaidOn, lang)}</td>
              <td className="py-1.5 text-right">{f.paid ? inr(f.paid) : "—"}</td>
            </tr>
          ))}
          <tr className="font-bold">
            <td colSpan={4} className="py-1.5">
              {t("maintenanceIn")} ({s.paidCount}/{s.flats.length})
            </td>
            <td className="py-1.5 text-right">{inr(s.maintenanceCollected)}</td>
          </tr>
        </tbody>
      </table>

      <h2 className="mt-5 border-b border-ink pb-1 font-bold">{t("expenses")}</h2>
      <table className="w-full">
        <tbody className="tnum">
          {expenses.map((e) => (
            <tr key={e.id} className="border-b border-line">
              <td className="py-1.5">{e.label}</td>
              <td className="py-1.5 text-right">{inr(e.amount)}</td>
            </tr>
          ))}
          <tr className="font-bold">
            <td className="py-1.5">{t("regularOut")}</td>
            <td className="py-1.5 text-right">{inr(s.regularExpenses)}</td>
          </tr>
        </tbody>
      </table>

      {s.collections.map((c) => (
        <section key={c.collection.id}>
          <h2 className="mt-5 border-b border-ink pb-1 font-bold">
            {t("specialWorks")}: {c.collection.title} ({inr(c.collection.perFlatAmount)} {t("perFlat")})
          </h2>
          <table className="w-full">
            <tbody className="tnum">
              {c.collection.costs.map((x) => (
                <tr key={x.id} className="border-b border-line">
                  <td className="py-1.5">{x.label}</td>
                  <td className="py-1.5 text-right">{inr(x.amount)}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td className="py-1.5">{t("cost")}</td>
                <td className="py-1.5 text-right">{inr(c.cost)}</td>
              </tr>
              <tr>
                <td className="py-1.5">
                  {t("collected")} ({c.paidFlatIds.length}/{c.expectedFlats.length})
                  {c.pendingFlats.length > 0 && ` — ${t("notPaidYet")}: ${c.pendingFlats.map((p) => p.flat.id).join(", ")}`}
                </td>
                <td className="py-1.5 text-right">{inr(c.collected)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      ))}

      <h2 className="mt-5 border-b border-ink pb-1 font-bold">{t("howBalance")}</h2>
      <table className="w-full">
        <tbody className="tnum">
          <tr><td className="py-1">{t("opening")}</td><td className="py-1 text-right">{inr(s.opening)}</td></tr>
          <tr><td className="py-1">+ {t("maintenanceIn")}</td><td className="py-1 text-right">{inr(s.maintenanceCollected)}</td></tr>
          {s.collectionIncome > 0 && <tr><td className="py-1">+ {t("worksIn")}</td><td className="py-1 text-right">{inr(s.collectionIncome)}</td></tr>}
          <tr><td className="py-1">− {t("regularOut")}</td><td className="py-1 text-right">{inr(s.regularExpenses)}</td></tr>
          {s.collectionCosts > 0 && <tr><td className="py-1">− {t("worksOut")}</td><td className="py-1 text-right">{inr(s.collectionCosts)}</td></tr>}
          <tr className="border-t-2 border-ink text-base font-extrabold">
            <td className="py-1.5">
              {t("closing")} {s.closing < 0 && `(${t("shortage")})`}
            </td>
            <td className={`py-1.5 text-right ${s.closing < 0 ? "text-crit-ink" : ""}`}>{inr(s.closing)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-6 text-xs text-muted">Generated {formatDate(new Date().toISOString().slice(0, 10))}</p>
    </main>
  );
}

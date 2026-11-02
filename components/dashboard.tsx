"use client";

import { useMemo, useState } from "react";
import type { DB, Flat, MonthKey } from "@/lib/types";
import { flatHistory, inr, type DuesReport, type FlatMonthStatus, type MonthSummary, type PayStatus } from "@/lib/calc";
import { formatDate, monthLabel } from "@/lib/dates";
import { categoryLabel } from "@/lib/i18n";
import { flatName, flatReminderText, groupReminderText, whatsappLink } from "@/lib/share";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";

/* ---------- small pieces ---------- */

export function StatusIcon({ status, size = 14 }: { status: PayStatus; size?: number }) {
  if (status === "paid")
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m5 12 5 5 9-10" />
      </svg>
    );
  if (status === "partial")
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
        <path d="M6 12h12" />
      </svg>
    );
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
      <path d="M12 6v7M12 17.5v.5" />
    </svg>
  );
}

export function StatusChip({ status }: { status: PayStatus }) {
  const { t } = useApp();
  const cls =
    status === "paid"
      ? "bg-good-bg text-good-ink"
      : status === "partial"
        ? "bg-warn-bg text-warn-ink"
        : "bg-crit-bg text-crit-ink";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${cls}`}>
      <StatusIcon status={status} size={12} />
      {t(status === "paid" ? "paid" : status === "partial" ? "partial" : "unpaid")}
    </span>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" />
    </svg>
  );
}

export function WhatsAppButton({ text, phone, label, small }: { text: string; phone?: string; label: string; small?: boolean }) {
  return (
    <a
      className={`btn ${small ? "btn-sm" : ""} no-print`}
      href={whatsappLink(text, phone)}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="text-[#1a9e4b]">
        <WhatsAppIcon />
      </span>
      {label}
    </a>
  );
}

function appUrl(): string {
  return typeof window === "undefined" ? "" : window.location.origin;
}

/* ---------- red alert ---------- */

export function DuesAlert({ db, dues }: { db: DB; dues: DuesReport }) {
  const { t, lang } = useApp();
  const [open, setOpen] = useState(false);

  if (dues.overdue.length) {
    const n = dues.overdue.length;
    return (
      <section role="alert" className="overflow-hidden rounded-2xl border-2 border-crit bg-crit-bg">
        <div className="flex items-start gap-3 p-4">
          <span className="pulse mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-crit text-white" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0ZM12 9v4M12 17h.01" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-extrabold text-crit-ink sm:text-lg">
              {n === 1 ? t("alertTitle1") : t("alertTitle", { n })}
            </h2>
            <p className="mt-0.5 text-sm text-crit-ink">
              {t("totalPending")}: <strong className="tnum text-base">{inr(dues.overdueTotal)}</strong>
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {dues.overdue.map((d) => (
                <li key={d.flat.id} className="rounded-lg border border-crit/40 bg-surface px-2.5 py-1.5 text-sm">
                  <strong className="text-crit-ink">{d.flat.id}</strong> <span className="text-ink-2">{flatName(d.flat)}</span>
                  {d.months.length > 1 && <span className="ml-1 text-xs font-bold text-crit-ink">· {t("months", { n: d.months.length })}</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-crit/25 bg-surface/60 px-4 py-2.5">
          <button className="btn btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? t("hideDetails") : t("showDetails")}
          </button>
          <WhatsAppButton small label={t("remind")} text={groupReminderText(db, dues, lang, appUrl())} />
        </div>
        {open && (
          <div className="overflow-x-auto border-t border-crit/25 bg-surface">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2">#</th>
                  <th className="px-2 py-2">{t("owner")}</th>
                  <th className="px-2 py-2">{t("monthsPending")}</th>
                  <th className="px-4 py-2 text-right">{t("pending")}</th>
                </tr>
              </thead>
              <tbody>
                {dues.overdue.map((d) => (
                  <tr key={d.flat.id} className="border-t border-line">
                    <td className="px-4 py-2 font-bold">{d.flat.id}</td>
                    <td className="px-2 py-2">{flatName(d.flat)}</td>
                    <td className="px-2 py-2 text-ink-2">{d.months.map((m) => monthLabel(m.month, lang, true)).join(", ")}</td>
                    <td className="tnum px-4 py-2 text-right font-bold text-crit-ink">{inr(d.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  }

  if (dues.upcoming.length && dues.graceMonth) {
    return (
      <section className="rounded-2xl border border-warn bg-warn-bg p-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-warn-ink">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          {t("upcomingTitle", { month: monthLabel(dues.graceMonth, lang), day: dues.dueDay })}
        </h2>
        <p className="mt-1 text-sm text-warn-ink">
          {dues.upcoming.map((d) => d.flat.id).join(", ")} · <strong className="tnum">{inr(dues.upcomingTotal)}</strong>
        </p>
      </section>
    );
  }

  return (
    <section className="flex items-center gap-2 rounded-2xl border border-good/40 bg-good-bg p-4 text-good-ink">
      <StatusIcon status="paid" size={18} />
      <p className="font-semibold">{t("allPaid")}</p>
    </section>
  );
}

/* ---------- month switcher ---------- */

export function MonthSwitcher({ months, value, onChange }: { months: MonthKey[]; value: MonthKey; onChange: (m: MonthKey) => void }) {
  const { lang, t } = useApp();
  const i = months.indexOf(value);
  return (
    <div className="flex items-center justify-between gap-2">
      <button className="btn h-11 w-11 p-0" disabled={i <= 0} onClick={() => onChange(months[i - 1])} aria-label={t("prev")}>
        ‹
      </button>
      <label className="relative flex-1 text-center">
        <span className="sr-only">{t("month")}</span>
        <select
          className="w-full cursor-pointer appearance-none rounded-xl bg-transparent px-2 py-1 text-center text-xl font-extrabold"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {months
            .slice()
            .reverse()
            .map((m) => (
              <option key={m} value={m}>
                {monthLabel(m, lang)}
              </option>
            ))}
        </select>
      </label>
      <button className="btn h-11 w-11 p-0" disabled={i >= months.length - 1} onClick={() => onChange(months[i + 1])} aria-label={t("next")}>
        ›
      </button>
    </div>
  );
}

/* ---------- summary tiles ---------- */

export function SummaryTiles({ s }: { s: MonthSummary }) {
  const { t } = useApp();
  const pct = s.flats.length ? Math.round((s.paidCount / s.flats.length) * 100) : 0;
  const negative = s.closing < 0;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div className="card col-span-2 p-4 sm:col-span-1">
        <p className="text-sm font-semibold text-ink-2">{t("collected")}</p>
        <p className="mt-1 text-3xl font-extrabold">{inr(s.income)}</p>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-good" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1.5 text-sm text-ink-2">{t("flatsPaid", { n: s.paidCount, total: s.flats.length })}</p>
        {s.collectionIncome > 0 && (
          <p className="mt-0.5 text-xs text-muted">
            {t("maintenance")} {inr(s.maintenanceCollected)} · {t("specialWorks")} {inr(s.collectionIncome)}
          </p>
        )}
      </div>
      <div className="card p-4">
        <p className="text-sm font-semibold text-ink-2">{t("spent")}</p>
        <p className="mt-1 text-2xl font-extrabold sm:text-3xl">{inr(s.spent)}</p>
        <p className="mt-1.5 text-xs text-muted">
          {t("regularOut")} {inr(s.regularExpenses)}
          {s.collectionCosts > 0 && (
            <>
              {" · "}
              {t("worksOut")} {inr(s.collectionCosts)}
            </>
          )}
        </p>
      </div>
      <div className={`card p-4 ${negative ? "border-crit/50 bg-crit-bg" : ""}`}>
        <p className={`flex items-center gap-1 text-sm font-semibold ${negative ? "text-crit-ink" : "text-ink-2"}`}>
          {negative ? "▼ " + t("shortage") : t("balance")}
        </p>
        <p className={`mt-1 text-2xl font-extrabold sm:text-3xl ${negative ? "text-crit-ink" : "text-good-ink"}`}>{inr(s.closing)}</p>
        <p className="mt-1.5 text-xs text-muted">
          {t("opening")} {inr(s.opening)}
        </p>
      </div>
    </div>
  );
}

/* ---------- building grid ---------- */

export function BuildingGrid({ s, onPick }: { s: MonthSummary; onPick: (f: Flat) => void }) {
  const { t } = useApp();
  const floors = useMemo(() => {
    const map = new Map<number, FlatMonthStatus[]>();
    for (const f of s.flats) map.set(f.flat.floor, [...(map.get(f.flat.floor) ?? []), f]);
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [s.flats]);

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">{t("building")}</h2>
        <p className="text-xs text-muted">{t("tapFlat")}</p>
      </div>
      <div className="relative rounded-xl border border-line bg-surface-2 p-2 sm:p-3">
        <div className="space-y-2">
          {floors.map(([floor, flats]) => (
            <div key={floor} className="flex items-stretch gap-2">
              <div className="flex w-7 shrink-0 items-center justify-center text-xs font-bold text-muted" aria-label={t("floor", { n: floor })}>
                F{floor}
              </div>
              <div className="grid flex-1 grid-cols-3 gap-2">
                {flats.map((f) => {
                  const tone =
                    f.status === "paid"
                      ? "border-good/50 bg-good-bg"
                      : f.status === "partial"
                        ? "border-warn bg-warn-bg"
                        : "border-crit bg-crit-bg";
                  const ink = f.status === "paid" ? "text-good-ink" : f.status === "partial" ? "text-warn-ink" : "text-crit-ink";
                  return (
                    <button
                      key={f.flat.id}
                      onClick={() => onPick(f.flat)}
                      className={`group min-h-[76px] rounded-xl border-2 p-2 text-left transition hover:-translate-y-0.5 hover:shadow-md ${tone}`}
                      aria-label={`${f.flat.id} ${f.flat.owner}: ${t(f.status === "paid" ? "paid" : f.status === "partial" ? "partial" : "unpaid")}`}
                    >
                      <span className="flex items-center justify-between gap-1">
                        <span className="text-lg font-extrabold leading-none">{f.flat.id}</span>
                        <span className={`grid h-5 w-5 place-items-center rounded-full ${ink} bg-surface`}>
                          <StatusIcon status={f.status} size={12} />
                        </span>
                      </span>
                      <span className="mt-1 block truncate text-xs font-medium text-ink-2">{f.flat.resident ?? f.flat.owner}</span>
                      <span className={`mt-0.5 block text-[11px] font-bold ${ink}`}>
                        {f.status === "paid" ? inr(f.paid) : f.status === "partial" ? `${inr(f.pending)} ${t("pending")}` : t("unpaid")}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1"><span className="text-good-ink"><StatusIcon status="paid" /></span>{t("paid")} {s.paidCount}</span>
        {s.partialCount > 0 && <span className="inline-flex items-center gap-1"><span className="text-warn-ink"><StatusIcon status="partial" /></span>{t("partial")} {s.partialCount}</span>}
        <span className="inline-flex items-center gap-1"><span className="text-crit-ink"><StatusIcon status="unpaid" /></span>{t("unpaid")} {s.unpaidCount}</span>
      </div>
    </section>
  );
}

/* ---------- flat details ---------- */

export function FlatSheet({ db, flat, onClose }: { db: DB; flat: Flat | null; onClose: () => void }) {
  const { t, lang } = useApp();
  const history = useMemo(() => (flat ? flatHistory(db, flat) : []), [db, flat]);
  if (!flat) return null;
  const dueMonths = history.filter((h) => h.pending > 0).map((h) => ({ month: h.month, pending: h.pending }));
  return (
    <Sheet open onClose={onClose} title={`${t("floor", { n: flat.floor })} · ${flat.id}`} closeLabel={t("close")}>
      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-surface-2 p-3">
          <dt className="text-xs font-semibold text-muted">{t("owner")}</dt>
          <dd className="font-bold">{flat.owner}</dd>
        </div>
        <div className="rounded-xl bg-surface-2 p-3">
          <dt className="text-xs font-semibold text-muted">{t("resident")}</dt>
          <dd className="font-bold">{flat.resident ?? flat.owner}</dd>
        </div>
      </dl>
      {dueMonths.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-crit bg-crit-bg p-3">
          <p className="text-sm font-bold text-crit-ink">
            {t("totalPending")}: {inr(dueMonths.reduce((s, m) => s + m.pending, 0))}
          </p>
          <WhatsAppButton small label={t("remind")} phone={flat.phone} text={flatReminderText(db, flat, dueMonths, lang)} />
        </div>
      )}
      <h3 className="mt-4 mb-2 text-sm font-bold uppercase tracking-wide text-muted">{t("paymentHistory")}</h3>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {history.map((h) => (
          <li key={h.month} className="p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{monthLabel(h.month, lang)}</span>
              <StatusChip status={h.status} />
            </div>
            <p className="mt-1 text-sm text-ink-2">
              {t("maintenance")}: <span className="tnum font-semibold text-ink">{inr(h.paid)}</span> / {inr(h.due)}
              {h.lastPaidOn && <> · {t("paidOn", { date: formatDate(h.lastPaidOn, lang) })}</>}
            </p>
            {h.collections.map((c) => (
              <p key={c.id} className="mt-0.5 text-sm text-ink-2">
                {categoryLabel(c.title, lang)}: <span className={`tnum font-semibold ${c.paid >= c.due ? "text-good-ink" : "text-crit-ink"}`}>{inr(c.paid)}</span> / {inr(c.due)}
              </p>
            ))}
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

/* ---------- expenses ---------- */

export function ExpenseSection({ db, s }: { db: DB; s: MonthSummary }) {
  const { t, lang } = useApp();
  const [showAll, setShowAll] = useState(false);
  const items = db.expenses.filter((e) => e.month === s.month);
  const max = Math.max(1, ...s.byCategory.map((c) => c.amount));
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-bold">{t("expenses")}</h2>
        <p className="tnum text-sm font-bold">{inr(s.spent)}</p>
      </div>
      {s.byCategory.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">{t("noExpenses")}</p>
      ) : (
        <ul className="space-y-2.5" aria-label={t("expenses")}>
          {s.byCategory.map((c) => (
            <li key={c.category} title={`${categoryLabel(c.category, lang)}: ${inr(c.amount)}`}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate text-ink-2">{categoryLabel(c.category, lang)}</span>
                <span className="tnum font-semibold">{inr(c.amount)}</span>
              </div>
              <div className="h-2.5 rounded-full bg-surface-2">
                <div
                  className="h-full rounded-[4px] bg-series-1 transition-[width] duration-500"
                  style={{ width: `${Math.max(2, (c.amount / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      {items.length > 0 && (
        <>
          <button className="mt-3 text-sm font-semibold text-brand underline-offset-2 hover:underline" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
            {showAll ? t("hideDetails") : t("showDetails")}
          </button>
          {showAll && (
            <ul className="mt-2 divide-y divide-line rounded-xl border border-line text-sm">
              {items.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 p-3">
                  <span className="min-w-0">
                    <span className="block font-medium">{e.label}</span>
                    <span className="block text-xs text-muted">
                      {categoryLabel(e.category, lang)}
                      {e.date && <> · {formatDate(e.date, lang)}</>}
                      {e.note && <> · {e.note}</>}
                    </span>
                    {e.receiptId && (
                      <a className="text-xs font-semibold text-brand underline" href={`/api/receipts/${e.receiptId}`} target="_blank" rel="noopener noreferrer">
                        📎 {t("receipt")}
                      </a>
                    )}
                  </span>
                  <span className="tnum shrink-0 font-semibold">{inr(e.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/* ---------- additional works ---------- */

export function CollectionsSection({ s }: { s: MonthSummary }) {
  const { t, lang } = useApp();
  if (!s.collections.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="px-1 text-lg font-bold">{t("specialWorks")}</h2>
      {s.collections.map((c) => {
        const pct = c.expected ? Math.min(100, Math.round((c.collected / c.expected) * 100)) : 0;
        return (
          <article key={c.collection.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-bold">{categoryLabel(c.collection.title, lang)}</h3>
                {c.collection.description && <p className="text-sm text-ink-2">{c.collection.description}</p>}
              </div>
              <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand">
                {inr(c.collection.perFlatAmount)} {t("perFlat")}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-surface-2 p-2">
                <p className="text-xs text-muted">{t("collected")}</p>
                <p className="tnum font-bold">{inr(c.collected)}</p>
              </div>
              <div className="rounded-xl bg-surface-2 p-2">
                <p className="text-xs text-muted">{t("cost")}</p>
                <p className="tnum font-bold">{inr(c.cost)}</p>
              </div>
              <div className={`rounded-xl p-2 ${c.net < 0 ? "bg-crit-bg" : "bg-good-bg"}`}>
                <p className={`text-xs ${c.net < 0 ? "text-crit-ink" : "text-good-ink"}`}>{c.net < 0 ? t("shortage") : t("balance")}</p>
                <p className={`tnum font-bold ${c.net < 0 ? "text-crit-ink" : "text-good-ink"}`}>{inr(c.net)}</p>
              </div>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-good" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-xs text-ink-2">{t("collectedOf", { a: inr(c.collected), b: inr(c.expected) })}</p>
            {c.pendingFlats.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-crit-ink">{t("notPaidYet")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {c.pendingFlats.map((p) => (
                    <span key={p.flat.id} className="rounded-lg bg-crit-bg px-2 py-1 text-xs font-bold text-crit-ink">
                      {p.flat.id} · {p.flat.resident ?? p.flat.owner}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {c.collection.costs.length > 0 && (
              <ul className="mt-3 divide-y divide-line rounded-xl border border-line text-sm">
                {c.collection.costs.map((x) => (
                  <li key={x.id} className="flex justify-between gap-2 px-3 py-2">
                    <span className="text-ink-2">
                      {x.label}
                      {x.receiptId && (
                        <a className="ml-2 text-xs font-semibold text-brand underline" href={`/api/receipts/${x.receiptId}`} target="_blank" rel="noopener noreferrer">
                          📎 {t("receipt")}
                        </a>
                      )}
                    </span>
                    <span className="tnum font-semibold">{inr(x.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        );
      })}
    </section>
  );
}

/* ---------- balance waterfall ---------- */

export function Waterfall({ s }: { s: MonthSummary }) {
  const { t } = useApp();
  type Step = { key: string; label: string; value: number; kind: "total" | "in" | "out" };
  const steps: Step[] = [
    { key: "open", label: t("opening"), value: s.opening, kind: "total" },
    { key: "mi", label: t("maintenanceIn"), value: s.maintenanceCollected, kind: "in" },
    ...(s.collectionIncome ? [{ key: "wi", label: t("worksIn"), value: s.collectionIncome, kind: "in" as const }] : []),
    { key: "ro", label: t("regularOut"), value: -s.regularExpenses, kind: "out" },
    ...(s.collectionCosts ? [{ key: "wo", label: t("worksOut"), value: -s.collectionCosts, kind: "out" as const }] : []),
    { key: "close", label: t("closing"), value: s.closing, kind: "total" },
  ];
  // Running position of each bar.
  let run = 0;
  const bars = steps.map((st) => {
    if (st.kind === "total") {
      run = st.value;
      return { ...st, from: Math.min(0, st.value), to: Math.max(0, st.value) };
    }
    const start = run;
    run += st.value;
    return { ...st, from: Math.min(start, run), to: Math.max(start, run) };
  });
  const lo = Math.min(0, ...bars.map((b) => b.from));
  const hi = Math.max(0, ...bars.map((b) => b.to));
  const span = hi - lo || 1;
  const pos = (v: number) => ((v - lo) / span) * 100;

  return (
    <section className="card p-4">
      <h2 className="mb-3 text-lg font-bold">{t("howBalance")}</h2>
      <ul className="space-y-2.5">
        {bars.map((b) => {
          const color = b.kind === "in" ? "var(--series-1)" : b.kind === "out" ? "var(--series-out)" : "var(--neutral-bar)";
          const sign = b.kind === "in" ? "+ " : b.kind === "out" ? "− " : "";
          return (
            <li key={b.key}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span className={b.kind === "total" ? "font-bold" : "text-ink-2"}>{b.label}</span>
                <span className={`tnum font-bold ${b.kind === "total" && b.value < 0 ? "text-crit-ink" : ""}`}>
                  {sign}
                  {inr(Math.abs(b.value)).replace("−", "")}
                  {b.kind === "total" && b.value < 0 ? ` (${t("shortage")})` : ""}
                </span>
              </div>
              <div className="relative h-3 rounded-full bg-surface-2">
                <div className="absolute inset-y-[-3px] w-px bg-[var(--axis)]" style={{ left: `${pos(0)}%` }} aria-hidden />
                <div
                  className="absolute inset-y-0 rounded-[4px]"
                  style={{ left: `${pos(b.from)}%`, width: `${b.to === b.from ? 0 : Math.max(0.8, pos(b.to) - pos(b.from))}%`, background: color }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

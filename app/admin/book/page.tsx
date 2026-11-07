"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { DB } from "@/lib/types";
import { activeMonths, inr } from "@/lib/calc";
import { addMonths, currentMonth, formatDate, monthLabel } from "@/lib/dates";
import {
  bookTotals,
  hasExpensePart,
  MAX_EXPENSES,
  MAX_INCOME,
  rowsFromFlats,
  sortedSheets,
  type BookAction,
  type BookLineInput,
  type BookSheet,
} from "@/lib/book";
import { useApp } from "@/components/AppProvider";
import { Header } from "@/components/Header";
import { AdminToasts, Field, SectionTitle, useAdmin } from "@/components/admin/ui";
import { useBook } from "@/components/book/useBook";

/** Offline book pages: print the names to sign, later print the expenses on the same sheet. */
export default function BookAdminPage() {
  const { db, admin, role, loading } = useApp();
  return (
    <>
      <Header adminArea />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-4">
        {loading && !db ? (
          <p className="py-20 text-center text-ink-2">Loading…</p>
        ) : !admin || !db ? (
          <p className="card mt-6 p-6 text-center">
            Please{" "}
            <Link className="font-bold text-brand underline" href="/admin">
              log in as admin
            </Link>{" "}
            to use the book pages.
          </p>
        ) : (
          <AdminToasts>
            <BookPages db={db} isManager={role === "manager"} />
          </AdminToasts>
        )}
      </main>
    </>
  );
}

function BookPages({ db, isManager }: { db: DB; isManager: boolean }) {
  const { book, error, act } = useBook(true);
  const { toast } = useAdmin();
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => setOpenId(new URLSearchParams(window.location.search).get("id")), []);

  const run = async (a: BookAction, ok = "Saved") => {
    const err = await act(a);
    toast(err ?? ok, !!err);
    return !err;
  };

  const sheets = book ? sortedSheets(book) : [];
  // Open a page as soon as it has been made.
  const [pendingMonth, setPendingMonth] = useState<string | null>(null);
  useEffect(() => {
    const made = pendingMonth && book?.sheets.find((s) => s.month === pendingMonth);
    if (made) {
      setPendingMonth(null);
      setOpenId(made.id);
      window.history.replaceState(null, "", `/admin/book?id=${made.id}`);
    }
  }, [pendingMonth, book]);
  const open = sheets.find((s) => s.id === openId) ?? null;
  const cur = currentMonth();
  const freeMonths = useMemo(() => {
    const months = isManager ? [cur] : Array.from(new Set([...activeMonths(db), cur, addMonths(cur, 1)])).sort();
    return months.filter((m) => !sheets.some((s) => s.month === m)).reverse();
  }, [db, isManager, cur, sheets]);

  const select = (id: string | null) => {
    setOpenId(id);
    window.history.replaceState(null, "", id ? `/admin/book?id=${id}` : "/admin/book");
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-extrabold">Book pages</h1>
          <p className="text-sm text-ink-2">A printed paper record for each month, kept apart from the app’s figures.</p>
        </div>
        <Link href="/admin" className="btn btn-sm">
          ← Admin
        </Link>
      </div>

      {error && <p className="rounded-xl bg-crit-bg px-4 py-2.5 text-sm font-semibold text-crit-ink">{error}</p>}
      {!book ? (
        !error && <p className="py-10 text-center text-ink-2">Loading…</p>
      ) : open ? (
        <SheetEditor
          key={`${open.id}-${open.updatedAt}`}
          db={db}
          sheet={open}
          canEdit={!isManager || open.month === cur}
          canDelete={!isManager}
          run={run}
          onClose={() => select(null)}
        />
      ) : (
        <>
          <HowItWorks />
          <NewSheet months={freeMonths} isManager={isManager} onCreate={async (month, pageNo) => {
            const err = await act({ type: "sheet.create", month, pageNo });
            if (err) return toast(err, true);
            toast("Book page made");
            setPendingMonth(month);
          }} />
          {sheets.length > 0 && (
            <ul className="space-y-2">
              {sheets.map((s) => (
                <li key={s.id}>
                  <button className="card flex w-full items-center gap-3 p-3 text-left hover:bg-surface-2" onClick={() => select(s.id)}>
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-lg" aria-hidden>
                      📒
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">
                        {monthLabel(s.month)}
                        {s.pageNo && <span className="font-semibold text-ink-2"> · Page {s.pageNo}</span>}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        <Chip on={!!s.printedNames}>{s.printedNames ? `Names printed ${formatDate(s.printedNames)}` : "Names not printed"}</Chip>
                        <Chip on={hasExpensePart(s)}>{hasExpensePart(s) ? "Expenses filled" : "Expenses not filled"}</Chip>
                        {s.printedExpenses && <Chip on>{`Expenses printed ${formatDate(s.printedExpenses)}`}</Chip>}
                        {s.notPaid.length > 0 && <Chip bad>{`Not paid: ${s.notPaid.join(", ")}`}</Chip>}
                      </span>
                    </span>
                    {s.collected !== null && <span className="tnum text-sm font-bold">{inr(bookTotals(s).closing)}</span>}
                    <span className="text-muted" aria-hidden>
                      ›
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function Chip({ on, bad, children }: { on?: boolean; bad?: boolean; children: React.ReactNode }) {
  const cls = bad ? "bg-crit-bg text-crit-ink" : on ? "bg-good-bg text-good-ink" : "bg-surface-2 text-muted";
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${cls}`}>{children}</span>;
}

function HowItWorks() {
  return (
    <div className="card p-4 text-sm text-ink-2">
      <p className="font-bold text-ink">How it works</p>
      <ol className="mt-1 list-decimal space-y-1 pl-5">
        <li>
          Make a page for the month and <strong>print the names</strong>. Each flat gets a row to sign and write the amount and date.
        </li>
        <li>
          When collection is done, <strong>fill in the expenses</strong> here, or tap <strong>Sync with app</strong> to copy everything from the app.
        </li>
        <li>
          Put the <strong>same signed sheet</strong> back in the printer and <strong>print the expenses</strong>. Only the box at the bottom prints; the handwritten top stays as it is.
        </li>
      </ol>
      <p className="mt-2 text-xs text-muted">These pages are stored separately. Changing them doesn’t change the app’s payments or expenses.</p>
    </div>
  );
}

function NewSheet({ months, isManager, onCreate }: { months: string[]; isManager: boolean; onCreate: (month: string, pageNo?: string) => Promise<unknown> }) {
  const [month, setMonth] = useState(months[0] ?? "");
  const [pageNo, setPageNo] = useState("");
  const [busy, setBusy] = useState(false);
  const m = months.includes(month) ? month : months[0];
  if (!m)
    return (
      <p className="card p-4 text-sm text-ink-2">
        {isManager ? "This month’s book page is already made." : "Every month already has a book page."}
      </p>
    );
  return (
    <form
      className="card flex flex-wrap items-end gap-3 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onCreate(m, pageNo.trim() || undefined);
        setBusy(false);
      }}
    >
      <div className="min-w-[10rem] flex-1">
        <Field label="New page for">
          <select className="input font-bold" value={m} onChange={(e) => setMonth(e.target.value)}>
            {months.map((x) => (
              <option key={x} value={x}>
                {monthLabel(x)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="w-28">
        <Field label="Page no.">
          <input className="input" value={pageNo} onChange={(e) => setPageNo(e.target.value)} placeholder="Auto" inputMode="numeric" maxLength={12} />
        </Field>
      </div>
      <button className="btn btn-primary" disabled={busy}>
        {busy ? "Making…" : "+ Make page"}
      </button>
    </form>
  );
}

/* ---------- editor ---------- */

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

type Line = { label: string; amount: string; note: string };
const toLines = (ls: { label?: string; amount?: number | string; note?: string }[]): Line[] =>
  ls.map((l) => ({ label: l.label ?? "", amount: l.amount === undefined ? "" : String(l.amount), note: l.note ?? "" }));
const numOr = (s: string): number | null => (s.trim() === "" ? null : Number(s));

function SheetEditor({
  db,
  sheet,
  canEdit,
  canDelete,
  run,
  onClose,
}: {
  db: DB;
  sheet: BookSheet;
  canEdit: boolean;
  canDelete: boolean;
  run: (a: BookAction, ok?: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [pageNo, setPageNo] = useState(sheet.pageNo ?? "");
  const [rows, setRows] = useState(sheet.rows);
  const [collected, setCollected] = useState(sheet.collected === null ? "" : String(sheet.collected));
  const [income, setIncome] = useState<Line[]>(toLines(sheet.income));
  const [expenses, setExpenses] = useState<Line[]>(toLines(sheet.expenses));
  const [prev, setPrev] = useState(sheet.previousBalance === null ? "" : String(sheet.previousBalance));
  const [notes, setNotes] = useState(sheet.notes ?? "");
  const [notPaid, setNotPaid] = useState<string[]>(sheet.notPaid);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setDirty(true);
  };

  const clean = (ls: Line[]): BookLineInput[] => ls.filter((l) => l.label.trim() || l.amount.trim()).map((l) => ({ label: l.label, amount: l.amount, note: l.note }));
  const preview = bookTotals({
    collected: numOr(collected),
    previousBalance: numOr(prev),
    income: clean(income).map((l, i) => ({ id: String(i), label: l.label ?? "", amount: Number(l.amount) || 0 })),
    expenses: clean(expenses).map((l, i) => ({ id: String(i), label: l.label ?? "", amount: Number(l.amount) || 0 })),
  });

  const save = async (ok = "Saved") => {
    setBusy(true);
    const done = await run(
      {
        type: "sheet.save",
        id: sheet.id,
        sheet: { pageNo, rows, collected: collected.trim() === "" ? null : collected, income: clean(income), expenses: clean(expenses), previousBalance: prev.trim() === "" ? null : prev, notes, notPaid },
      },
      ok,
    );
    setBusy(false);
    if (done) setDirty(false);
    return done;
  };

  const goPrint = async (part: "names" | "expenses" | "notPaid" | "full") => {
    if (dirty && canEdit && !(await save("Saved — opening print"))) return;
    window.location.href = `/admin/book/print?id=${sheet.id}&part=${part}`;
  };

  const syncWithApp = async () => {
    const msg = dirty
      ? "Sync replaces the names, money, expenses and not-paid flats on this page with the app’s. Your unsaved changes here will be lost. Continue?"
      : "Sync replaces the names, money, expenses and not-paid flats on this page with the app’s. Continue?";
    if (!confirm(msg)) return;
    setBusy(true);
    await run({ type: "sheet.sync", id: sheet.id }, "Synced with the app");
    setBusy(false);
  };

  const templates = db.settings.expenseTemplates.filter((t) => !expenses.some((e) => e.label.trim() === t.label));
  const filled = collected.trim() !== "" || clean(expenses).length > 0 || clean(income).length > 0 || notes.trim() !== "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button className="btn btn-sm" onClick={() => (!dirty || confirm("Leave without saving?")) && onClose()}>
          ← All pages
        </button>
        <p className="text-xs text-muted">
          Last saved {formatDate(sheet.updatedAt)} by {sheet.updatedBy}
        </p>
      </div>
      {!canEdit && (
        <p className="rounded-xl bg-surface-2 px-4 py-2.5 text-sm text-ink-2">Managers can print this page but only change the current month’s page.</p>
      )}

      {canEdit && (
        <section className="card flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="font-bold">Sync with the app</p>
            <p className="text-sm text-ink-2">
              Copies this month from the app: names, maintenance collected, expenses, additional works, previous balance and who hasn’t paid. Sync as often
              as you like.
              {sheet.syncedAt && <span className="block text-xs text-muted">Last synced {formatDateTime(sheet.syncedAt)}</span>}
            </p>
          </div>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={syncWithApp}>
            ⟳ Sync with app
          </button>
        </section>
      )}

      {/* step 1 */}
      <section className="card p-4">
        <SectionTitle action={<button className="btn btn-primary" onClick={() => goPrint("names")}>🖨 Print names</button>}>
          1 · Names to sign · {monthLabel(sheet.month)}
        </SectionTitle>
        <p className="mb-3 text-sm text-ink-2">Print on a blank A4 sheet. Residents sign and write the amount and date by hand.</p>
        <fieldset disabled={!canEdit} className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-28">
              <Field label="Page no.">
                <input className="input" value={pageNo} onChange={(e) => touch(setPageNo)(e.target.value)} maxLength={12} />
              </Field>
            </div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                touch(setRows)(rowsFromFlats(db));
              }}
            >
              ↻ Names from Flats list
            </button>
          </div>
          <div className="divide-y divide-line rounded-xl ring-1 ring-line">
            {rows.map((r, i) => (
              <label key={r.flatId} className="flex items-center gap-2 px-3 py-1.5">
                <span className="tnum w-10 shrink-0 font-bold">{r.flatId}</span>
                <input
                  className="input py-1.5"
                  value={r.name}
                  maxLength={80}
                  onChange={(e) => touch(setRows)(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  aria-label={`Name for flat ${r.flatId}`}
                />
              </label>
            ))}
          </div>
          <p className="text-xs text-muted">Names here are only for the printed page; the Flats list isn’t changed.</p>
        </fieldset>
      </section>

      {/* step 2 */}
      <section className="card p-4">
        <SectionTitle>
          2 · After collection: expenses & balance
        </SectionTitle>
        <p className="mb-3 text-sm text-ink-2">This prints in the box at the bottom of the same sheet. Leave it empty until collection is done.</p>
        <fieldset disabled={!canEdit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Maintenance collected (₹)" hint="Total of the amounts written on the sheet">
              <input className="input tnum" inputMode="decimal" value={collected} onChange={(e) => touch(setCollected)(e.target.value)} placeholder="e.g. 19500" />
            </Field>
            <Field label="Previous balance (₹)" hint="From the last page. Use minus for a shortage, e.g. -9452. Leave empty to skip.">
              <input className="input tnum" inputMode="text" value={prev} onChange={(e) => touch(setPrev)(e.target.value)} placeholder="e.g. -9452" />
            </Field>
          </div>

          <div>
            <p className="label">Expenses</p>
            <LinesEditor lines={expenses} onChange={touch(setExpenses)} max={MAX_EXPENSES} placeholder="e.g. Salary" />
            {canEdit && templates.length > 0 && expenses.length < MAX_EXPENSES && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {templates.map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink-2 ring-1 ring-line hover:text-ink"
                    onClick={() => touch(setExpenses)([...expenses, { label: t.label, amount: String(t.amount || ""), note: "" }])}
                  >
                    + {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="label">Other money received</p>
            <p className="mb-1.5 text-xs text-muted">For example pest-control contributions. Leave empty if none.</p>
            <LinesEditor lines={income} onChange={touch(setIncome)} max={MAX_INCOME} placeholder="e.g. Pest control received" />
          </div>

          <div>
            <p className="label">Not paid</p>
            <p className="mb-2 text-xs text-muted">
              Tap the flats that haven’t paid. On paper their row gets a red outline and the amount column says <strong className="text-crit-ink">NOT PAID</strong>.
            </p>
            <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-8">
              {rows.map((r) => {
                const on = notPaid.includes(r.flatId);
                return (
                  <button
                    key={r.flatId}
                    type="button"
                    aria-pressed={on}
                    title={r.name}
                    onClick={() => touch(setNotPaid)(on ? notPaid.filter((x) => x !== r.flatId) : rows.map((x) => x.flatId).filter((id) => id === r.flatId || notPaid.includes(id)))}
                    className={`tnum rounded-lg py-2 text-sm font-bold ring-1 transition ${on ? "bg-crit text-white ring-crit" : "bg-surface text-ink-2 ring-line hover:text-ink"}`}
                  >
                    {r.flatId}
                  </button>
                );
              })}
            </div>
            {notPaid.length > 0 && (
              <p className="mt-1.5 text-xs font-semibold text-crit-ink">
                {notPaid.length} not paid: {notPaid.join(", ")}
              </p>
            )}
          </div>

          <Field label="Note" hint="Printed in red in the box, e.g. who hasn’t paid or something to check">
            <textarea className="input min-h-[4.5rem] font-semibold text-crit-ink" value={notes} maxLength={600} onChange={(e) => touch(setNotes)(e.target.value)} placeholder="Not paid: 102, 202" />
          </Field>

          <div className="rounded-xl bg-surface-2 p-3 text-sm">
            <Row l="Maintenance collected" v={inr(preview.collected)} />
            {preview.otherIncome > 0 && <Row l="+ Other money received" v={inr(preview.otherIncome)} />}
            <Row l="− Total expenses" v={inr(preview.spent)} />
            <Row l="This month" v={inr(preview.net)} strong />
            {prev.trim() !== "" && (
              <>
                <Row l="Previous balance" v={inr(Number(prev) || 0)} />
                <Row l={preview.closing < 0 ? "Closing (shortage)" : "Closing balance"} v={inr(preview.closing)} strong crit={preview.closing < 0} />
              </>
            )}
          </div>
        </fieldset>
      </section>

      <div className="sticky bottom-3 z-10 flex flex-wrap gap-2 rounded-2xl bg-surface/95 p-2 shadow-lg ring-1 ring-line backdrop-blur">
        {canEdit && (
          <button className="btn btn-primary flex-1" disabled={busy || !dirty} onClick={() => save()}>
            {busy ? "Saving…" : dirty ? "Save" : "Saved ✓"}
          </button>
        )}
        <button className="btn flex-1" disabled={!filled} onClick={() => goPrint("expenses")} title={filled ? undefined : "Fill in the expenses first"}>
          🖨 Expenses
        </button>
        {notPaid.length > 0 && (
          <button className="btn flex-1 text-crit-ink" onClick={() => goPrint("notPaid")}>
            🖨 Not paid
          </button>
        )}
        <button className="btn" onClick={() => goPrint("full")}>
          🖨 Full page
        </button>
      </div>

      {canDelete && (
        <button
          className="text-sm font-semibold text-crit-ink underline"
          onClick={async () => {
            if (!confirm(`Delete the book page for ${monthLabel(sheet.month)}? This can’t be undone.`)) return;
            if (await run({ type: "sheet.delete", id: sheet.id }, "Book page deleted")) onClose();
          }}
        >
          Delete this book page
        </button>
      )}
    </div>
  );
}

function Row({ l, v, strong, crit }: { l: string; v: string; strong?: boolean; crit?: boolean }) {
  return (
    <div className={`flex justify-between py-0.5 ${strong ? "border-t border-line pt-1 font-bold" : ""} ${crit ? "text-crit-ink" : ""}`}>
      <span>{l}</span>
      <span className="tnum">{v}</span>
    </div>
  );
}

function LinesEditor({ lines, onChange, max, placeholder }: { lines: Line[]; onChange: (l: Line[]) => void; max: number; placeholder: string }) {
  const set = (i: number, patch: Partial<Line>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div className="space-y-2">
      {lines.map((l, i) => (
        <div key={i} className="rounded-xl p-2 ring-1 ring-line">
          <div className="flex gap-2">
            <input className="input min-w-0 flex-1 font-semibold" value={l.label} maxLength={120} onChange={(e) => set(i, { label: e.target.value })} placeholder={placeholder} aria-label="Item" />
            <button type="button" className="btn btn-sm px-2.5" onClick={() => onChange(lines.filter((_, j) => j !== i))} aria-label="Remove line">
              ✕
            </button>
          </div>
          <div className="mt-1.5 flex gap-2">
            <input className="input tnum w-28 shrink-0" inputMode="decimal" value={l.amount} onChange={(e) => set(i, { amount: e.target.value })} placeholder="₹ amount" aria-label="Amount" />
            <input className="input min-w-0 flex-1 text-sm" value={l.note} maxLength={120} onChange={(e) => set(i, { note: e.target.value })} placeholder="Note (optional)" aria-label="Note" />
          </div>
        </div>
      ))}
      {lines.length < max ? (
        <button type="button" className="btn btn-sm" onClick={() => onChange([...lines, { label: "", amount: "", note: "" }])}>
          + Add line
        </button>
      ) : (
        <p className="text-xs text-muted">The page has room for {max} lines.</p>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { DB } from "@/lib/types";
import { activeMonths, inr, maintenanceDue } from "@/lib/calc";
import { addMonths, currentMonth, formatDate, monthLabel } from "@/lib/dates";
import {
  bookTotals,
  hasExpensePart,
  MAX_EXPENSES,
  MAX_INCOME,
  parseAmount,
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
          key={`${open.id}-${open.syncedAt ?? ""}`}
          db={db}
          sheet={open}
          canEdit={!isManager || open.month === cur}
          canDelete={!isManager}
          run={run}
          act={act}
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
/** Reads an amount as typed ("1,500", "−10,052"); null when empty or not a number. */
const numOr = (s: string): number | null => {
  const v = parseAmount(s);
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function SheetEditor({
  db,
  sheet,
  canEdit,
  canDelete,
  run,
  act,
  onClose,
}: {
  db: DB;
  sheet: BookSheet;
  canEdit: boolean;
  canDelete: boolean;
  run: (a: BookAction, ok?: string) => Promise<boolean>;
  act: (a: BookAction) => Promise<string | null>;
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
  const [paid, setPaid] = useState<string[]>(sheet.paid);
  const [busy, setBusy] = useState(false);

  // Saving: every change is saved automatically a moment after you stop typing;
  // Enter saves straight away. `edits` counts changes, `savedAt` the last one saved.
  const [edits, setEdits] = useState(0);
  const [savedEdits, setSavedEdits] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dirty = edits !== savedEdits;
  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setEdits((n) => n + 1);
  };

  const clean = (ls: Line[]): BookLineInput[] => ls.filter((l) => l.label.trim() || l.amount.trim()).map((l) => ({ label: l.label, amount: l.amount, note: l.note }));
  const preview = bookTotals({
    collected: numOr(collected),
    previousBalance: numOr(prev),
    income: clean(income).map((l, i) => ({ id: String(i), label: l.label ?? "", amount: numOr(String(l.amount)) ?? 0 })),
    expenses: clean(expenses).map((l, i) => ({ id: String(i), label: l.label ?? "", amount: numOr(String(l.amount)) ?? 0 })),
  });

  // The latest form contents, for saves that run after a delay.
  const payload = useRef<{ edits: number; action: BookAction } | null>(null);
  payload.current = {
    edits,
    action: {
      type: "sheet.save",
      id: sheet.id,
      sheet: {
        pageNo,
        rows,
        collected: collected.trim() === "" ? null : collected,
        income: clean(income),
        expenses: clean(expenses),
        previousBalance: prev.trim() === "" ? null : prev,
        notes,
        notPaid,
        paid,
      },
    },
  };
  const inFlight = useRef<Promise<boolean> | null>(null);

  const save = useCallback(async (): Promise<boolean> => {
    if (!canEdit) return true;
    while (inFlight.current) await inFlight.current; // one save at a time
    const p = payload.current!;
    const job = (async () => {
      setSaving(true);
      const err = await act(p.action);
      setSaving(false);
      setSaveError(err);
      if (!err) setSavedEdits((s) => Math.max(s, p.edits));
      return !err;
    })();
    inFlight.current = job;
    const ok = await job;
    inFlight.current = null;
    return ok;
  }, [act, canEdit]);

  // Autosave 1.2 s after the last change.
  useEffect(() => {
    if (!dirty || !canEdit) return;
    const t = setTimeout(() => void save(), 1200);
    return () => clearTimeout(t);
  }, [edits, dirty, canEdit, save]);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty && !saving) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving]);

  // Enter in any field saves (Ctrl/⌘+Enter in the note).
  const onKeyDown = (e: React.KeyboardEvent) => {
    const el = e.target as HTMLElement;
    if (e.key !== "Enter" || !canEdit) return;
    if (el.tagName === "INPUT" || (el.tagName === "TEXTAREA" && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      void save().then((ok) => ok && toast("Saved"));
    }
  };
  const { toast } = useAdmin();

  const goPrint = async (part: "names" | "expenses" | "notPaid" | "full") => {
    if (dirty && !(await save())) return;
    window.location.href = `/admin/book/print?id=${sheet.id}&part=${part}`;
  };

  const syncWithApp = async () => {
    if (!confirm("Sync copies this month from the app: names, money, expenses and who has paid. A previous balance or note you typed yourself is kept. Continue?")) return;
    if (dirty && !(await save())) return;
    setBusy(true);
    await run({ type: "sheet.sync", id: sheet.id }, "Synced with the app");
    setBusy(false);
  };

  const setStatus = (flatId: string, status: "paid" | "notPaid") => {
    const order = rows.map((r) => r.flatId);
    const isOn = status === "paid" ? paid.includes(flatId) : notPaid.includes(flatId);
    const nextPaid = paid.filter((x) => x !== flatId);
    const nextNot = notPaid.filter((x) => x !== flatId);
    if (!isOn) (status === "paid" ? nextPaid : nextNot).push(flatId);
    const sort = (ids: string[]) => order.filter((id) => ids.includes(id));
    setPaid(sort(nextPaid));
    setNotPaid(sort(nextNot));
    setEdits((n) => n + 1);
  };

  const due = maintenanceDue(db, sheet.month);
  const paidTotal = paid.length * due;
  const templates = db.settings.expenseTemplates.filter((t) => !expenses.some((e) => e.label.trim() === t.label));
  const filled = collected.trim() !== "" || clean(expenses).length > 0 || clean(income).length > 0 || notes.trim() !== "";
  const unmarked = rows.length - paid.length - notPaid.length;

  return (
    <div className="space-y-4" onKeyDown={onKeyDown}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          className="btn btn-sm"
          onClick={async () => {
            if (dirty && !(await save()) && !confirm("Couldn’t save your changes. Leave anyway?")) return;
            onClose();
          }}
        >
          ← All pages
        </button>
        <p className="text-xs text-muted">
          Last saved {formatDateTime(sheet.updatedAt)} by {sheet.updatedBy}
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
              Copies this month from the app: names, who has paid, maintenance collected, expenses and additional works. A previous balance or note you
              typed yourself is kept.
              {sheet.syncedAt && <span className="block text-xs text-muted">Last synced {formatDateTime(sheet.syncedAt)}</span>}
            </p>
          </div>
          <button type="button" className="btn btn-primary" disabled={busy || saving} onClick={syncWithApp}>
            ⟳ Sync with app
          </button>
        </section>
      )}

      {/* step 1 */}
      <section className="card p-4">
        <SectionTitle action={<button type="button" className="btn btn-primary" onClick={() => goPrint("names")}>🖨 Print names</button>}>
          1 · Names to sign · {monthLabel(sheet.month)}
        </SectionTitle>
        <p className="mb-3 text-sm text-ink-2">
          Print on a blank A4 sheet. Residents sign and write the amount and date by hand. Mark each flat <strong className="text-good-ink">Paid</strong> or{" "}
          <strong className="text-crit-ink">Not paid</strong> as you collect. Not paid prints a red outline and NOT PAID on the sheet.
        </p>
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
                const fresh = rowsFromFlats(db);
                const ids = fresh.map((r) => r.flatId);
                setPaid((p) => p.filter((id) => ids.includes(id)));
                setNotPaid((p) => p.filter((id) => ids.includes(id)));
                touch(setRows)(fresh);
                toast("Names updated from the app");
              }}
            >
              ↻ Sync names from app
            </button>
          </div>
          <div className="divide-y divide-line rounded-xl ring-1 ring-line">
            {rows.map((r, i) => {
              const isPaid = paid.includes(r.flatId);
              const isNot = notPaid.includes(r.flatId);
              return (
                <div key={r.flatId} className={`flex items-center gap-2 px-2 py-1.5 sm:px-3 ${isNot ? "bg-crit-bg" : isPaid ? "bg-good-bg" : ""}`}>
                  <span className="tnum w-9 shrink-0 font-bold">{r.flatId}</span>
                  <input
                    className="input min-w-0 flex-1 py-1.5"
                    value={r.name}
                    maxLength={80}
                    onChange={(e) => touch(setRows)(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    aria-label={`Name for flat ${r.flatId}`}
                  />
                  <div className="flex shrink-0 overflow-hidden rounded-lg ring-1 ring-line" role="group" aria-label={`Flat ${r.flatId} payment`}>
                    <button
                      type="button"
                      aria-pressed={isPaid}
                      onClick={() => setStatus(r.flatId, "paid")}
                      className={`px-2 py-1.5 text-xs font-bold sm:px-3 sm:text-sm ${isPaid ? "bg-good text-white" : "bg-surface text-ink-2 hover:text-ink"}`}
                    >
                      ✓<span className="hidden sm:inline"> Paid</span>
                    </button>
                    <button
                      type="button"
                      aria-pressed={isNot}
                      onClick={() => setStatus(r.flatId, "notPaid")}
                      className={`border-l border-line px-2 py-1.5 text-xs font-bold sm:px-3 sm:text-sm ${isNot ? "bg-crit text-white" : "bg-surface text-ink-2 hover:text-ink"}`}
                    >
                      ✗<span className="hidden sm:inline"> Not paid</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-sm">
            <strong className="text-good-ink">{paid.length} paid</strong> · <strong className="text-crit-ink">{notPaid.length} not paid</strong>
            {notPaid.length > 0 && <span className="text-crit-ink"> ({notPaid.join(", ")})</span>}
            {unmarked > 0 && <span className="text-muted"> · {unmarked} not marked</span>}
          </p>
          <p className="text-xs text-muted">Names and marks here are only for the printed page. The app’s Flats list and payments aren’t changed.</p>
        </fieldset>
      </section>

      {/* step 2 */}
      <section className="card p-4">
        <SectionTitle>2 · After collection: expenses & balance</SectionTitle>
        <p className="mb-3 text-sm text-ink-2">This prints in the box at the bottom of the same sheet. Leave it empty until collection is done.</p>
        <fieldset disabled={!canEdit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Field label="Maintenance collected (₹)" hint="Total of the amounts written on the sheet">
                <input className="input tnum" inputMode="decimal" value={collected} onChange={(e) => touch(setCollected)(e.target.value)} placeholder="e.g. 19500" />
              </Field>
              {paid.length > 0 && numOr(collected) !== paidTotal && (
                <button type="button" className="mt-1.5 text-xs font-semibold text-brand underline" onClick={() => touch(setCollected)(String(paidTotal))}>
                  Use {paid.length} paid × {inr(due)} = {inr(paidTotal)}
                </button>
              )}
            </div>
            <Field label="Previous balance (₹)" hint="From the last page. Use minus for a shortage, e.g. -9452. Kept when you sync. Leave empty to skip.">
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
                <Row l="Previous balance" v={inr(numOr(prev) ?? 0)} />
                <Row l={preview.closing < 0 ? "Closing (shortage)" : "Closing balance"} v={inr(preview.closing)} strong crit={preview.closing < 0} />
              </>
            )}
          </div>
        </fieldset>
      </section>

      <div className="sticky bottom-3 z-10 rounded-2xl bg-surface/95 p-2 shadow-lg ring-1 ring-line backdrop-blur">
        {canEdit && (
          <p className={`px-1 pb-1.5 text-xs font-semibold ${saveError ? "text-crit-ink" : "text-muted"}`} aria-live="polite">
            {saveError ? (
              <>
                ⚠ Not saved: {saveError}{" "}
                <button type="button" className="underline" onClick={() => void save()}>
                  Try again
                </button>
              </>
            ) : saving ? (
              "Saving…"
            ) : dirty ? (
              "Unsaved changes — saving in a moment (or press Enter)"
            ) : (
              "✓ All changes saved"
            )}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn flex-1 whitespace-nowrap px-2" disabled={!filled} onClick={() => goPrint("expenses")} title={filled ? undefined : "Fill in the expenses first"}>
            🖨 Expenses
          </button>
          {notPaid.length > 0 && (
            <button type="button" className="btn flex-1 whitespace-nowrap px-2 text-crit-ink" onClick={() => goPrint("notPaid")}>
              🖨 Not paid
            </button>
          )}
          <button type="button" className="btn flex-1 whitespace-nowrap px-2" onClick={() => goPrint("full")}>
            🖨 Full page
          </button>
        </div>
      </div>

      {canDelete && (
        <button
          type="button"
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

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { maintenanceDue } from "@/lib/calc";
import { formatDate, monthLabel } from "@/lib/dates";
import { hasExpensePart } from "@/lib/book";
import { useApp } from "@/components/AppProvider";
import { useBook } from "@/components/book/useBook";
import { BookPage, type PrintPart } from "@/components/book/BookPage";
import { ScaledPage } from "@/components/book/ScaledPage";

const PARTS: { v: PrintPart; l: string; d: string }[] = [
  { v: "names", l: "1 · Names", d: "Blank sheet: names to sign, amounts by hand" },
  { v: "expenses", l: "2 · Expenses", d: "Same sheet again: prints only the box at the bottom" },
  { v: "notPaid", l: "3 · Not paid", d: "Same sheet again: red rows and NOT PAID" },
  { v: "full", l: "Full page", d: "Everything on a fresh sheet, or save as PDF" },
];

const PRINT_CSS = `
@page { size: A4 portrait; margin: 0; }
@media print {
  html, body { background: #fff !important; margin: 0 !important; min-height: 0 !important; }
  .book-scale-outer, .book-scale-box { width: auto !important; height: auto !important; }
  .book-scale { transform: none !important; }
  .book-page { break-after: avoid; page-break-after: avoid; }
}`;

/** Printable book page, in two passes on the same sheet of paper. */
export default function BookPrintPage() {
  const { db, admin, loading } = useApp();
  const { book, error, act } = useBook(!!admin);
  const [id, setId] = useState<string | null>(null);
  const [part, setPart] = useState<PrintPart>("names");
  const [marks, setMarks] = useState(true);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setId(q.get("id"));
    const p = q.get("part");
    if (p === "names" || p === "expenses" || p === "notPaid" || p === "full") setPart(p);
  }, []);

  if (loading && !db) return <p className="p-8 text-center">Loading…</p>;
  if (!admin)
    return (
      <p className="p-8 text-center">
        Please{" "}
        <Link className="font-bold text-brand underline" href="/admin">
          log in as admin
        </Link>{" "}
        first.
      </p>
    );
  if (error) return <p className="p-8 text-center text-crit-ink">{error}</p>;
  if (!book || !db) return <p className="p-8 text-center">Loading…</p>;
  const sheet = book.sheets.find((s) => s.id === id);
  if (!sheet)
    return (
      <p className="p-8 text-center">
        Book page not found.{" "}
        <Link className="underline" href="/admin/book">
          Back
        </Link>
      </p>
    );

  const expensesReady = hasExpensePart(sheet);
  const hasNotPaid = sheet.notPaid.length > 0;
  const withMarks = part === "expenses" && marks && hasNotPaid;
  const blocked = (part === "expenses" && !expensesReady) || (part === "notPaid" && !hasNotPaid);

  const print = () => {
    window.print();
    if (part !== "full") act({ type: "sheet.printed", id: sheet.id, part });
    if (withMarks) act({ type: "sheet.printed", id: sheet.id, part: "notPaid" });
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-4 print:max-w-none print:p-0">
      <style>{PRINT_CSS}</style>
      <div className="no-print mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link className="btn btn-sm" href={`/admin/book?id=${sheet.id}`}>
            ← Back
          </Link>
          <h1 className="text-lg font-extrabold">
            Book page · {monthLabel(sheet.month)}
            {sheet.pageNo && <span className="font-semibold text-ink-2"> · Page {sheet.pageNo}</span>}
          </h1>
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="radiogroup" aria-label="What to print">
          {PARTS.map((p) => (
            <button
              key={p.v}
              role="radio"
              aria-checked={part === p.v}
              onClick={() => setPart(p.v)}
              className={`rounded-xl px-2 py-2 text-left text-sm ring-1 transition ${part === p.v ? "bg-brand text-brand-ink ring-brand" : "bg-surface text-ink ring-line hover:bg-surface-2"}`}
            >
              <span className="block font-bold">{p.l}</span>
              <span className={`block text-xs ${part === p.v ? "opacity-90" : "text-muted"}`}>{p.d}</span>
            </button>
          ))}
        </div>

        {part === "expenses" && hasNotPaid && (
          <label className="flex items-start gap-2 rounded-xl bg-crit-bg px-3 py-2.5 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-crit" checked={marks} onChange={(e) => setMarks(e.target.checked)} />
            <span>
              <strong className="text-crit-ink">Also mark not paid in this print</strong>
              <span className="block text-xs text-ink-2">
                {sheet.notPaid.join(", ")}: red row and NOT PAID in the amount column. Leave it off if you’ll mark them later with “3 · Not paid”.
              </span>
            </span>
          </label>
        )}
        {(part === "expenses" || part === "notPaid") && (
          <div className="rounded-xl border border-dashed border-brand bg-brand-soft p-3 text-sm text-ink-2">
            <p className="font-bold text-brand">Printing on the sheet that was already signed</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5">
              <li>First print once on a plain sheet and hold it against the signed sheet up to the light. {part === "notPaid" ? "The red rows" : "The box"} should line up.</li>
              <li>Put the signed sheet back the same way as the blank sheet went in the first time: same side, top edge first. Not sure which side your printer prints on? Draw an arrow on a plain sheet, print on it and look.</li>
              <li>Only the {part === "notPaid" ? "not-paid marks print" : withMarks ? "expenses box and the not-paid marks print" : "expenses box prints"}. The faded part on screen is left blank on paper.</li>
            </ol>
          </div>
        )}
        <p className="text-xs text-muted">
          Printer settings: paper <strong>A4</strong>, scale <strong>100%</strong> (“Actual size”, not “Fit to page”), margins <strong>Default</strong> or
          <strong> None</strong>, headers and footers off. Use the same settings every time.
        </p>
        {blocked ? (
          <p className="rounded-xl bg-warn-bg px-3 py-2 text-sm font-semibold text-warn-ink">
            {part === "notPaid" ? "No flats are marked as not paid." : "Nothing to print in the expenses box yet."}{" "}
            <Link className="underline" href={`/admin/book?id=${sheet.id}`}>
              {part === "notPaid" ? "Mark them" : "Fill in the expenses"}
            </Link>{" "}
            first.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-primary" onClick={print}>
              🖨 Print{" "}
              {part === "names"
                ? "names page"
                : part === "expenses"
                  ? withMarks
                    ? "expenses + not paid on the same sheet"
                    : "expenses on the same sheet"
                  : part === "notPaid"
                    ? "not paid on the same sheet"
                    : "full page"}
            </button>
            <span className="text-xs text-muted">
              {part === "names" && sheet.printedNames && `Last printed ${formatDate(sheet.printedNames)}`}
              {part === "expenses" && sheet.printedExpenses && `Last printed ${formatDate(sheet.printedExpenses)}`}
              {part === "notPaid" && sheet.printedNotPaid && `Last printed ${formatDate(sheet.printedNotPaid)}`}
            </span>
          </div>
        )}
      </div>

      <div className={blocked ? "print:hidden" : undefined}>
        <ScaledPage>
          <BookPage sheet={sheet} part={part} apartmentName={db.settings.apartmentName} due={maintenanceDue(db, sheet.month)} marks={withMarks} />
        </ScaledPage>
      </div>
    </main>
  );
}

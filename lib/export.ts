import type { DB, MonthKey } from "./types";
import { allSummaries } from "./calc";

function cell(v: string | number | undefined): string {
  const s = v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Full ledger as CSV (opens in Excel / Google Sheets). Pass a month to limit it. */
export function ledgerCSV(db: DB, month?: MonthKey): string {
  const owner = (id: string) => db.flats.find((f) => f.id === id)?.owner ?? "";
  const rows: (string | number | undefined)[][] = [
    ["Month", "Type", "Flat", "Owner", "Description", "Category", "Income (₹)", "Expense (₹)", "Date", "Mode", "Note"],
  ];
  const inMonth = (m: string) => !month || m === month;
  for (const p of db.payments.filter((p) => inMonth(p.month)))
    rows.push([p.month, "Maintenance", p.flatId, owner(p.flatId), "Monthly maintenance", "Maintenance", p.amount, "", p.date, p.mode, p.note]);
  for (const e of db.expenses.filter((e) => inMonth(e.month)))
    rows.push([e.month, "Expense", "", "", e.label, e.category, "", e.amount, e.date, "", e.note]);
  for (const c of db.collections.filter((c) => inMonth(c.month))) {
    for (const p of c.payments)
      rows.push([c.month, "Additional work collection", p.flatId, owner(p.flatId), c.title, c.title, p.amount, "", p.date, p.mode, p.note]);
    for (const x of c.costs) rows.push([c.month, "Additional work cost", "", "", x.label, c.title, "", x.amount, "", "", x.note]);
  }
  const body = rows.slice(1).sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])));
  const out = [rows[0], ...body];

  out.push([]);
  out.push(["Month", "Summary", "", "", "", "", "Collected (₹)", "Spent (₹)", "Opening (₹)", "Closing (₹)", "Flats paid"]);
  for (const s of allSummaries(db).filter((s) => inMonth(s.month)))
    out.push([s.month, "Month total", "", "", "", "", s.income, s.spent, s.opening, s.closing, `${s.paidCount}/${s.flats.length}`]);

  return "﻿" + out.map((r) => r.map(cell).join(",")).join("\r\n");
}

export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Offline book pages: a printable A4 sheet per month, kept as a paper record.
//
// Printing happens in two passes on the same sheet of paper:
//   1. "names": the header and one row per flat, so residents can sign and the
//      amount can be written in by hand when maintenance is collected;
//   2. "expenses": later, the same paper goes back into the printer and only the
//      lower half is printed (expenses, money in and the balance), leaving the
//      handwritten top untouched.
//
// These pages are stored separately from the main records (their own document),
// so the paper copy can be written up independently of what is in the app.

import type { DB, MonthKey, Role } from "./types";
import { ActionError, validators } from "./actions";
import { currentMonth } from "./dates";
import { allSummaries } from "./calc";
import { flatName } from "./share";

const { uid, text, optText, money, month: monthKey } = validators;

export interface BookRow {
  flatId: string;
  name: string;
}

export interface BookLine {
  id: string;
  label: string;
  amount: number;
  note?: string;
}

export interface BookSheet {
  id: string;
  month: MonthKey;
  /** Page number written on the book, e.g. "58". */
  pageNo?: string;
  rows: BookRow[];
  /** Maintenance collected, as written on the sheet. null = not filled in yet. */
  collected: number | null;
  /** Other money received, e.g. pest-control contributions. */
  income: BookLine[];
  expenses: BookLine[];
  /** Balance carried from the previous page (negative = shortage). null = leave out. */
  previousBalance: number | null;
  notes?: string;
  printedNames?: string;
  printedExpenses?: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface BookDB {
  version: number;
  sheets: BookSheet[];
}

export type BookPart = "names" | "expenses";

/** What fits in the expenses box of an A4 page. */
export const MAX_EXPENSES = 18;
export const MAX_INCOME = 6;

export interface BookLineInput {
  label?: string;
  amount?: number | string;
  note?: string;
}

export interface BookSheetInput {
  pageNo?: string;
  rows?: { flatId?: string; name?: string }[];
  collected?: number | string | null;
  income?: BookLineInput[];
  expenses?: BookLineInput[];
  previousBalance?: number | string | null;
  notes?: string;
}

export type BookAction =
  | { type: "sheet.create"; month: MonthKey; pageNo?: string }
  | { type: "sheet.save"; id: string; sheet: BookSheetInput }
  | { type: "sheet.delete"; id: string }
  | { type: "sheet.printed"; id: string; part: BookPart };

export function emptyBook(): BookDB {
  return { version: 0, sheets: [] };
}

export function normalizeBook(raw: Partial<BookDB> | null | undefined): BookDB {
  const sheets = Array.isArray(raw?.sheets) ? raw.sheets : [];
  return {
    version: raw?.version ?? 0,
    sheets: sheets.map((s) => ({
      ...s,
      rows: s.rows ?? [],
      income: s.income ?? [],
      expenses: s.expenses ?? [],
      collected: s.collected ?? null,
      previousBalance: s.previousBalance ?? null,
    })),
  };
}

export interface BookTotals {
  collected: number;
  otherIncome: number;
  income: number;
  spent: number;
  /** Money in minus money out for this page. */
  net: number;
  /** Previous balance + net. */
  closing: number;
}

export function bookTotals(s: Pick<BookSheet, "collected" | "income" | "expenses" | "previousBalance">): BookTotals {
  const collected = s.collected ?? 0;
  const otherIncome = s.income.reduce((a, l) => a + l.amount, 0);
  const spent = s.expenses.reduce((a, l) => a + l.amount, 0);
  const income = collected + otherIncome;
  const net = income - spent;
  return { collected, otherIncome, income, spent, net, closing: (s.previousBalance ?? 0) + net };
}

/** True once there is something to print in the lower (expenses) half. */
export function hasExpensePart(s: BookSheet): boolean {
  return s.collected !== null || s.expenses.length > 0 || s.income.length > 0 || !!s.notes;
}

export function sortedSheets(book: BookDB): BookSheet[] {
  return [...book.sheets].sort((a, b) => (a.month === b.month ? b.createdAt.localeCompare(a.createdAt) : b.month.localeCompare(a.month)));
}

export function rowsFromFlats(db: DB): BookRow[] {
  return db.flats.map((f) => ({ flatId: f.id, name: flatName(f) }));
}

function nextPageNo(book: BookDB): string | undefined {
  const nums = book.sheets.map((s) => Number(s.pageNo)).filter((n) => Number.isInteger(n) && n > 0);
  return nums.length ? String(Math.max(...nums) + 1) : undefined;
}

/** The latest earlier page that has its balance filled in. */
function previousSheet(book: BookDB, month: MonthKey): BookSheet | undefined {
  return sortedSheets(book).find((s) => s.month < month && s.collected !== null);
}

function line(l: BookLineInput, field: string): BookLine {
  return {
    id: uid("bl"),
    label: text(l.label, `${field} item`, 120),
    amount: money(l.amount, `${field} amount for “${String(l.label ?? "").trim()}”`, true),
    note: optText(l.note, `${field} note`, 120),
  };
}

function findSheet(book: BookDB, id: unknown): BookSheet {
  const s = book.sheets.find((x) => x.id === id);
  if (!s) throw new ActionError("Book page not found");
  return s;
}

export function applyBookAction(book: BookDB, db: DB, action: BookAction, by: string, now: Date = new Date()): BookDB {
  const at = now.toISOString();
  const replace = (s: BookSheet) => ({ ...book, sheets: book.sheets.map((x) => (x.id === s.id ? s : x)) });

  switch (action.type) {
    case "sheet.create": {
      const m = monthKey(action.month);
      if (book.sheets.some((s) => s.month === m)) throw new ActionError("There is already a book page for this month");
      const prev = previousSheet(book, m);
      const sheet: BookSheet = {
        id: uid("bk"),
        month: m,
        pageNo: optText(action.pageNo, "Page number", 12) ?? nextPageNo(book),
        rows: rowsFromFlats(db),
        collected: null,
        income: [],
        expenses: [],
        previousBalance: prev ? bookTotals(prev).closing : null,
        createdAt: at,
        updatedAt: at,
        updatedBy: by,
      };
      return { ...book, sheets: [...book.sheets, sheet] };
    }
    case "sheet.save": {
      const cur = findSheet(book, action.id);
      const x = action.sheet ?? {};
      if (x.rows && x.rows.length > 60) throw new ActionError("Too many rows");
      if ((x.expenses?.length ?? 0) > MAX_EXPENSES) throw new ActionError(`Only ${MAX_EXPENSES} expense lines fit on the page — combine some`);
      if ((x.income?.length ?? 0) > MAX_INCOME) throw new ActionError(`Only ${MAX_INCOME} “money received” lines fit on the page`);
      const blank = (v: unknown) => v === null || v === undefined || v === "";
      return replace({
        ...cur,
        pageNo: x.pageNo !== undefined ? optText(x.pageNo, "Page number", 12) : cur.pageNo,
        rows: x.rows
          ? x.rows.map((r) => ({ flatId: text(r.flatId, "Flat", 10), name: text(r.name ?? "", "Name", 80, false) }))
          : cur.rows,
        collected: x.collected !== undefined ? (blank(x.collected) ? null : money(x.collected, "Maintenance collected", true)) : cur.collected,
        income: x.income ? x.income.map((l) => line(l, "Money received")) : cur.income,
        expenses: x.expenses ? x.expenses.map((l) => line(l, "Expense")) : cur.expenses,
        previousBalance:
          x.previousBalance !== undefined
            ? blank(x.previousBalance)
              ? null
              : money(x.previousBalance, "Previous balance", true, true)
            : cur.previousBalance,
        notes: x.notes !== undefined ? optText(x.notes, "Notes", 600) : cur.notes,
        updatedAt: at,
        updatedBy: by,
      });
    }
    case "sheet.delete": {
      findSheet(book, action.id);
      return { ...book, sheets: book.sheets.filter((s) => s.id !== action.id) };
    }
    case "sheet.printed": {
      const cur = findSheet(book, action.id);
      if (action.part !== "names" && action.part !== "expenses") throw new ActionError("Invalid part");
      return replace(action.part === "names" ? { ...cur, printedNames: at } : { ...cur, printedExpenses: at });
    }
    default:
      throw new ActionError("Unknown action");
  }
}

/** Managers keep the current month's page; older pages and deleting stay with the main admin. */
export function checkBookPermission(book: BookDB, role: Role, action: BookAction, now: Date = new Date()): string | null {
  if (role === "owner") return null;
  const cur = currentMonth(now);
  switch (action.type) {
    case "sheet.create":
      return action.month === cur ? null : "Managers can only make the current month’s page.";
    case "sheet.save":
      return book.sheets.find((s) => s.id === action.id)?.month === cur ? null : "Managers can only change the current month’s page.";
    case "sheet.printed":
      return null;
    default:
      return "Only the main admin can do this.";
  }
}

/**
 * Figures from the app's records for a month, to fill in a page in one tap.
 * Additional works (e.g. pest control) come in as money received and their costs as expenses.
 */
export function figuresFromApp(db: DB, month: MonthKey, now: Date = new Date()): Required<Pick<BookSheetInput, "collected" | "income" | "expenses" | "notes">> & { previousBalance: number | null } {
  const s = allSummaries(db, now).find((x) => x.month === month);
  const expenses: BookLineInput[] = db.expenses
    .filter((e) => e.month === month)
    .map((e) => ({ label: e.label, amount: e.amount, note: e.note }));
  const income: BookLineInput[] = [];
  for (const c of s?.collections ?? []) {
    if (c.collected > 0) income.push({ label: `${c.collection.title} received`, amount: c.collected, note: `${c.paidFlatIds.length} flats` });
    for (const k of c.collection.costs) expenses.push({ label: `${c.collection.title}: ${k.label}`, amount: k.amount, note: k.note });
  }
  const unpaid = s?.flats.filter((f) => f.status !== "paid").map((f) => f.flat.id) ?? [];
  return {
    collected: s?.maintenanceCollected ?? 0,
    income,
    expenses,
    previousBalance: s ? s.opening : null,
    notes: unpaid.length ? `Not paid: ${unpaid.join(", ")}` : "All flats paid",
  };
}

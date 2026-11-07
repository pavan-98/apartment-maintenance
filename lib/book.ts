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
import { allSummaries, inr, sumMoney } from "./calc";
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
  /** Flats marked "not paid": printed as a red row with NOT PAID in the amount column. */
  notPaid: string[];
  /** Flats ticked as paid on the editor (not printed; used for counts and the collected total). */
  paid: string[];
  printedNames?: string;
  printedExpenses?: string;
  printedNotPaid?: string;
  /** When the page was last synced from the app. */
  syncedAt?: string;
  /** The note the last sync wrote, so a later sync only replaces it if nobody edited it. */
  syncedNote?: string;
  /** The previous balance the last sync wrote; a balance typed by hand is never replaced. */
  syncedPreviousBalance?: number | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface BookDB {
  version: number;
  sheets: BookSheet[];
  /** Who changed which money figures, newest first. */
  log: BookLogEntry[];
}

export interface BookLogEntry {
  at: string;
  by: string;
  sheetId: string;
  month: MonthKey;
  what: "made" | "edited" | "synced with app" | "deleted";
  changes: { field: string; from: string; to: string }[];
}

/** Thrown when a page was changed elsewhere since it was opened. */
export class BookConflict extends ActionError {}

export type BookPart = "names" | "expenses" | "notPaid";

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
  notPaid?: string[];
  paid?: string[];
}

export type BookAction =
  | { type: "sheet.create"; month: MonthKey; pageNo?: string }
  /** `base` = the page's `updatedAt` when it was loaded; the save is refused if it has changed since. */
  | { type: "sheet.save"; id: string; sheet: BookSheetInput; base?: string }
  | { type: "sheet.sync"; id: string }
  | { type: "sheet.delete"; id: string }
  | { type: "sheet.printed"; id: string; part: BookPart };

export function emptyBook(): BookDB {
  return { version: 0, sheets: [], log: [] };
}

export function normalizeBook(raw: Partial<BookDB> | null | undefined): BookDB {
  const sheets = Array.isArray(raw?.sheets) ? raw.sheets : [];
  return {
    version: raw?.version ?? 0,
    log: Array.isArray(raw?.log) ? raw.log : [],
    sheets: sheets.map((s) => ({
      ...s,
      rows: s.rows ?? [],
      income: s.income ?? [],
      expenses: s.expenses ?? [],
      collected: s.collected ?? null,
      previousBalance: s.previousBalance ?? null,
      notPaid: s.notPaid ?? [],
      paid: s.paid ?? [],
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
  const otherIncome = sumMoney(s.income.map((l) => l.amount));
  const spent = sumMoney(s.expenses.map((l) => l.amount));
  const income = sumMoney([collected, otherIncome]);
  const net = sumMoney([income, -spent]);
  return { collected, otherIncome, income, spent, net, closing: sumMoney([s.previousBalance ?? 0, net]) };
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

/** Accepts amounts as typed: "1,500", "₹ 1,500", "−10,052" (with a typographic minus). */
export function parseAmount(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const s = v.replace(/[₹,\s]/g, "").replace(/[−–—]/g, "-");
  return s === "" ? "" : s;
}

function amount(v: unknown, field: string, allowNegative = false): number {
  return money(parseAmount(v), field, true, allowNegative);
}

function line(l: BookLineInput, field: string): BookLine {
  return {
    id: uid("bl"),
    label: text(l.label, `${field} item`, 120),
    amount: amount(l.amount, `${field} amount for “${String(l.label ?? "").trim()}”`),
    note: optText(l.note, `${field} note`, 120),
  };
}

function notPaidList(v: unknown, flats: string[]): string[] {
  if (!Array.isArray(v)) throw new ActionError("Invalid not-paid list");
  const ids = [...new Set(v.map(String))];
  for (const id of ids) if (!flats.includes(id)) throw new ActionError(`Flat ${id} is not on this page`);
  return flats.filter((f) => ids.includes(f)); // keep page order
}

/** Keeps a list within what fits on the page by adding up the last lines into one. */
function fitLines(lines: BookLineInput[], max: number, label: string): BookLineInput[] {
  lines = lines.map((l) => ({ ...l, label: String(l.label ?? "").slice(0, 120), note: l.note?.slice(0, 120) }));
  if (lines.length <= max) return lines;
  const rest = lines.slice(max - 1);
  const amount = sumMoney(rest.map((l) => Number(l.amount ?? 0)));
  return [...lines.slice(0, max - 1), { label: `${label} (${rest.length} items)`, amount, note: rest.map((l) => l.label).join(", ").slice(0, 120) }];
}

function findSheet(book: BookDB, id: unknown): BookSheet {
  const s = book.sheets.find((x) => x.id === id);
  if (!s) throw new ActionError("Book page not found");
  return s;
}

/** Applies a change to the book pages and records any change to money figures in the log. */
export function applyBookAction(book: BookDB, db: DB, action: BookAction, by: string, now: Date = new Date()): BookDB {
  const next = applyChange(book, db, action, by, now);
  if (action.type === "sheet.printed") return next;
  const id = action.type === "sheet.create" ? next.sheets.find((s) => !book.sheets.some((b) => b.id === s.id))?.id : action.id;
  const before = book.sheets.find((s) => s.id === id);
  const after = next.sheets.find((s) => s.id === id);
  const sheet = after ?? before;
  if (!sheet) return next;
  const what: BookLogEntry["what"] =
    action.type === "sheet.create" ? "made" : action.type === "sheet.delete" ? "deleted" : action.type === "sheet.sync" ? "synced with app" : "edited";
  const changes = diffMoney(before, after);
  if (what === "edited" && changes.length === 0) return next; // names, page number etc.
  const entry: BookLogEntry = { at: now.toISOString(), by, sheetId: sheet.id, month: sheet.month, what, changes };
  // Autosave sends many small saves: fold edits by the same person within 15 minutes into one entry.
  const last = next.log[0];
  if (
    what === "edited" &&
    last &&
    last.what === "edited" &&
    last.sheetId === entry.sheetId &&
    last.by === by &&
    now.getTime() - new Date(last.at).getTime() < 15 * 60 * 1000
  ) {
    const merged = new Map(last.changes.map((c) => [c.field, { ...c }]));
    for (const c of changes) {
      const m = merged.get(c.field);
      if (m) m.to = c.to;
      else merged.set(c.field, { ...c });
    }
    const folded = [...merged.values()].filter((c) => c.from !== c.to);
    const rest = next.log.slice(1);
    return { ...next, log: folded.length ? [{ ...last, at: entry.at, changes: folded }, ...rest] : rest };
  }
  return { ...next, log: [entry, ...next.log].slice(0, 500) };
}

/** The money figures on a page, as text, for the change log. */
function moneyFigures(s: BookSheet | undefined): Record<string, string> {
  if (!s) return {};
  const t = bookTotals(s);
  const lines = (ls: BookLine[]) => ls.map((l) => `${l.label} ${inr(l.amount)}`).join("; ") || "none";
  return {
    "Maintenance collected": s.collected === null ? "empty" : inr(s.collected),
    "Previous balance": s.previousBalance === null ? "empty" : inr(s.previousBalance),
    Expenses: `${inr(t.spent)} (${lines(s.expenses)})`,
    "Other money received": `${inr(t.otherIncome)} (${lines(s.income)})`,
    "Closing balance": inr(t.closing),
    "Not paid": s.notPaid.join(", ") || "none",
  };
}

function diffMoney(a: BookSheet | undefined, b: BookSheet | undefined) {
  const x = moneyFigures(a);
  const y = moneyFigures(b);
  return Object.keys({ ...x, ...y })
    .filter((k) => x[k] !== y[k])
    .map((k) => ({ field: k, from: x[k] ?? "—", to: y[k] ?? "—" }));
}

function applyChange(book: BookDB, db: DB, action: BookAction, by: string, now: Date): BookDB {
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
        notPaid: [],
        paid: [],
        createdAt: at,
        updatedAt: at,
        updatedBy: by,
      };
      return { ...book, sheets: [...book.sheets, sheet] };
    }
    case "sheet.save": {
      const cur = findSheet(book, action.id);
      if (action.base !== undefined && action.base !== cur.updatedAt) {
        const when = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(cur.updatedAt));
        throw new BookConflict(`This page was changed by ${cur.updatedBy} at ${when}, after you opened it. Reload to see the latest — your last change was not saved.`);
      }
      const x = (action.sheet && typeof action.sheet === "object" ? action.sheet : {}) as BookSheetInput;
      for (const k of ["rows", "income", "expenses", "notPaid", "paid"] as const) {
        if (x[k] !== undefined && !Array.isArray(x[k])) throw new ActionError("Invalid request");
      }
      if (x.rows && x.rows.length > 60) throw new ActionError("Too many rows");
      if ((x.expenses?.length ?? 0) > MAX_EXPENSES) throw new ActionError(`Only ${MAX_EXPENSES} expense lines fit on the page — combine some`);
      if ((x.income?.length ?? 0) > MAX_INCOME) throw new ActionError(`Only ${MAX_INCOME} “money received” lines fit on the page`);
      const blank = (v: unknown) => v === null || v === undefined || v === "";
      const saved: BookSheet = {
        ...cur,
        pageNo: x.pageNo !== undefined ? optText(x.pageNo, "Page number", 12) : cur.pageNo,
        rows: x.rows
          ? x.rows.map((r) => ({ flatId: text(r.flatId, "Flat", 10), name: text(r.name ?? "", "Name", 80, false) }))
          : cur.rows,
        collected: x.collected !== undefined ? (blank(parseAmount(x.collected)) ? null : amount(x.collected, "Maintenance collected")) : cur.collected,
        income: x.income ? x.income.map((l) => line(l, "Money received")) : cur.income,
        expenses: x.expenses ? x.expenses.map((l) => line(l, "Expense")) : cur.expenses,
        previousBalance:
          x.previousBalance !== undefined
            ? blank(parseAmount(x.previousBalance))
              ? null
              : amount(x.previousBalance, "Previous balance", true)
            : cur.previousBalance,
        notes: x.notes !== undefined ? optText(x.notes, "Notes", 600) : cur.notes,
        notPaid: x.notPaid !== undefined ? notPaidList(x.notPaid, x.rows ? x.rows.map((r) => String(r.flatId)) : cur.rows.map((r) => r.flatId)) : cur.notPaid,
        paid: x.paid !== undefined ? notPaidList(x.paid, x.rows ? x.rows.map((r) => String(r.flatId)) : cur.rows.map((r) => r.flatId)) : cur.paid,
        updatedAt: at,
        updatedBy: by,
      };
      // A flat can't be both paid and not paid: "not paid" wins.
      return replace({ ...saved, paid: saved.paid.filter((id) => !saved.notPaid.includes(id)) });
    }
    case "sheet.sync": {
      // Copy everything from the app: names, money, expenses, previous balance and not-paid flats.
      const cur = findSheet(book, action.id);
      const f = figuresFromApp(db, cur.month, now);
      const rows = rowsFromFlats(db);
      const keepNote = cur.notes && cur.notes !== cur.syncedNote;
      // Keep a previous balance typed by hand (or carried from the last book page);
      // only fill it from the app when it is empty or still what the last sync wrote.
      const keepPrev = cur.previousBalance !== null && cur.previousBalance !== cur.syncedPreviousBalance;
      const flatIds = rows.map((r) => r.flatId);
      return replace({
        ...cur,
        rows,
        collected: f.collected === null ? null : money(f.collected, "Maintenance collected", true),
        income: fitLines(f.income, MAX_INCOME, "Other money received").map((l) => line(l, "Money received")),
        expenses: fitLines(f.expenses, MAX_EXPENSES, "Other expenses").map((l) => line(l, "Expense")),
        previousBalance: keepPrev ? cur.previousBalance : f.previousBalance,
        syncedPreviousBalance: keepPrev ? cur.syncedPreviousBalance : f.previousBalance,
        notPaid: notPaidList(f.notPaid, flatIds),
        paid: notPaidList(f.paid, flatIds),
        notes: keepNote ? cur.notes : optText(f.notes, "Notes", 600),
        syncedNote: optText(f.notes, "Notes", 600),
        syncedAt: at,
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
      const field = { names: "printedNames", expenses: "printedExpenses", notPaid: "printedNotPaid" } as const;
      if (!(action.part in field)) throw new ActionError("Invalid part");
      return replace({ ...cur, [field[action.part]]: at });
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
    case "sheet.sync":
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
export function figuresFromApp(
  db: DB,
  month: MonthKey,
  now: Date = new Date(),
): Required<Pick<BookSheetInput, "collected" | "income" | "expenses" | "notes" | "notPaid" | "paid">> & { previousBalance: number | null } {
  const s = allSummaries(db, now).find((x) => x.month === month);
  const expenses: BookLineInput[] = db.expenses
    .filter((e) => e.month === month)
    .map((e) => ({ label: e.label, amount: e.amount, note: e.note }));
  const income: BookLineInput[] = [];
  for (const c of s?.collections ?? []) {
    if (c.collected > 0) income.push({ label: `${c.collection.title} received`, amount: c.collected, note: `${c.paidFlatIds.length} flats` });
    for (const k of c.collection.costs) expenses.push({ label: `${c.collection.title}: ${k.label}`, amount: k.amount, note: k.note });
  }
  const unpaid = s?.flats.filter((f) => f.status === "unpaid").map((f) => f.flat.id) ?? [];
  const partial = s?.flats.filter((f) => f.status === "partial").map((f) => `${f.flat.id} (${inr(f.paid)} of ${inr(f.due)})`) ?? [];
  const notes = [unpaid.length ? `Not paid: ${unpaid.join(", ")}` : "", partial.length ? `Part paid: ${partial.join(", ")}` : ""].filter(Boolean).join(". ");
  return {
    collected: s?.maintenanceCollected ?? 0,
    income,
    expenses,
    previousBalance: s ? s.opening : null,
    notes: notes || "All flats paid",
    notPaid: unpaid,
    paid: s?.flats.filter((f) => f.status === "paid").map((f) => f.flat.id) ?? [],
  };
}

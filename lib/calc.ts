import type { DB, Flat, MonthKey, Payment, SpecialCollection } from "./types";
import { compareMonths, currentMonth, dayOfMonth, monthRange } from "./dates";

export type PayStatus = "paid" | "partial" | "unpaid";

export function maintenanceDue(db: DB, month: MonthKey): number {
  return db.settings.maintenanceOverrides[month] ?? db.settings.maintenanceAmount;
}

/** Months the app shows, oldest first. */
export function activeMonths(db: DB, now: Date = new Date()): MonthKey[] {
  const s = db.settings;
  let last = currentMonth(now);
  const dataMonths = [
    ...db.payments.map((p) => p.month),
    ...db.expenses.map((e) => e.month),
    ...db.collections.map((c) => c.month),
  ];
  if (s.isDemo) {
    // Sample data: show exactly the sample months, whatever today's date is.
    last = s.startMonth;
  }
  for (const m of dataMonths) if (compareMonths(m, last) > 0) last = m;
  if (compareMonths(s.startMonth, last) > 0) return [s.startMonth];
  return monthRange(s.startMonth, last);
}

/** The month the dashboard opens on. */
export function defaultMonth(db: DB, now: Date = new Date()): MonthKey {
  const months = activeMonths(db, now);
  const cur = currentMonth(now);
  return months.includes(cur) ? cur : months[months.length - 1];
}

export function flatPayments(db: DB, flatId: string, month: MonthKey): Payment[] {
  return db.payments.filter((p) => p.flatId === flatId && p.month === month);
}

export interface FlatMonthStatus {
  flat: Flat;
  due: number;
  paid: number;
  pending: number;
  status: PayStatus;
  payments: Payment[];
  lastPaidOn?: string;
}

export function flatStatus(db: DB, flat: Flat, month: MonthKey): FlatMonthStatus {
  const due = maintenanceDue(db, month);
  const payments = flatPayments(db, flat.id, month);
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const status: PayStatus = paid >= due && due > 0 ? "paid" : paid > 0 ? "partial" : due === 0 ? "paid" : "unpaid";
  const lastPaidOn = payments.map((p) => p.date).sort().pop();
  return { flat, due, paid, pending: Math.max(0, due - paid), status, payments, lastPaidOn };
}

export interface CollectionSummary {
  collection: SpecialCollection;
  expectedFlats: Flat[];
  expected: number;
  collected: number;
  cost: number;
  /** collected - cost */
  net: number;
  paidFlatIds: string[];
  pendingFlats: { flat: Flat; pending: number }[];
}

export function collectionSummary(db: DB, c: SpecialCollection): CollectionSummary {
  const expectedFlats = db.flats.filter((f) => !c.exemptFlats.includes(f.id));
  const collected = c.payments.reduce((s, p) => s + p.amount, 0);
  const cost = c.costs.reduce((s, x) => s + x.amount, 0);
  const paidBy = new Map<string, number>();
  for (const p of c.payments) paidBy.set(p.flatId, (paidBy.get(p.flatId) ?? 0) + p.amount);
  const pendingFlats = expectedFlats
    .map((flat) => ({ flat, pending: Math.max(0, c.perFlatAmount - (paidBy.get(flat.id) ?? 0)) }))
    .filter((x) => x.pending > 0);
  const paidFlatIds = expectedFlats
    .filter((f) => (paidBy.get(f.id) ?? 0) >= c.perFlatAmount && c.perFlatAmount > 0)
    .map((f) => f.id);
  return {
    collection: c,
    expectedFlats,
    expected: c.perFlatAmount * expectedFlats.length,
    collected,
    cost,
    net: collected - cost,
    paidFlatIds,
    pendingFlats,
  };
}

export interface CategoryTotal {
  category: string;
  amount: number;
}

export interface MonthSummary {
  month: MonthKey;
  opening: number;
  due: number;
  maintenanceExpected: number;
  maintenanceCollected: number;
  collectionIncome: number;
  regularExpenses: number;
  collectionCosts: number;
  income: number;
  spent: number;
  closing: number;
  paidCount: number;
  partialCount: number;
  unpaidCount: number;
  flats: FlatMonthStatus[];
  byCategory: CategoryTotal[];
  collections: CollectionSummary[];
}

function summarizeOne(db: DB, month: MonthKey, opening: number): MonthSummary {
  const due = maintenanceDue(db, month);
  const flats = db.flats.map((f) => flatStatus(db, f, month));
  const maintenanceCollected = db.payments
    .filter((p) => p.month === month)
    .reduce((s, p) => s + p.amount, 0);
  const expenses = db.expenses.filter((e) => e.month === month);
  const regularExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const collections = db.collections
    .filter((c) => c.month === month)
    .map((c) => collectionSummary(db, c));
  const collectionIncome = collections.reduce((s, c) => s + c.collected, 0);
  const collectionCosts = collections.reduce((s, c) => s + c.cost, 0);

  const cat = new Map<string, number>();
  for (const e of expenses) cat.set(e.category, (cat.get(e.category) ?? 0) + e.amount);
  for (const c of collections) if (c.cost > 0) cat.set(c.collection.title, (cat.get(c.collection.title) ?? 0) + c.cost);
  const byCategory = [...cat.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  const income = maintenanceCollected + collectionIncome;
  const spent = regularExpenses + collectionCosts;
  return {
    month,
    opening,
    due,
    maintenanceExpected: due * db.flats.length,
    maintenanceCollected,
    collectionIncome,
    regularExpenses,
    collectionCosts,
    income,
    spent,
    closing: opening + income - spent,
    paidCount: flats.filter((f) => f.status === "paid").length,
    partialCount: flats.filter((f) => f.status === "partial").length,
    unpaidCount: flats.filter((f) => f.status === "unpaid").length,
    flats,
    byCategory,
    collections,
  };
}

/** Summaries for every active month, with balances carried forward. */
export function allSummaries(db: DB, now: Date = new Date()): MonthSummary[] {
  const months = activeMonths(db, now);
  const out: MonthSummary[] = [];
  let opening = db.settings.openingBalance;
  for (const m of months) {
    const s = summarizeOne(db, m, opening);
    out.push(s);
    opening = db.settings.carryForward ? s.closing : 0;
  }
  return out;
}

export function monthSummary(db: DB, month: MonthKey, now: Date = new Date()): MonthSummary {
  const found = allSummaries(db, now).find((s) => s.month === month);
  return found ?? summarizeOne(db, month, 0);
}

export interface FlatDue {
  flat: Flat;
  months: { month: MonthKey; pending: number }[];
  total: number;
}

export interface DuesReport {
  /** Overdue maintenance: past months, plus this month once the due day has passed. */
  overdue: FlatDue[];
  overdueTotal: number;
  /** This month, still within the grace period. */
  upcoming: FlatDue[];
  upcomingTotal: number;
  dueDay: number;
  graceMonth?: MonthKey;
}

export function duesReport(db: DB, now: Date = new Date()): DuesReport {
  const months = activeMonths(db, now);
  const cur = currentMonth(now);
  const inGrace = dayOfMonth(now) <= db.settings.dueDay;
  const overdueMap = new Map<string, FlatDue>();
  const upcomingMap = new Map<string, FlatDue>();

  for (const m of months) {
    if (compareMonths(m, cur) > 0) continue;
    const isGrace = m === cur && inGrace;
    for (const flat of db.flats) {
      const st = flatStatus(db, flat, m);
      if (st.pending <= 0) continue;
      const map = isGrace ? upcomingMap : overdueMap;
      const entry = map.get(flat.id) ?? { flat, months: [], total: 0 };
      entry.months.push({ month: m, pending: st.pending });
      entry.total += st.pending;
      map.set(flat.id, entry);
    }
  }
  const order = (a: FlatDue, b: FlatDue) => a.flat.id.localeCompare(b.flat.id);
  const overdue = [...overdueMap.values()].sort(order);
  const upcoming = [...upcomingMap.values()].sort(order);
  return {
    overdue,
    overdueTotal: overdue.reduce((s, d) => s + d.total, 0),
    upcoming,
    upcomingTotal: upcoming.reduce((s, d) => s + d.total, 0),
    dueDay: db.settings.dueDay,
    graceMonth: inGrace && months.includes(cur) ? cur : undefined,
  };
}

/** Per-month history for one flat (newest first). */
export function flatHistory(db: DB, flat: Flat, now: Date = new Date()) {
  return activeMonths(db, now)
    .slice()
    .reverse()
    .map((m) => ({
      ...flatStatus(db, flat, m),
      month: m,
      collections: db.collections
        .filter((c) => c.month === m && !c.exemptFlats.includes(flat.id))
        .map((c) => {
          const paid = c.payments.filter((p) => p.flatId === flat.id).reduce((s, p) => s + p.amount, 0);
          return { id: c.id, title: c.title, due: c.perFlatAmount, paid };
        }),
    }));
}

/** Indian rupees, e.g. ₹19,500 or −₹10,052. Paise are shown only when there are any (₹5,492.50). */
export function inr(n: number): string {
  const paise = Math.round(n * 100);
  const sign = paise < 0 ? "−" : "";
  const abs = Math.abs(paise) / 100;
  const whole = Number.isInteger(abs);
  return `${sign}₹${abs.toLocaleString("en-IN", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** Adds money without floating-point drift (to the paisa). */
export function sumMoney(values: number[]): number {
  return values.reduce((a, v) => a + Math.round(v * 100), 0) / 100;
}

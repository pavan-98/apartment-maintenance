// Core data model. The whole apartment's records are kept as one small JSON
// document (15 flats × a few dozen entries per month), which keeps storage
// simple and lets every change be validated and logged in one place.

export type MonthKey = string; // "YYYY-MM"
export type PayMode = "cash" | "upi" | "bank" | "other";

export interface Flat {
  id: string; // "101"
  floor: number;
  owner: string;
  resident?: string; // tenant / person living there, if different from owner
  phone?: string; // only visible to admins
  notes?: string;
}

export interface Payment {
  id: string;
  flatId: string;
  month: MonthKey;
  amount: number;
  date: string; // YYYY-MM-DD
  mode: PayMode;
  receivedBy?: string;
  note?: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  month: MonthKey;
  category: string; // e.g. "Salary", "Electricity", "Misc"
  label: string;
  amount: number;
  date?: string;
  note?: string;
  receiptId?: string;
  createdAt: string;
}

export interface CollectionCost {
  id: string;
  label: string;
  amount: number;
  note?: string;
  receiptId?: string;
}

export interface CollectionPayment {
  id: string;
  flatId: string;
  amount: number;
  date: string;
  mode: PayMode;
  note?: string;
}

/** A one-off work funded by a separate per-flat collection, e.g. pest control. */
export interface SpecialCollection {
  id: string;
  month: MonthKey;
  title: string;
  description?: string;
  perFlatAmount: number;
  costs: CollectionCost[];
  payments: CollectionPayment[];
  /** Flats excluded from this collection (not expected to pay). */
  exemptFlats: string[];
  createdAt: string;
}

export interface Rule {
  id: string;
  title: string;
  body: string;
  important?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseTemplate {
  id: string;
  category: string;
  label: string;
  amount: number;
}

export interface Settings {
  apartmentName: string;
  maintenanceAmount: number;
  /** Per-month override of the maintenance amount. */
  maintenanceOverrides: Record<MonthKey, number>;
  /** First month the books start from. */
  startMonth: MonthKey;
  /** Money in hand at the start of startMonth. */
  openingBalance: number;
  /** Carry each month's closing balance into the next month. */
  carryForward: boolean;
  /** Day of month after which unpaid maintenance turns into a red alert. */
  dueDay: number;
  expenseTemplates: ExpenseTemplate[];
  /** True while the September 2026 sample data is loaded. */
  isDemo: boolean;
  demoMonth?: MonthKey;
}

export interface AuditEntry {
  id: string;
  at: string;
  by: string;
  action: string;
  detail: string;
}

export interface DB {
  version: number;
  settings: Settings;
  flats: Flat[];
  payments: Payment[];
  expenses: Expense[];
  collections: SpecialCollection[];
  rules: Rule[];
  audit: AuditEntry[];
}

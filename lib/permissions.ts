import type { DB, Role } from "./types";
import type { Action } from "./actions";
import { currentMonth } from "./dates";
import { flatStatus } from "./calc";

/**
 * What a manager may do. The main admin may do everything.
 *
 * Managers run the current month: maintenance, expenses and additional works
 * for this month only, notices, WhatsApp sending and phone numbers. They can
 * also record a late payment for an earlier month's dues (money received
 * this month), but cannot change or delete anything from past months.
 * Settings, rules, owner names, managers and the edit history stay with the
 * main admin.
 */
export const MANAGER_CAN = [
  "Record maintenance payments for the current month",
  "Record late payments for earlier months' dues (received this month)",
  "Add and edit this month's expenses and additional works",
  "Post and edit notices",
  "Send WhatsApp reminders and notices",
  "Send notifications to residents' devices",
  "Add phone numbers and update who lives in a flat",
];

export const MANAGER_CANNOT = [
  "Change or delete anything from past months",
  "See the edit history",
  "Change settings, rules or owner names",
  "Add or remove managers, or reset the sample data",
];

const OWNER_ONLY = "Only the main admin can do this.";
const PAST = "Managers can only change the current month.";

/** Returns an error message if the role may not perform the action, or null if allowed. */
export function checkPermission(db: DB, role: Role, action: Action, now: Date = new Date()): string | null {
  if (role === "owner") return null;
  const cur = currentMonth(now);
  const isCur = (m: string | undefined) => m === cur;

  switch (action.type) {
    case "payment.add": {
      if (isCur(action.month)) return null;
      // Late payment for an earlier month: allowed only up to what is still due,
      // and only with a payment date in the current month.
      if (action.month > cur) return PAST;
      const flat = db.flats.find((f) => f.id === action.flatId);
      if (!flat) return null; // the action itself reports "Flat not found"
      const pending = flatStatus(db, flat, action.month).pending;
      if (pending <= 0) return "This month is already fully paid.";
      if (Number(action.amount) > pending) return `Only the pending amount (₹${pending.toLocaleString("en-IN")}) can be recorded for a past month.`;
      if (typeof action.date !== "string" || !action.date.startsWith(cur)) return "A late payment must be dated this month.";
      return null;
    }
    case "payment.markAll":
      return isCur(action.month) ? null : PAST;
    case "payment.delete": {
      const p = db.payments.find((x) => x.id === action.id);
      return !p || isCur(p.month) ? null : PAST;
    }
    case "expense.add":
    case "expense.applyTemplates":
      return isCur(action.month) ? null : PAST;
    case "expense.update":
    case "expense.delete": {
      const e = db.expenses.find((x) => x.id === action.id);
      return !e || isCur(e.month) ? null : PAST;
    }
    case "collection.create":
      return isCur(action.month) ? null : PAST;
    case "collection.update":
    case "collection.delete":
    case "collection.cost.add":
    case "collection.cost.delete":
    case "collection.payment.add":
    case "collection.payment.delete": {
      const c = db.collections.find((x) => x.id === action.id);
      return !c || isCur(c.month) ? null : PAST;
    }
    case "notice.add":
    case "notice.update":
    case "notice.delete":
    case "contacts.save":
      return null;
    case "flat.update": {
      const f = db.flats.find((x) => x.id === action.flatId);
      if (f && f.owner.trim() !== String(action.owner ?? "").trim()) return "Only the main admin can change owner names.";
      return null;
    }
    default:
      return OWNER_ONLY;
  }
}

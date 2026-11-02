import type {
  CollectionCost,
  CollectionPayment,
  DB,
  Expense,
  ExpenseTemplate,
  Notice,
  PopupMode,
  AdminUser,
  Flat,
  PayMode,
  Payment,
  Rule,
  Settings,
  SpecialCollection,
} from "./types";
import { isMonthKey, currentMonth } from "./dates";
import { normalizePhone } from "./phone";
import { isRuleCategory } from "./rules";
import { demoDB, freshDB } from "./seed";
import { inr } from "./calc";

/** Every change an admin can make. Applied on the server, validated, and logged. */
export type Action =
  | { type: "flat.update"; flatId: string; owner: string; resident?: string; phone?: string; residentPhone?: string; notes?: string }
  | { type: "contacts.save"; contacts: { flatId: string; phone?: string; residentPhone?: string }[] }
  | { type: "notice.add"; notice: NoticeInput }
  | { type: "notice.update"; id: string; notice: NoticeInput }
  | { type: "notice.delete"; id: string }
  | { type: "payment.add"; flatId: string; month: string; amount: number; date: string; mode: PayMode; receivedBy?: string; note?: string }
  | { type: "payment.markAll"; flatIds: string[]; month: string; date: string; mode: PayMode }
  | { type: "payment.delete"; id: string }
  | { type: "expense.add"; month: string; category: string; label: string; amount: number; date?: string; note?: string; receiptId?: string }
  | { type: "expense.update"; id: string; category: string; label: string; amount: number; date?: string; note?: string; receiptId?: string | null }
  | { type: "expense.delete"; id: string }
  | { type: "expense.applyTemplates"; month: string; templateIds?: string[] }
  | { type: "collection.create"; month: string; title: string; description?: string; perFlatAmount: number; exemptFlats?: string[] }
  | { type: "collection.update"; id: string; title: string; description?: string; perFlatAmount: number; exemptFlats: string[] }
  | { type: "collection.delete"; id: string }
  | { type: "collection.cost.add"; id: string; label: string; amount: number; note?: string; receiptId?: string }
  | { type: "collection.cost.delete"; id: string; costId: string }
  | { type: "collection.payment.add"; id: string; flatId: string; amount: number; date: string; mode: PayMode; note?: string }
  | { type: "collection.payment.delete"; id: string; paymentId: string }
  | { type: "rule.add"; rule: RuleInput }
  | { type: "rule.update"; id: string; rule: RuleInput }
  | { type: "rule.delete"; id: string }
  | { type: "rule.move"; id: string; dir: -1 | 1 }
  | { type: "settings.update"; settings: Partial<Pick<Settings, "apartmentName" | "maintenanceAmount" | "startMonth" | "openingBalance" | "carryForward" | "dueDay">> }
  | { type: "settings.monthAmount"; month: string; amount: number | null }
  | { type: "template.save"; templates: ExpenseTemplate[] }
  | { type: "data.clearDemo" }
  | { type: "data.loadDemo" }
  // Manager accounts (main admin only). Passwords are hashed by the server
  // before the action is applied; the browser sends `password`.
  | { type: "user.add"; name: string; password?: string; passwordHash?: string }
  | { type: "user.resetPassword"; id: string; password?: string; passwordHash?: string }
  | { type: "user.setActive"; id: string; active: boolean }
  | { type: "user.remove"; id: string };

export interface RuleInput {
  titleEn?: string;
  titleTe?: string;
  bodyEn?: string;
  bodyTe?: string;
  category?: string;
  important?: boolean;
  announce?: boolean;
}

export interface NoticeInput {
  titleEn?: string;
  titleTe?: string;
  bodyEn?: string;
  bodyTe?: string;
  important?: boolean;
  popupMode?: PopupMode;
  expiresOn?: string;
}

export class ActionError extends Error {}

const MODES: PayMode[] = ["cash", "upi", "bank", "other"];
const MAX_AUDIT = 1000;

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
}

function text(v: unknown, field: string, max = 200, required = true): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (required && !s) throw new ActionError(`${field} is required`);
  if (s.length > max) throw new ActionError(`${field} is too long`);
  return s;
}

function optText(v: unknown, field: string, max = 500): string | undefined {
  const s = text(v ?? "", field, max, false);
  return s || undefined;
}

function money(v: unknown, field: string, allowZero = false, allowNegative = false): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw new ActionError(`${field} must be a number`);
  if (!allowNegative && n < 0) throw new ActionError(`${field} cannot be negative`);
  if (!allowZero && n === 0) throw new ActionError(`${field} must be more than 0`);
  if (Math.abs(n) > 1e8) throw new ActionError(`${field} is too large`);
  return Math.round(n * 100) / 100;
}

function month(v: unknown): string {
  if (!isMonthKey(v)) throw new ActionError("Invalid month");
  return v;
}

function date(v: unknown, field = "Date"): string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ActionError(`${field} is invalid`);
  return v;
}

function mode(v: unknown): PayMode {
  if (!MODES.includes(v as PayMode)) throw new ActionError("Invalid payment mode");
  return v as PayMode;
}

function phone(v: unknown, field: string): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return undefined;
  const n = normalizePhone(s);
  if (!n) throw new ActionError(`${field} doesn’t look like a valid mobile number`);
  return n;
}

function noticeFields(n: NoticeInput | undefined) {
  const x = n ?? {};
  const titleEn = text(x.titleEn ?? "", "English title", 150, false);
  const titleTe = text(x.titleTe ?? "", "Telugu title", 150, false);
  const bodyEn = text(x.bodyEn ?? "", "English notice", 4000, false);
  const bodyTe = text(x.bodyTe ?? "", "Telugu notice", 4000, false);
  if (!titleEn && !titleTe) throw new ActionError("Please give the notice a title (English or Telugu)");
  if (!bodyEn && !bodyTe) throw new ActionError("Please write the notice (English or Telugu)");
  const expiresOn = x.expiresOn ? date(x.expiresOn, "Show until date") : undefined;
  const popupMode: PopupMode = x.popupMode === "every" || x.popupMode === "once" ? x.popupMode : "none";
  if (popupMode === "every" && !expiresOn) {
    throw new ActionError("A notice that pops up every time needs an end date (the notice date)");
  }
  return { titleEn, titleTe, bodyEn, bodyTe, important: !!x.important, popupMode, expiresOn };
}

function ruleFields(r: RuleInput | undefined) {
  const x = r ?? {};
  const titleEn = text(x.titleEn ?? "", "English title", 150, false);
  const titleTe = text(x.titleTe ?? "", "Telugu title", 150, false);
  const bodyEn = text(x.bodyEn ?? "", "English rule", 3000, false);
  const bodyTe = text(x.bodyTe ?? "", "Telugu rule", 3000, false);
  if (!titleEn && !titleTe) throw new ActionError("Please give the rule a title (English or Telugu)");
  if (!bodyEn && !bodyTe) throw new ActionError("Please write the rule (English or Telugu)");
  const category = isRuleCategory(x.category) ? x.category : "general";
  return { titleEn, titleTe, bodyEn, bodyTe, category, important: !!x.important, announce: !!x.announce };
}

export function ruleLabel(r: Pick<Rule, "titleEn" | "titleTe">): string {
  return r.titleEn || r.titleTe;
}

function findUser(db: DB, id: unknown): AdminUser {
  const u = db.users.find((x) => x.id === id);
  if (!u) throw new ActionError("Manager not found");
  return u;
}

function hashOf(v: unknown): string {
  if (typeof v !== "string" || !v.startsWith("scrypt$")) throw new ActionError("Password missing");
  return v;
}

export function noticeTitle(n: Pick<Notice, "titleEn" | "titleTe">): string {
  return n.titleEn || n.titleTe;
}

function findFlat(db: DB, id: unknown): Flat {
  const f = db.flats.find((x) => x.id === id);
  if (!f) throw new ActionError("Flat not found");
  return f;
}

function findCollection(db: DB, id: unknown): SpecialCollection {
  const c = db.collections.find((x) => x.id === id);
  if (!c) throw new ActionError("Collection not found");
  return c;
}

function flatList(db: DB, ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const valid = new Set(db.flats.map((f) => f.id));
  return [...new Set(ids.filter((x): x is string => typeof x === "string" && valid.has(x)))];
}

/**
 * Apply an action to a copy of the database and return the new database.
 * `by` is the admin name recorded in the edit history.
 */
export function applyAction(input: DB, action: Action, by: string, now: Date = new Date()): DB {
  const db: DB = structuredClone(input);
  const at = now.toISOString();
  const log = (actionName: string, detail: string) => {
    db.audit.unshift({ id: uid("a"), at, by, action: actionName, detail });
    if (db.audit.length > MAX_AUDIT) db.audit.length = MAX_AUDIT;
  };

  switch (action.type) {
    case "flat.update": {
      const f = findFlat(db, action.flatId);
      const before = f.owner;
      f.owner = text(action.owner, "Owner name", 80);
      f.resident = optText(action.resident, "Resident name", 80);
      f.phone = phone(action.phone, `Owner phone for ${f.id}`);
      f.residentPhone = phone(action.residentPhone, `Resident phone for ${f.id}`);
      f.notes = optText(action.notes, "Notes", 300);
      log("Flat updated", `${f.id}: ${before === f.owner ? f.owner : `${before} → ${f.owner}`}`);
      break;
    }
    case "contacts.save": {
      if (!Array.isArray(action.contacts)) throw new ActionError("Invalid list");
      let changed = 0;
      for (const c of action.contacts) {
        const f = findFlat(db, c.flatId);
        const p = phone(c.phone, `Owner phone for ${f.id}`);
        const r = phone(c.residentPhone, `Resident phone for ${f.id}`);
        if (p !== f.phone || r !== f.residentPhone) changed++;
        f.phone = p;
        f.residentPhone = r;
      }
      log("Phone numbers updated", `${changed} flat${changed === 1 ? "" : "s"} changed`);
      break;
    }
    case "notice.add": {
      const n: Notice = { id: uid("n"), ...noticeFields(action.notice), createdAt: at, updatedAt: at };
      db.notices.unshift(n);
      log("Notice posted", noticeTitle(n));
      break;
    }
    case "notice.update": {
      const n = db.notices.find((x) => x.id === action.id);
      if (!n) throw new ActionError("Notice not found");
      Object.assign(n, noticeFields(action.notice), { updatedAt: at });
      if (!n.expiresOn) delete n.expiresOn;
      delete n.popup;
      log("Notice edited", noticeTitle(n));
      break;
    }
    case "notice.delete": {
      const n = db.notices.find((x) => x.id === action.id);
      if (!n) throw new ActionError("Notice not found");
      db.notices = db.notices.filter((x) => x.id !== n.id);
      log("Notice removed", noticeTitle(n));
      break;
    }
    case "payment.add": {
      const f = findFlat(db, action.flatId);
      const p: Payment = {
        id: uid("p"),
        flatId: f.id,
        month: month(action.month),
        amount: money(action.amount, "Amount"),
        date: date(action.date),
        mode: mode(action.mode),
        receivedBy: optText(action.receivedBy, "Received by", 60),
        note: optText(action.note, "Note", 200),
        createdAt: at,
      };
      db.payments.push(p);
      log("Maintenance received", `${f.id} · ${inr(p.amount)} for ${p.month} (${p.mode})`);
      break;
    }
    case "payment.markAll": {
      const m = month(action.month);
      const d = date(action.date);
      const md = mode(action.mode);
      const ids = flatList(db, action.flatIds);
      const due = db.settings.maintenanceOverrides[m] ?? db.settings.maintenanceAmount;
      const added: string[] = [];
      for (const id of ids) {
        const paid = db.payments.filter((p) => p.flatId === id && p.month === m).reduce((s, p) => s + p.amount, 0);
        const pending = due - paid;
        if (pending <= 0) continue;
        db.payments.push({ id: uid("p"), flatId: id, month: m, amount: pending, date: d, mode: md, createdAt: at });
        added.push(id);
      }
      if (!added.length) throw new ActionError("Nothing to mark — those flats have already paid");
      log("Maintenance received", `${added.join(", ")} for ${m} (${md})`);
      break;
    }
    case "payment.delete": {
      const idx = db.payments.findIndex((p) => p.id === action.id);
      if (idx < 0) throw new ActionError("Payment not found");
      const [p] = db.payments.splice(idx, 1);
      log("Payment removed", `${p.flatId} · ${inr(p.amount)} for ${p.month}`);
      break;
    }
    case "expense.add": {
      const e: Expense = {
        id: uid("e"),
        month: month(action.month),
        category: text(action.category, "Category", 60),
        label: text(action.label || action.category, "Description", 120),
        amount: money(action.amount, "Amount"),
        date: action.date ? date(action.date) : undefined,
        note: optText(action.note, "Note", 300),
        receiptId: optText(action.receiptId, "Receipt", 80),
        createdAt: at,
      };
      db.expenses.push(e);
      log("Expense added", `${e.label} · ${inr(e.amount)} (${e.month})`);
      break;
    }
    case "expense.update": {
      const e = db.expenses.find((x) => x.id === action.id);
      if (!e) throw new ActionError("Expense not found");
      const before = e.amount;
      e.category = text(action.category, "Category", 60);
      e.label = text(action.label || action.category, "Description", 120);
      e.amount = money(action.amount, "Amount");
      e.date = action.date ? date(action.date) : undefined;
      e.note = optText(action.note, "Note", 300);
      if (action.receiptId !== undefined) e.receiptId = action.receiptId ? text(action.receiptId, "Receipt", 80) : undefined;
      log("Expense edited", `${e.label} · ${before === e.amount ? inr(e.amount) : `${inr(before)} → ${inr(e.amount)}`} (${e.month})`);
      break;
    }
    case "expense.delete": {
      const idx = db.expenses.findIndex((x) => x.id === action.id);
      if (idx < 0) throw new ActionError("Expense not found");
      const [e] = db.expenses.splice(idx, 1);
      log("Expense removed", `${e.label} · ${inr(e.amount)} (${e.month})`);
      break;
    }
    case "expense.applyTemplates": {
      const m = month(action.month);
      const existing = new Set(db.expenses.filter((e) => e.month === m).map((e) => e.label));
      const chosen = db.settings.expenseTemplates.filter(
        (t) => !action.templateIds || action.templateIds.includes(t.id),
      );
      const added = chosen.filter((t) => !existing.has(t.label) && t.amount > 0);
      if (!added.length) throw new ActionError("Regular expenses are already added for this month");
      for (const t of added) {
        db.expenses.push({ id: uid("e"), month: m, category: t.category, label: t.label, amount: t.amount, createdAt: at });
      }
      log("Regular expenses added", `${added.length} items for ${m}`);
      break;
    }
    case "collection.create": {
      const c: SpecialCollection = {
        id: uid("c"),
        month: month(action.month),
        title: text(action.title, "Title", 80),
        description: optText(action.description, "Description", 300),
        perFlatAmount: money(action.perFlatAmount, "Amount per flat", true),
        exemptFlats: flatList(db, action.exemptFlats),
        costs: [],
        payments: [],
        createdAt: at,
      };
      db.collections.push(c);
      log("Special collection created", `${c.title} · ${inr(c.perFlatAmount)}/flat (${c.month})`);
      break;
    }
    case "collection.update": {
      const c = findCollection(db, action.id);
      c.title = text(action.title, "Title", 80);
      c.description = optText(action.description, "Description", 300);
      c.perFlatAmount = money(action.perFlatAmount, "Amount per flat", true);
      c.exemptFlats = flatList(db, action.exemptFlats);
      log("Special collection edited", c.title);
      break;
    }
    case "collection.delete": {
      const c = findCollection(db, action.id);
      db.collections = db.collections.filter((x) => x.id !== c.id);
      log("Special collection removed", `${c.title} (${c.month})`);
      break;
    }
    case "collection.cost.add": {
      const c = findCollection(db, action.id);
      const cost: CollectionCost = {
        id: uid("cc"),
        label: text(action.label, "Item", 120),
        amount: money(action.amount, "Amount"),
        note: optText(action.note, "Note", 300),
        receiptId: optText(action.receiptId, "Receipt", 80),
      };
      c.costs.push(cost);
      log("Work cost added", `${c.title}: ${cost.label} · ${inr(cost.amount)}`);
      break;
    }
    case "collection.cost.delete": {
      const c = findCollection(db, action.id);
      const cost = c.costs.find((x) => x.id === action.costId);
      if (!cost) throw new ActionError("Cost not found");
      c.costs = c.costs.filter((x) => x.id !== cost.id);
      log("Work cost removed", `${c.title}: ${cost.label} · ${inr(cost.amount)}`);
      break;
    }
    case "collection.payment.add": {
      const c = findCollection(db, action.id);
      const f = findFlat(db, action.flatId);
      const p: CollectionPayment = {
        id: uid("cp"),
        flatId: f.id,
        amount: money(action.amount, "Amount"),
        date: date(action.date),
        mode: mode(action.mode),
        note: optText(action.note, "Note", 200),
      };
      c.payments.push(p);
      log("Collection received", `${c.title}: ${f.id} · ${inr(p.amount)}`);
      break;
    }
    case "collection.payment.delete": {
      const c = findCollection(db, action.id);
      const p = c.payments.find((x) => x.id === action.paymentId);
      if (!p) throw new ActionError("Payment not found");
      c.payments = c.payments.filter((x) => x.id !== p.id);
      log("Collection payment removed", `${c.title}: ${p.flatId} · ${inr(p.amount)}`);
      break;
    }
    case "rule.add": {
      const r: Rule = { id: uid("r"), ...ruleFields(action.rule), createdAt: at, updatedAt: at };
      db.rules.push(r);
      log("Rule added", ruleLabel(r));
      break;
    }
    case "rule.update": {
      const r = db.rules.find((x) => x.id === action.id);
      if (!r) throw new ActionError("Rule not found");
      Object.assign(r, ruleFields(action.rule), { updatedAt: at });
      delete r.title;
      delete r.body;
      log("Rule edited", ruleLabel(r));
      break;
    }
    case "rule.delete": {
      const r = db.rules.find((x) => x.id === action.id);
      if (!r) throw new ActionError("Rule not found");
      db.rules = db.rules.filter((x) => x.id !== r.id);
      log("Rule removed", ruleLabel(r));
      break;
    }
    case "rule.move": {
      // Move within the same topic (rules are shown grouped by topic).
      const i = db.rules.findIndex((x) => x.id === action.id);
      if (i < 0) break;
      const cat = db.rules[i].category;
      const step = action.dir === -1 ? -1 : 1;
      let j = i + step;
      while (j >= 0 && j < db.rules.length && db.rules[j].category !== cat) j += step;
      if (j < 0 || j >= db.rules.length) break;
      [db.rules[i], db.rules[j]] = [db.rules[j], db.rules[i]];
      break;
    }
    case "settings.update": {
      const s = action.settings ?? {};
      const next = { ...db.settings };
      if (s.apartmentName !== undefined) next.apartmentName = text(s.apartmentName, "Apartment name", 120);
      if (s.maintenanceAmount !== undefined) next.maintenanceAmount = money(s.maintenanceAmount, "Maintenance amount", true);
      if (s.startMonth !== undefined) next.startMonth = month(s.startMonth);
      if (s.openingBalance !== undefined) next.openingBalance = money(s.openingBalance, "Opening balance", true, true);
      if (s.carryForward !== undefined) next.carryForward = !!s.carryForward;
      if (s.dueDay !== undefined) {
        const d = Math.round(Number(s.dueDay));
        if (!(d >= 1 && d <= 28)) throw new ActionError("Due day must be between 1 and 28");
        next.dueDay = d;
      }
      db.settings = next;
      log("Settings changed", Object.keys(s).join(", "));
      break;
    }
    case "settings.monthAmount": {
      const m = month(action.month);
      if (action.amount === null) delete db.settings.maintenanceOverrides[m];
      else db.settings.maintenanceOverrides[m] = money(action.amount, "Amount", true);
      log("Maintenance amount changed", `${m}: ${action.amount === null ? "default" : inr(action.amount)}`);
      break;
    }
    case "template.save": {
      if (!Array.isArray(action.templates) || action.templates.length > 30) throw new ActionError("Invalid list");
      db.settings.expenseTemplates = action.templates.map((t) => ({
        id: typeof t.id === "string" && t.id ? t.id.slice(0, 40) : uid("t"),
        category: text(t.category, "Category", 60),
        label: text(t.label || t.category, "Description", 120),
        amount: money(t.amount, "Amount", true),
      }));
      log("Regular expenses list changed", `${db.settings.expenseTemplates.length} items`);
      break;
    }
    case "user.add": {
      const name = text(action.name, "Name", 40);
      if (name.length < 2) throw new ActionError("Name is too short");
      if (db.users.some((u) => u.name.toLowerCase() === name.toLowerCase())) {
        throw new ActionError("A manager with this name already exists");
      }
      db.users.push({
        id: uid("u"),
        name,
        role: "manager",
        passwordHash: hashOf(action.passwordHash),
        active: true,
        sessionVersion: 1,
        createdAt: at,
      });
      log("Manager added", name);
      break;
    }
    case "user.resetPassword": {
      const u = findUser(db, action.id);
      u.passwordHash = hashOf(action.passwordHash);
      u.sessionVersion += 1;
      log("Manager password changed", u.name);
      break;
    }
    case "user.setActive": {
      const u = findUser(db, action.id);
      u.active = !!action.active;
      u.sessionVersion += 1;
      log(u.active ? "Manager access restored" : "Manager access paused", u.name);
      break;
    }
    case "user.remove": {
      const u = findUser(db, action.id);
      db.users = db.users.filter((x) => x.id !== u.id);
      log("Manager removed", u.name);
      break;
    }
    case "data.clearDemo": {
      const fresh = freshDB(db.flats, now);
      fresh.settings.expenseTemplates = db.settings.expenseTemplates;
      fresh.settings.maintenanceAmount = db.settings.maintenanceAmount;
      fresh.settings.apartmentName = db.settings.apartmentName;
      fresh.settings.dueDay = db.settings.dueDay;
      fresh.settings.startMonth = currentMonth(now);
      fresh.version = db.version;
      fresh.users = db.users;
      fresh.audit = [{ id: uid("a"), at, by, action: "Started fresh", detail: `Sample data removed; books start ${fresh.settings.startMonth} with ₹0` }];
      return fresh;
    }
    case "data.loadDemo": {
      const demo = demoDB(now);
      demo.version = db.version;
      demo.users = db.users;
      demo.audit.unshift({ id: uid("a"), at, by, action: "Sample data", detail: "Loaded sample data (October–November 2026)" });
      return demo;
    }
    default:
      throw new ActionError("Unknown action");
  }
  return db;
}

/** What residents see: no phone numbers, notes, managers or edit history. */
export function publicView(db: DB): DB {
  return {
    ...db,
    flats: db.flats.map(({ phone: _p, residentPhone: _r, notes: _n, ...f }) => f),
    users: [],
    audit: [],
  };
}

/** What a manager sees: everything needed to run the month, but no edit history or team list. */
export function managerView(db: DB): DB {
  return { ...db, users: [], audit: [] };
}

/** What the main admin sees: everything except password hashes. */
export function ownerView(db: DB): DB {
  return { ...db, users: db.users.map((u) => ({ ...u, passwordHash: "" })) };
}

import { describe, expect, it } from "vitest";
import { demoDB, freshDB, normalizeDB } from "@/lib/seed";
import { applyAction, managerView, ownerView, publicView, type Action } from "@/lib/actions";
import { checkPermission } from "@/lib/permissions";
import { hashPassword, makeToken, resolveSession, verifyPassword, verifyToken, findManager } from "@/lib/auth";
import { activeNotices } from "@/lib/whatsapp";
import { announcedRules, groupRules } from "@/lib/rules";
import type { DB } from "@/lib/types";

const NOW = new Date("2026-11-02T06:00:00Z");

function withManager(db: DB, password = "secret1"): DB {
  return applyAction(db, { type: "user.add", name: "Ravi", passwordHash: hashPassword(password) }, "Owner", NOW);
}

describe("manager accounts", () => {
  it("hashes passwords and finds the manager by name, any case", () => {
    const db = withManager(freshDB(undefined, NOW));
    expect(db.users[0].passwordHash).toMatch(/^scrypt\$/);
    expect(verifyPassword("secret1", db.users[0].passwordHash)).toBe(true);
    expect(verifyPassword("wrong", db.users[0].passwordHash)).toBe(false);
    expect(findManager(db, "  ravi ", "secret1")?.name).toBe("Ravi");
    expect(findManager(db, "Ravi", "nope")).toBeNull();
  });

  it("refuses duplicate names and unhashed passwords", () => {
    const db = withManager(freshDB(undefined, NOW));
    expect(() => withManager(db)).toThrow(/already exists/);
    expect(() => applyAction(db, { type: "user.add", name: "Sita", password: "plain" } as Action, "O", NOW)).toThrow(/Password/);
  });

  it("stops an old login working after pause or password change", () => {
    process.env.ADMIN_PASSWORD = "owner-pass";
    let db = withManager(freshDB(undefined, NOW));
    const u = db.users[0];
    const claims = verifyToken(makeToken({ name: u.name, role: "manager", userId: u.id, ver: u.sessionVersion }));
    expect(resolveSession(claims, db)).toEqual({ name: "Ravi", role: "manager", userId: u.id });
    const paused = applyAction(db, { type: "user.setActive", id: u.id, active: false }, "O", NOW);
    expect(resolveSession(claims, paused)).toBeNull();
    db = applyAction(db, { type: "user.resetPassword", id: u.id, passwordHash: hashPassword("newpass") }, "O", NOW);
    expect(resolveSession(claims, db)).toBeNull();
    const removed = applyAction(db, { type: "user.remove", id: u.id }, "O", NOW);
    expect(removed.users).toHaveLength(0);
  });

  it("rejects tampered login cookies", () => {
    process.env.ADMIN_PASSWORD = "owner-pass";
    const token = makeToken({ name: "Ravi", role: "manager", userId: "u-1", ver: 1 });
    const forged = token.replace(".manager.", ".owner.");
    expect(verifyToken(forged)).toBeNull();
  });

  it("never sends password hashes or history to the wrong people", () => {
    const db = withManager(demoDB(NOW));
    expect(ownerView(db).users[0].passwordHash).toBe("");
    expect(ownerView(db).audit.length).toBeGreaterThan(0);
    expect(managerView(db).users).toEqual([]);
    expect(managerView(db).audit).toEqual([]);
    expect(publicView(db).users).toEqual([]);
  });

  it("keeps managers when sample data is removed", () => {
    const db = applyAction(withManager(demoDB(NOW)), { type: "data.clearDemo" }, "O", NOW);
    expect(db.users.map((u) => u.name)).toEqual(["Ravi"]);
  });
});

describe("manager permissions", () => {
  const db = demoDB(NOW); // sample months Sep–Nov 2026; today is November
  const can = (a: Action) => checkPermission(db, "manager", a, NOW);

  it("allows the current month", () => {
    expect(can({ type: "payment.markAll", flatIds: ["102"], month: "2026-11", date: "2026-11-02", mode: "cash" })).toBeNull();
    expect(can({ type: "expense.add", month: "2026-11", category: "Misc", label: "Bulbs", amount: 200 })).toBeNull();
    expect(can({ type: "collection.create", month: "2026-11", title: "Diwali lights", perFlatAmount: 200 })).toBeNull();
    expect(can({ type: "notice.add", notice: { titleEn: "x", bodyEn: "y" } })).toBeNull();
    expect(can({ type: "contacts.save", contacts: [] })).toBeNull();
  });

  it("blocks changes to past months", () => {
    expect(can({ type: "payment.markAll", flatIds: ["102"], month: "2026-10", date: "2026-11-02", mode: "cash" })).toMatch(/current month/);
    expect(can({ type: "payment.delete", id: "demo-p-101" })).toMatch(/current month/);
    expect(can({ type: "expense.delete", id: "demo-e-oct-dussehra" })).toMatch(/current month/);
    expect(can({ type: "expense.add", month: "2026-10", category: "Misc", label: "x", amount: 1 })).toMatch(/current month/);
    expect(can({ type: "collection.payment.add", id: "demo-c-pest", flatId: "102", amount: 1400, date: "2026-11-02", mode: "cash" })).toMatch(/current month/);
  });

  it("allows a late payment for old dues, but only what is pending and dated this month", () => {
    const late = { type: "payment.add" as const, flatId: "202", month: "2026-09", date: "2026-11-02", mode: "cash" as const };
    expect(can({ ...late, amount: 1500 })).toBeNull();
    expect(can({ ...late, amount: 2000 })).toMatch(/pending amount/);
    expect(can({ ...late, amount: 1500, date: "2026-09-30" })).toMatch(/dated this month/);
    expect(can({ ...late, flatId: "101", amount: 100 })).toMatch(/already fully paid/);
  });

  it("keeps settings, rules, owners, managers and resets with the main admin", () => {
    expect(can({ type: "settings.update", settings: { maintenanceAmount: 2000 } })).toMatch(/main admin/);
    expect(can({ type: "rule.add", rule: { titleEn: "x", bodyEn: "y" } })).toMatch(/main admin/);
    expect(can({ type: "user.add", name: "X" })).toMatch(/main admin/);
    expect(can({ type: "data.clearDemo" })).toMatch(/main admin/);
    expect(can({ type: "template.save", templates: [] })).toMatch(/main admin/);
    expect(can({ type: "flat.update", flatId: "101", owner: "Someone else" })).toMatch(/owner names/);
    expect(can({ type: "flat.update", flatId: "101", owner: "N. Raju", resident: "New tenant" })).toBeNull();
  });

  it("lets the main admin do anything", () => {
    expect(checkPermission(db, "owner", { type: "data.clearDemo" }, NOW)).toBeNull();
    expect(checkPermission(db, "owner", { type: "payment.delete", id: "demo-p-101" }, NOW)).toBeNull();
  });
});

describe("notice pop-up modes", () => {
  it("needs an end date for notices that pop up every time", () => {
    const db = freshDB(undefined, NOW);
    const base = { titleEn: "Lift off", bodyEn: "Servicing", popupMode: "every" as const };
    expect(() => applyAction(db, { type: "notice.add", notice: base }, "A", NOW)).toThrow(/end date/);
    const ok = applyAction(db, { type: "notice.add", notice: { ...base, expiresOn: "2026-11-05" } }, "A", NOW);
    expect(ok.notices[0].popupMode).toBe("every");
  });

  it("keeps notices without an end date, and hides expired ones from residents", () => {
    let db = freshDB(undefined, NOW);
    db = applyAction(db, { type: "notice.add", notice: { titleEn: "Contacts", bodyEn: "Watchman 24x7", popupMode: "none" } }, "A", NOW);
    db = applyAction(db, { type: "notice.add", notice: { titleEn: "Old", bodyEn: "x", popupMode: "once", expiresOn: "2026-10-01" } }, "A", NOW);
    expect(activeNotices(db, "2026-11-02").map((n) => n.titleEn)).toEqual(["Contacts"]);
  });

  it("migrates older notices and rules", () => {
    const old = freshDB(undefined, NOW) as DB;
    (old.notices as unknown[]) = [{ id: "n1", titleEn: "A", titleTe: "", bodyEn: "B", bodyTe: "", popup: true, createdAt: "x", updatedAt: "x" }];
    (old.rules as unknown[]) = [{ id: "r1", title: "Parking", body: "Use your slot", createdAt: "x", updatedAt: "x" }];
    delete (old as Partial<DB>).users;
    const db = normalizeDB(old);
    expect(db.notices[0].popupMode).toBe("once");
    expect(db.rules[0]).toMatchObject({ titleEn: "Parking", bodyEn: "Use your slot", category: "general" });
    expect(db.users).toEqual([]);
  });
});

describe("rules", () => {
  it("groups by topic with important rules first", () => {
    const groups = groupRules(demoDB(NOW).rules);
    expect(groups[0].category.id).toBe("payments");
    expect(groups.flatMap((g) => g.rules)).toHaveLength(5);
  });

  it("announces only rules marked to announce, for 30 days", () => {
    const rules = demoDB(NOW).rules;
    expect(announcedRules(rules, NOW.getTime()).map((r) => r.id)).toEqual(["demo-r-4"]);
    expect(announcedRules(rules, NOW.getTime() + 31 * 86400000)).toEqual([]);
  });

  it("moves rules within their topic", () => {
    let db = demoDB(NOW);
    db = applyAction(db, { type: "rule.add", rule: { titleEn: "Second payment rule", bodyEn: "x", category: "payments" } }, "A", NOW);
    const id = db.rules[db.rules.length - 1].id;
    db = applyAction(db, { type: "rule.move", id, dir: -1 }, "A", NOW);
    const payments = db.rules.filter((r) => r.category === "payments").map((r) => r.id);
    expect(payments[0]).toBe(id);
  });
});

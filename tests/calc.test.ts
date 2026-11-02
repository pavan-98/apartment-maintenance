import { describe, expect, it } from "vitest";
import { demoDB, freshDB } from "@/lib/seed";
import { allSummaries, duesReport, monthSummary, activeMonths } from "@/lib/calc";
import { applyAction, ActionError, publicView } from "@/lib/actions";

const NOW = new Date("2026-11-02T06:00:00Z");

describe("September 2026 sample (from the book)", () => {
  const db = demoDB(NOW);
  const s = monthSummary(db, "2026-09", NOW);

  it("matches the book's maintenance totals", () => {
    expect(s.maintenanceCollected).toBe(19500);
    expect(s.paidCount).toBe(13);
    expect(s.flats.filter((f) => f.status === "unpaid").map((f) => f.flat.id)).toEqual(["102", "202"]);
  });

  it("matches the book's expenses", () => {
    expect(s.regularExpenses).toBe(16165);
    expect(s.collectionCosts).toBe(21286);
  });

  it("tracks pest control separately from maintenance", () => {
    const pest = s.collections[0];
    expect(pest.collected).toBe(16800);
    expect(pest.pendingFlats.map((p) => p.flat.id)).toEqual(["102", "201", "202"]);
  });

  it("starts from ₹0 (no carry-over) and ends at the book's total without the old shortage", () => {
    // Book: −9,472 including −8,321 carried in, i.e. −1,151 for September alone.
    expect(s.opening).toBe(0);
    expect(s.closing).toBe(-1151);
  });

  it("shows unpaid flats in the red alert, including arrears from October", () => {
    const d = duesReport(db, NOW);
    expect(d.overdue.map((x) => x.flat.id)).toEqual(["102", "202"]);
    expect(d.overdue.find((x) => x.flat.id === "202")?.months.map((m) => m.month)).toEqual(["2026-09", "2026-10"]);
    expect(d.overdueTotal).toBe(6000);
    // November is still within the grace period (due by the 10th).
    expect(d.upcoming).toHaveLength(9);
  });

  it("hides phone numbers from residents", () => {
    const withPhone = applyAction(db, { type: "flat.update", flatId: "101", owner: "N. Raju", phone: "9876543210" }, "T", NOW);
    expect(withPhone.flats[0].phone).toBe("+919876543210");
    expect(publicView(withPhone).flats[0].phone).toBeUndefined();
    expect(publicView(withPhone).audit).toEqual([]);
  });
});

describe("fresh start", () => {
  it("removing sample data keeps owners, clears money, starts this month at ₹0", () => {
    const db = applyAction(demoDB(NOW), { type: "data.clearDemo" }, "Pavan", NOW);
    expect(db.settings.isDemo).toBe(false);
    expect(db.settings.startMonth).toBe("2026-11");
    expect(db.settings.openingBalance).toBe(0);
    expect(db.payments).toEqual([]);
    expect(db.expenses).toEqual([]);
    expect(db.collections).toEqual([]);
    expect(db.flats.find((f) => f.id === "203")?.owner).toBe("Manjula");
    expect(db.audit[0].by).toBe("Pavan");
  });

  it("does not raise a red alert before the due day, only after", () => {
    const db = freshDB(undefined, NOW);
    const early = duesReport(db, new Date("2026-11-05T06:00:00Z"));
    expect(early.overdue).toEqual([]);
    expect(early.upcoming).toHaveLength(15);
    const late = duesReport(db, new Date("2026-11-15T06:00:00Z"));
    expect(late.overdue).toHaveLength(15);
    expect(late.upcoming).toEqual([]);
  });
});

describe("balances and actions", () => {
  it("carries the closing balance into the next month", () => {
    let db = freshDB(undefined, new Date("2026-10-01T06:00:00Z"));
    db = applyAction(db, { type: "payment.add", flatId: "101", month: "2026-10", amount: 1500, date: "2026-10-03", mode: "cash" }, "A", NOW);
    db = applyAction(db, { type: "expense.add", month: "2026-10", category: "Salary", label: "Salary", amount: 1000 }, "A", NOW);
    db = applyAction(db, { type: "payment.add", flatId: "102", month: "2026-11", amount: 1500, date: "2026-11-01", mode: "upi" }, "A", NOW);
    const [oct, nov] = allSummaries(db, NOW);
    expect(oct.closing).toBe(500);
    expect(nov.opening).toBe(500);
    expect(nov.closing).toBe(2000);
    const noCarry = applyAction(db, { type: "settings.update", settings: { carryForward: false } }, "A", NOW);
    expect(allSummaries(noCarry, NOW)[1].opening).toBe(0);
  });

  it("marks partial payments and lists past-month arrears", () => {
    let db = freshDB(undefined, new Date("2026-10-01T06:00:00Z"));
    db = applyAction(db, { type: "payment.add", flatId: "101", month: "2026-10", amount: 500, date: "2026-10-03", mode: "cash" }, "A", NOW);
    const oct = monthSummary(db, "2026-10", NOW);
    expect(oct.flats[0].status).toBe("partial");
    const d = duesReport(db, NOW); // Nov 2 = within grace for November
    expect(d.overdue.find((x) => x.flat.id === "101")?.total).toBe(1000);
    expect(d.upcoming).toHaveLength(15);
  });

  it("mark-all only fills what is pending", () => {
    let db = freshDB(undefined, NOW);
    db = applyAction(db, { type: "payment.add", flatId: "101", month: "2026-11", amount: 1000, date: "2026-11-01", mode: "cash" }, "A", NOW);
    db = applyAction(db, { type: "payment.markAll", flatIds: ["101", "102"], month: "2026-11", date: "2026-11-02", mode: "cash" }, "A", NOW);
    const nov = monthSummary(db, "2026-11", NOW);
    expect(nov.maintenanceCollected).toBe(3000);
    expect(nov.paidCount).toBe(2);
  });

  it("adds regular expenses once per month", () => {
    let db = freshDB(undefined, NOW);
    db = applyAction(db, { type: "expense.applyTemplates", month: "2026-11" }, "A", NOW);
    expect(monthSummary(db, "2026-11", NOW).regularExpenses).toBe(16165);
    expect(() => applyAction(db, { type: "expense.applyTemplates", month: "2026-11" }, "A", NOW)).toThrow(ActionError);
  });

  it("rejects bad input", () => {
    const db = freshDB(undefined, NOW);
    expect(() => applyAction(db, { type: "payment.add", flatId: "999", month: "2026-11", amount: 1, date: "2026-11-01", mode: "cash" }, "A", NOW)).toThrow("Flat not found");
    expect(() => applyAction(db, { type: "expense.add", month: "2026-13", category: "X", label: "X", amount: 5 }, "A", NOW)).toThrow("Invalid month");
    expect(() => applyAction(db, { type: "expense.add", month: "2026-11", category: "X", label: "X", amount: -5 }, "A", NOW)).toThrow();
  });

  it("shows the three sample months, whatever today's date is", () => {
    expect(activeMonths(demoDB(NOW), NOW)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(activeMonths(demoDB(NOW), new Date("2027-03-01T06:00:00Z"))).toEqual(["2026-09", "2026-10", "2026-11"]);
  });

  it("matches the book's October page and carries into November", () => {
    const [sep, oct, nov] = allSummaries(demoDB(NOW), NOW);
    expect(sep.closing).toBe(-1151);
    expect(oct.opening).toBe(-1151);
    expect(oct.maintenanceCollected).toBe(19500); // 13 flats; 102 and 202 unpaid
    expect(oct.flats.filter((f) => f.status === "unpaid").map((f) => f.flat.id)).toEqual(["102", "202"]);
    expect(oct.regularExpenses).toBe(20100); // 13,100 + 5,000 + 2,000 Dussehra
    // Book: 19,500 − 18,100 = 1,400, then −2,000 for Dussehra.
    expect(oct.closing - oct.opening).toBe(1400 - 2000);
    expect(oct.closing).toBe(-1751);
    expect(nov.opening).toBe(-1751);
    expect(nov.paidCount).toBe(6);
    expect(nov.closing).toBe(5249);
  });
});

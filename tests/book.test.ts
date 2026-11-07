import { describe, expect, it } from "vitest";
import { demoDB } from "@/lib/seed";
import { applyBookAction, bookTotals, checkBookPermission, emptyBook, figuresFromApp, hasExpensePart, normalizeBook, type BookDB } from "@/lib/book";

const NOW = new Date("2026-11-02T06:00:00Z");
const db = demoDB(NOW);

function withPage(month = "2026-10", pageNo?: string): BookDB {
  return applyBookAction(emptyBook(), db, { type: "sheet.create", month, pageNo }, "Admin", NOW);
}

describe("offline book pages", () => {
  it("makes a page with one row per flat and nothing in the expenses box", () => {
    const book = withPage("2026-10", "58");
    const s = book.sheets[0];
    expect(s.pageNo).toBe("58");
    expect(s.rows).toHaveLength(15);
    expect(s.rows[0]).toEqual({ flatId: "101", name: "K. Suresh" });
    expect(hasExpensePart(s)).toBe(false);
    expect(() => applyBookAction(book, db, { type: "sheet.create", month: "2026-10" }, "A", NOW)).toThrow(/already/);
  });

  it("works out the October book page: 19,500 − 18,100 = 1,400; −9,452 + 1,400 = −8,052", () => {
    let book = withPage();
    const id = book.sheets[0].id;
    book = applyBookAction(
      book,
      db,
      {
        type: "sheet.save",
        id,
        sheet: {
          collected: "19500",
          previousBalance: "-9452",
          expenses: [
            { label: "Salary", amount: 7000 },
            { label: "Electricity bill", amount: "5500", note: "bill ₹5,492" },
            { label: "GVMC + tank cleaning", amount: 600 },
            { label: "Lift maintenance", amount: 1500 },
            { label: "Lift accessories", amount: 3000 },
            { label: "Liquid + bleaching", amount: 500 },
          ],
          notes: "Not paid: 102, 202",
        },
      },
      "Admin",
      NOW,
    );
    const s = book.sheets[0];
    expect(hasExpensePart(s)).toBe(true);
    expect(bookTotals(s)).toMatchObject({ collected: 19500, spent: 18100, net: 1400, closing: -8052 });

    // The next month's page starts from this page's closing balance and the next page number.
    book = applyBookAction(book, db, { type: "sheet.save", id, sheet: { pageNo: "58" } }, "Admin", NOW);
    book = applyBookAction(book, db, { type: "sheet.create", month: "2026-11" }, "Admin", NOW);
    const nov = book.sheets.find((x) => x.month === "2026-11")!;
    expect(nov.previousBalance).toBe(-8052);
    expect(nov.pageNo).toBe("59");
  });

  it("keeps fields that weren't sent, and clears ones sent empty", () => {
    let book = withPage();
    const id = book.sheets[0].id;
    book = applyBookAction(book, db, { type: "sheet.save", id, sheet: { collected: 1500, notes: "x" } }, "A", NOW);
    book = applyBookAction(book, db, { type: "sheet.save", id, sheet: { notes: "" } }, "A", NOW);
    expect(book.sheets[0].collected).toBe(1500);
    expect(book.sheets[0].notes).toBeUndefined();
    book = applyBookAction(book, db, { type: "sheet.save", id, sheet: { collected: "" } }, "A", NOW);
    expect(book.sheets[0].collected).toBeNull();
  });

  it("rejects bad amounts and too many lines for the page", () => {
    const book = withPage();
    const id = book.sheets[0].id;
    expect(() => applyBookAction(book, db, { type: "sheet.save", id, sheet: { expenses: [{ label: "Salary", amount: "abc" }] } }, "A", NOW)).toThrow(/number/);
    expect(() => applyBookAction(book, db, { type: "sheet.save", id, sheet: { expenses: [{ label: "", amount: 5 }] } }, "A", NOW)).toThrow(/required/);
    const many = Array.from({ length: 19 }, (_, i) => ({ label: `Item ${i}`, amount: 1 }));
    expect(() => applyBookAction(book, db, { type: "sheet.save", id, sheet: { expenses: many } }, "A", NOW)).toThrow(/fit on the page/);
  });

  it("copies a month's figures from the app", () => {
    const f = figuresFromApp(db, "2026-10", NOW);
    expect(f.collected).toBe(19500);
    expect(f.expenses.reduce((a, e) => a + Number(e.amount), 0)).toBe(20100);
    expect(f.previousBalance).toBe(0);
    expect(f.notes).toBe("Not paid: 102, 202");
    expect(f.notPaid).toEqual(["102", "202"]);
  });

  it("marks flats as not paid, in page order, and records the third print", () => {
    let book = withPage();
    const id = book.sheets[0].id;
    expect(book.sheets[0].notPaid).toEqual([]);
    book = applyBookAction(book, db, { type: "sheet.save", id, sheet: { notPaid: ["202", "102", "102"] } }, "A", NOW);
    expect(book.sheets[0].notPaid).toEqual(["102", "202"]);
    expect(() => applyBookAction(book, db, { type: "sheet.save", id, sheet: { notPaid: ["999"] } }, "A", NOW)).toThrow(/not on this page/);
    // Saving other fields keeps the marks.
    book = applyBookAction(book, db, { type: "sheet.save", id, sheet: { collected: 19500 } }, "A", NOW);
    expect(book.sheets[0].notPaid).toEqual(["102", "202"]);
    book = applyBookAction(book, db, { type: "sheet.printed", id, part: "notPaid" }, "A", NOW);
    expect(book.sheets[0].printedNotPaid).toBe(NOW.toISOString());
  });

  it("syncs a page with the app: names, money, expenses, previous balance and not paid", () => {
    let book = withPage();
    const id = book.sheets[0].id;
    book = applyBookAction(book, db, { type: "sheet.save", id, sheet: { rows: [{ flatId: "101", name: "Old name" }], collected: 1 } }, "A", NOW);
    book = applyBookAction(book, db, { type: "sheet.sync", id }, "A", NOW);
    const s = book.sheets[0];
    expect(s.rows).toHaveLength(15);
    expect(s.rows[0].name).toBe("K. Suresh");
    expect(bookTotals(s)).toMatchObject({ collected: 19500, spent: 20100, closing: -600 });
    expect(s.previousBalance).toBe(0);
    expect(s.notPaid).toEqual(["102", "202"]);
    expect(s.notes).toBe("Not paid: 102, 202");
    expect(s.syncedAt).toBe(NOW.toISOString());
  });

  it("sync keeps a previous balance typed by hand (it used to reset it to the app's ₹0)", () => {
    let book = withPage();
    const id = book.sheets[0].id;
    book = applyBookAction(book, db, { type: "sheet.sync", id }, "A", NOW);
    expect(book.sheets[0].previousBalance).toBe(0); // empty → filled from the app
    book = applyBookAction(book, db, { type: "sheet.save", id, sheet: { previousBalance: "−10,052" } }, "A", NOW);
    expect(book.sheets[0].previousBalance).toBe(-10052);
    book = applyBookAction(book, db, { type: "sheet.sync", id }, "A", NOW);
    book = applyBookAction(book, db, { type: "sheet.sync", id }, "A", NOW);
    expect(book.sheets[0].previousBalance).toBe(-10052);
    expect(bookTotals(book.sheets[0]).closing).toBe(-10052 - 600);
    // Cleared by hand → the next sync fills it from the app again.
    book = applyBookAction(book, db, { type: "sheet.save", id, sheet: { previousBalance: "" } }, "A", NOW);
    book = applyBookAction(book, db, { type: "sheet.sync", id }, "A", NOW);
    expect(book.sheets[0].previousBalance).toBe(0);
  });

  it("sync keeps the balance carried from the last book page", () => {
    let book = withPage("2026-10");
    const oct = book.sheets[0].id;
    book = applyBookAction(book, db, { type: "sheet.save", id: oct, sheet: { collected: 19500, previousBalance: -9452, expenses: [{ label: "All", amount: 18100 }] } }, "A", NOW);
    book = applyBookAction(book, db, { type: "sheet.create", month: "2026-11" }, "A", NOW);
    const nov = book.sheets.find((s) => s.month === "2026-11")!.id;
    book = applyBookAction(book, db, { type: "sheet.sync", id: nov }, "A", NOW);
    expect(book.sheets.find((s) => s.id === nov)!.previousBalance).toBe(-8052);
  });

  it("accepts amounts as people type them", () => {
    let book = withPage();
    const id = book.sheets[0].id;
    book = applyBookAction(book, db, { type: "sheet.save", id, sheet: { collected: "₹ 19,500", expenses: [{ label: "Salary", amount: "7,000" }] } }, "A", NOW);
    expect(book.sheets[0].collected).toBe(19500);
    expect(book.sheets[0].expenses[0].amount).toBe(7000);
    expect(() => applyBookAction(book, db, { type: "sheet.save", id, sheet: { expenses: [{ label: "Salary", amount: "-5" }] } }, "A", NOW)).toThrow(/negative/);
  });

  it("marks flats paid or not paid, never both", () => {
    let book = withPage();
    const id = book.sheets[0].id;
    book = applyBookAction(book, db, { type: "sheet.save", id, sheet: { paid: ["103", "101", "102"], notPaid: ["102"] } }, "A", NOW);
    expect(book.sheets[0].paid).toEqual(["101", "103"]);
    expect(book.sheets[0].notPaid).toEqual(["102"]);
    book = applyBookAction(book, db, { type: "sheet.sync", id }, "A", NOW);
    expect(book.sheets[0].paid).toHaveLength(13);
    expect(book.sheets[0].notPaid).toEqual(["102", "202"]);
  });

  it("sync keeps a note you wrote yourself, but refreshes its own", () => {
    let book = withPage();
    const id = book.sheets[0].id;
    book = applyBookAction(book, db, { type: "sheet.sync", id }, "A", NOW);
    book = applyBookAction(book, db, { type: "sheet.save", id, sheet: { notes: "Please check with the treasurer" } }, "A", NOW);
    book = applyBookAction(book, db, { type: "sheet.sync", id }, "A", NOW);
    expect(book.sheets[0].notes).toBe("Please check with the treasurer");
    book = applyBookAction(book, db, { type: "sheet.save", id, sheet: { notes: "" } }, "A", NOW);
    book = applyBookAction(book, db, { type: "sheet.sync", id }, "A", NOW);
    expect(book.sheets[0].notes).toBe("Not paid: 102, 202");
  });

  it("sync adds up extra expenses into one line when the app has more than fit", () => {
    let many = db;
    for (let i = 0; i < 15; i++) many = { ...many, expenses: [...many.expenses, { id: `x${i}`, month: "2026-10", category: "Misc", label: `Extra ${i}`, amount: 10, createdAt: "" }] };
    let book = withPage();
    book = applyBookAction(book, many, { type: "sheet.sync", id: book.sheets[0].id }, "A", NOW);
    const s = book.sheets[0];
    expect(s.expenses).toHaveLength(18);
    expect(s.expenses[17].label).toMatch(/^Other expenses \(\d+ items\)$/);
    expect(bookTotals(s).spent).toBe(20100 + 150);
  });

  it("managers: current month only, and they can't delete", () => {
    const oct = withPage("2026-10");
    const id = oct.sheets[0].id;
    expect(checkBookPermission(oct, "manager", { type: "sheet.create", month: "2026-11" }, NOW)).toBeNull();
    expect(checkBookPermission(oct, "manager", { type: "sheet.create", month: "2026-10" }, NOW)).toMatch(/current month/);
    expect(checkBookPermission(oct, "manager", { type: "sheet.save", id, sheet: {} }, NOW)).toMatch(/current month/);
    expect(checkBookPermission(oct, "manager", { type: "sheet.printed", id, part: "names" }, NOW)).toBeNull();
    expect(checkBookPermission(oct, "manager", { type: "sheet.sync", id }, NOW)).toMatch(/current month/);
    expect(checkBookPermission(oct, "manager", { type: "sheet.delete", id }, NOW)).toMatch(/main admin/);
    expect(checkBookPermission(oct, "owner", { type: "sheet.delete", id }, NOW)).toBeNull();
  });

  it("reads an empty or old stored document safely", () => {
    expect(normalizeBook(null)).toEqual({ version: 0, sheets: [] });
    const old = normalizeBook({ sheets: [{ id: "a", month: "2026-10", rows: [] } as never] });
    expect(old.sheets[0].expenses).toEqual([]);
    expect(old.sheets[0].collected).toBeNull();
    expect(old.sheets[0].notPaid).toEqual([]);
    expect(old.sheets[0].paid).toEqual([]);
  });
});

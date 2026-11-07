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

  it("managers: current month only, and they can't delete", () => {
    const oct = withPage("2026-10");
    const id = oct.sheets[0].id;
    expect(checkBookPermission(oct, "manager", { type: "sheet.create", month: "2026-11" }, NOW)).toBeNull();
    expect(checkBookPermission(oct, "manager", { type: "sheet.create", month: "2026-10" }, NOW)).toMatch(/current month/);
    expect(checkBookPermission(oct, "manager", { type: "sheet.save", id, sheet: {} }, NOW)).toMatch(/current month/);
    expect(checkBookPermission(oct, "manager", { type: "sheet.printed", id, part: "names" }, NOW)).toBeNull();
    expect(checkBookPermission(oct, "manager", { type: "sheet.delete", id }, NOW)).toMatch(/main admin/);
    expect(checkBookPermission(oct, "owner", { type: "sheet.delete", id }, NOW)).toBeNull();
  });

  it("reads an empty or old stored document safely", () => {
    expect(normalizeBook(null)).toEqual({ version: 0, sheets: [] });
    const old = normalizeBook({ sheets: [{ id: "a", month: "2026-10", rows: [] } as never] });
    expect(old.sheets[0].expenses).toEqual([]);
    expect(old.sheets[0].collected).toBeNull();
    expect(old.sheets[0].notPaid).toEqual([]);
  });
});

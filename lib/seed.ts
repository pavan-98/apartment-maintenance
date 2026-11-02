import type { DB, ExpenseTemplate, Flat, Settings } from "./types";
import { currentMonth } from "./dates";

export const APARTMENT_NAME = "Srinivasa Sai Vigneswara Puppala Towers";

const FLAT_IDS = ["101", "102", "103", "201", "202", "203", "301", "302", "303", "401", "402", "403", "501", "502", "503"];

/** Owners as written in the maintenance book (September 2026 page). */
export const BOOK_FLATS: Flat[] = [
  { id: "101", floor: 1, owner: "N. Raju" },
  { id: "102", floor: 1, owner: "Ramalakshmi" },
  { id: "103", floor: 1, owner: "Udayasri Garu" },
  { id: "201", floor: 2, owner: "M.S. Naidu", resident: "Rambabu" },
  { id: "202", floor: 2, owner: "Bhanu Reddy" },
  { id: "203", floor: 2, owner: "Manjula" },
  { id: "301", floor: 3, owner: "Manjula", resident: "Ch. Ravi" },
  { id: "302", floor: 3, owner: "Manjula" },
  { id: "303", floor: 3, owner: "Manjula" },
  { id: "401", floor: 4, owner: "Manjula", resident: "P. Sri Lakshmi" },
  { id: "402", floor: 4, owner: "Manjula", resident: "Santosh" },
  { id: "403", floor: 4, owner: "Manjula", resident: "K. Jagadeswara Rao" },
  { id: "501", floor: 5, owner: "Pavan Kalyan" },
  { id: "502", floor: 5, owner: "P. Mani" },
  { id: "503", floor: 5, owner: "G. Babu Rao" },
];

export const DEFAULT_TEMPLATES: ExpenseTemplate[] = [
  { id: "t-salary", category: "Salary", label: "Watchman / cleaner salary", amount: 7000 },
  { id: "t-power", category: "Electricity", label: "Common area electricity bill", amount: 6565 },
  { id: "t-gvmc", category: "GVMC & water tank", label: "GVMC + tank cleaning", amount: 600 },
  { id: "t-lift", category: "Lift maintenance", label: "Lift maintenance", amount: 1500 },
  { id: "t-clean", category: "Cleaning material", label: "Material for cleaning", amount: 500 },
];

export function baseSettings(now: Date = new Date()): Settings {
  return {
    apartmentName: APARTMENT_NAME,
    maintenanceAmount: 1500,
    maintenanceOverrides: {},
    startMonth: currentMonth(now),
    openingBalance: 0,
    carryForward: true,
    dueDay: 10,
    expenseTemplates: DEFAULT_TEMPLATES.map((t) => ({ ...t })),
    isDemo: false,
  };
}

/** Empty books (flat owners kept) starting from the current month. */
export function freshDB(flats: Flat[] = BOOK_FLATS, now: Date = new Date()): DB {
  return {
    version: 1,
    settings: baseSettings(now),
    flats: flats.map((f) => ({ ...f })),
    payments: [],
    expenses: [],
    collections: [],
    rules: [],
    audit: [],
  };
}

const T = "2026-09-01T09:00:00.000Z";

/** September 2026 from the maintenance book, as sample data. */
export function demoDB(now: Date = new Date()): DB {
  const db = freshDB(BOOK_FLATS, now);
  const month = "2026-09";
  db.settings = { ...db.settings, isDemo: true, demoMonth: month, startMonth: month };

  const maintenanceUnpaid = new Set(["102", "202"]);
  let day = 3;
  db.payments = FLAT_IDS.filter((id) => !maintenanceUnpaid.has(id)).map((flatId, i) => ({
    id: `demo-p-${flatId}`,
    flatId,
    month,
    amount: 1500,
    date: `2026-09-${String(Math.min(28, day + i)).padStart(2, "0")}`,
    mode: i % 3 === 0 ? "upi" : "cash",
    createdAt: T,
  }));

  db.expenses = DEFAULT_TEMPLATES.map((t, i) => ({
    id: `demo-e-${t.id}`,
    month,
    category: t.category,
    label: t.label,
    amount: t.amount,
    date: `2026-09-${String(25 + (i % 4)).padStart(2, "0")}`,
    createdAt: T,
  }));

  const pestUnpaid = new Set(["102", "201", "202"]);
  db.collections = [
    {
      id: "demo-c-pest",
      month,
      title: "Pest control",
      description: "Whole-building pest control treatment",
      perFlatAmount: 1400,
      exemptFlats: [],
      createdAt: T,
      costs: [
        { id: "demo-cc-1", label: "Material (4,500 × 3)", amount: 13500 },
        { id: "demo-cc-2", label: "Cement", amount: 300 },
        { id: "demo-cc-3", label: "Liquid material", amount: 486 },
        { id: "demo-cc-4", label: "Labour charges", amount: 7000 },
      ],
      payments: FLAT_IDS.filter((id) => !pestUnpaid.has(id)).map((flatId, i) => ({
        id: `demo-cp-${flatId}`,
        flatId,
        amount: 1400,
        date: `2026-09-${String(12 + (i % 10)).padStart(2, "0")}`,
        mode: "cash" as const,
      })),
    },
  ];

  db.rules = [
    {
      id: "demo-r-1",
      title: "Maintenance due by the 10th",
      body: "Monthly maintenance of ₹1,500 should be paid by the 10th of every month.",
      important: true,
      createdAt: T,
      updatedAt: T,
    },
    {
      id: "demo-r-2",
      title: "Keep common areas clear",
      body: "Do not leave shoes, bicycles or garbage bags in corridors and staircases.",
      createdAt: T,
      updatedAt: T,
    },
    {
      id: "demo-r-3",
      title: "Lift usage",
      body: "Children below 10 should use the lift only with an adult. Do not use the lift for heavy construction material.",
      createdAt: T,
      updatedAt: T,
    },
  ];

  db.audit = [
    { id: "demo-a-1", at: T, by: "System", action: "Sample data", detail: "Loaded September 2026 from the maintenance book" },
  ];
  return db;
}

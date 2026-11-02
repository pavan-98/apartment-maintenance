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
    notices: [],
    audit: [],
  };
}

/** Fill in fields added in later versions so older saved data keeps working. */
export function normalizeDB(db: DB): DB {
  return {
    ...db,
    notices: db.notices ?? [],
    rules: db.rules ?? [],
    collections: db.collections ?? [],
    audit: db.audit ?? [],
  };
}

const T = "2026-09-01T09:00:00.000Z";

const day = (m: string, d: number) => `${m}-${String(d).padStart(2, "0")}`;

/**
 * Made-up October and November 2026, so History has something to show:
 * - October: 202 still unpaid (2 months due), 401 paid only ₹1,000,
 *   a motor repair, and staircase painting collected separately.
 * - November (in progress): 6 flats paid so far, two early expenses.
 */
function addSampleOctoberNovember(db: DB) {
  const oct = "2026-10";
  const octPartial: Record<string, number> = { "401": 1000 };
  const octPaid = FLAT_IDS.filter((id) => id !== "202");
  for (const [i, flatId] of octPaid.entries()) {
    db.payments.push({
      id: `demo-p-oct-${flatId}`,
      flatId,
      month: oct,
      amount: octPartial[flatId] ?? 1500,
      date: day(oct, Math.min(28, 2 + i)),
      mode: i % 2 === 0 ? "upi" : "cash",
      createdAt: T,
    });
  }
  const octAmounts: Record<string, number> = { "t-power": 6210 };
  for (const [i, t] of DEFAULT_TEMPLATES.entries()) {
    db.expenses.push({
      id: `demo-e-oct-${t.id}`,
      month: oct,
      category: t.category,
      label: t.label,
      amount: octAmounts[t.id] ?? t.amount,
      date: day(oct, 24 + (i % 5)),
      createdAt: T,
    });
  }
  db.expenses.push({
    id: "demo-e-oct-motor",
    month: oct,
    category: "Repairs",
    label: "Water motor repair",
    amount: 2400,
    date: day(oct, 14),
    note: "Motor coil rewinding",
    createdAt: T,
  });
  const paintUnpaid = new Set(["102", "202", "503", "301"]);
  db.collections.push({
    id: "demo-c-paint",
    month: oct,
    title: "Staircase painting",
    description: "Painting of staircase walls and railings",
    perFlatAmount: 600,
    exemptFlats: [],
    createdAt: T,
    costs: [
      { id: "demo-cc-p1", label: "Paint and primer", amount: 4700 },
      { id: "demo-cc-p2", label: "Painter labour (2 days)", amount: 3500 },
    ],
    payments: FLAT_IDS.filter((id) => !paintUnpaid.has(id)).map((flatId, i) => ({
      id: `demo-cp-paint-${flatId}`,
      flatId,
      amount: 600,
      date: day(oct, 16 + (i % 8)),
      mode: "cash" as const,
    })),
  });

  const nov = "2026-11";
  for (const [i, flatId] of ["101", "103", "203", "302", "303", "502"].entries()) {
    db.payments.push({
      id: `demo-p-nov-${flatId}`,
      flatId,
      month: nov,
      amount: 1500,
      date: day(nov, 1 + (i % 2)),
      mode: i % 2 === 0 ? "upi" : "cash",
      createdAt: T,
    });
  }
  db.expenses.push(
    { id: "demo-e-nov-lift", month: nov, category: "Lift maintenance", label: "Lift maintenance", amount: 1500, date: day(nov, 1), createdAt: T },
    { id: "demo-e-nov-clean", month: nov, category: "Cleaning material", label: "Material for cleaning", amount: 500, date: day(nov, 2), createdAt: T },
  );
}

/** September 2026 from the maintenance book, plus made-up October and November, as sample data. */
export function demoDB(now: Date = new Date()): DB {
  const db = freshDB(BOOK_FLATS, now);
  const month = "2026-09";
  db.settings = { ...db.settings, isDemo: true, startMonth: month };

  const maintenanceUnpaid = new Set(["102", "202"]);
  const startDay = 3;
  db.payments = FLAT_IDS.filter((id) => !maintenanceUnpaid.has(id)).map((flatId, i) => ({
    id: `demo-p-${flatId}`,
    flatId,
    month,
    amount: 1500,
    date: `2026-09-${String(Math.min(28, startDay + i)).padStart(2, "0")}`,
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

  addSampleOctoberNovember(db);

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

  db.notices = [
    {
      id: "demo-n-1",
      titleEn: "Water tank cleaning on Sunday",
      titleTe: "ఆదివారం వాటర్ ట్యాంక్ శుభ్రత",
      bodyEn: "The overhead water tank will be cleaned this Sunday from 9 AM to 1 PM. There will be no water supply during this time. Please store water in advance.",
      bodyTe: "ఈ ఆదివారం ఉదయం 9 నుండి మధ్యాహ్నం 1 గంట వరకు పైన ఉన్న వాటర్ ట్యాంక్ శుభ్రం చేయబడుతుంది. ఈ సమయంలో నీటి సరఫరా ఉండదు. దయచేసి ముందుగానే నీరు నిల్వ చేసుకోండి.",
      important: true,
      popup: true,
      createdAt: T,
      updatedAt: T,
    },
  ];

  db.audit = [
    { id: "demo-a-1", at: T, by: "System", action: "Sample data", detail: "Loaded September 2026 from the maintenance book, plus sample October and November" },
  ];
  return db;
}

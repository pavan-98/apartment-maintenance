import type { DB, ExpenseTemplate, Flat, Settings } from "./types";
import { currentMonth, formatDate, todayISO } from "./dates";

export const APARTMENT_NAME = "Srinivasa Sai Vigneswara Puppala Towers";

const FLAT_IDS = ["101", "102", "103", "201", "202", "203", "301", "302", "303", "401", "402", "403", "501", "502", "503"];

/** Owners as written in the maintenance book (September and October 2026 pages). */
export const BOOK_FLATS: Flat[] = [
  { id: "101", floor: 1, owner: "N. Raju" },
  { id: "102", floor: 1, owner: "Ramabai" },
  { id: "103", floor: 1, owner: "Udaya Shree" },
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
  { id: "502", floor: 5, owner: "Manjula", resident: "P. Mani" },
  { id: "503", floor: 5, owner: "Manjula", resident: "G. Babu Rao" },
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
    users: [],
    audit: [],
  };
}

/** Fill in fields added in later versions so older saved data keeps working. */
export function normalizeDB(db: DB): DB {
  return {
    ...db,
    notices: (db.notices ?? []).map((n) => ({
      ...n,
      popupMode: n.popupMode ?? (n.popup ? "once" : "none"),
    })),
    rules: (db.rules ?? []).map((r) => ({
      ...r,
      titleEn: r.titleEn ?? r.title ?? "",
      titleTe: r.titleTe ?? "",
      bodyEn: r.bodyEn ?? r.body ?? "",
      bodyTe: r.bodyTe ?? "",
      category: r.category ?? "general",
    })),
    users: db.users ?? [],
    collections: db.collections ?? [],
    audit: db.audit ?? [],
  };
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const T = "2026-09-01T09:00:00.000Z";

const day = (m: string, d: number) => `${m}-${String(d).padStart(2, "0")}`;

/**
 * October 2026 from the maintenance book (page 58):
 * 102 and 202 did not pay; expenses ₹20,100 including ₹2,000 given to
 * Joga Rao for Dussehra (marked "please check with Joga Rao").
 */
function addOctoberFromBook(db: DB) {
  const oct = "2026-10";
  const unpaid = new Set(["102", "202"]);
  for (const [i, flatId] of FLAT_IDS.filter((id) => !unpaid.has(id)).entries()) {
    db.payments.push({
      id: `demo-p-oct-${flatId}`,
      flatId,
      month: oct,
      amount: 1500,
      date: day(oct, Math.min(28, 3 + i)),
      mode: i % 2 === 0 ? "upi" : "cash",
      createdAt: T,
    });
  }
  const e = (id: string, category: string, label: string, amount: number, d: number, note?: string) =>
    db.expenses.push({ id: `demo-e-oct-${id}`, month: oct, category, label, amount, date: day(oct, d), note, createdAt: T });
  e("salary", "Salary", "Watchman / cleaner salary", 7000, 30);
  e("power", "Electricity", "Common area electricity bill", 5500, 20, "Bill ₹5,492, rounded to ₹5,500 in the book");
  e("gvmc", "GVMC & water tank", "GVMC (₹300) + tank cleaning (₹300)", 600, 18);
  e("lift", "Lift maintenance", "Lift maintenance", 1500, 15);
  e("liftacc", "Lift maintenance", "Lift accessories", 3000, 15);
  e("clean", "Cleaning material", "Liquid, bleaching powder etc.", 500, 22);
  e("dussehra", "Festival", "Dussehra – given to Joga Rao", 2000, 1, "Please check with Joga Rao");
}

/** Made-up November 2026 (in progress), so the current month has something to show. */
function addSampleNovember(db: DB) {
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

/** September and October 2026 from the maintenance book, plus a made-up November in progress, as sample data. */
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

  addOctoberFromBook(db);
  addSampleNovember(db);

  db.rules = [
    {
      id: "demo-r-1",
      category: "payments",
      titleEn: "Maintenance due by the 10th",
      titleTe: "ప్రతి నెల 10వ తేదీలోపు మెయింటెనెన్స్",
      bodyEn: "Monthly maintenance of ₹1,500 should be paid by the 10th of every month.",
      bodyTe: "నెలవారీ మెయింటెనెన్స్ ₹1,500 ప్రతి నెల 10వ తేదీలోపు చెల్లించాలి.",
      important: true,
      createdAt: T,
      updatedAt: T,
    },
    {
      id: "demo-r-2",
      category: "cleanliness",
      titleEn: "Keep common areas clear",
      titleTe: "కామన్ ఏరియాలను ఖాళీగా ఉంచండి",
      bodyEn: "Do not leave shoes, bicycles or garbage bags in corridors and staircases.",
      bodyTe: "కారిడార్లు, మెట్లపై చెప్పులు, సైకిళ్ళు లేదా చెత్త సంచులు ఉంచకూడదు.",
      createdAt: T,
      updatedAt: T,
    },
    {
      id: "demo-r-3",
      category: "lift",
      titleEn: "Lift usage",
      titleTe: "లిఫ్ట్ వాడకం",
      bodyEn: "Children below 10 should use the lift only with an adult. Do not use the lift for heavy construction material.",
      bodyTe: "10 ఏళ్ల లోపు పిల్లలు పెద్దవారితో మాత్రమే లిఫ్ట్ వాడాలి. నిర్మాణ సామగ్రి వంటి బరువైన వస్తువులకు లిఫ్ట్ వాడకూడదు.",
      createdAt: T,
      updatedAt: T,
    },
    {
      id: "demo-r-4",
      category: "parking",
      titleEn: "Parking",
      titleTe: "పార్కింగ్",
      bodyEn: "Park only in your allotted slot. Visitors' vehicles must not block the gate.",
      bodyTe: "మీకు కేటాయించిన స్థలంలో మాత్రమే వాహనం పార్క్ చేయండి. సందర్శకుల వాహనాలు గేటుకు అడ్డుగా ఉంచకూడదు.",
      announce: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: "demo-r-5",
      category: "water",
      titleEn: "Report water leaks",
      titleTe: "నీటి లీకేజీలు తెలియజేయండి",
      bodyEn: "Report leaking taps or an overflowing tank to the watchman immediately.",
      bodyTe: "కారుతున్న కుళాయిలు లేదా ట్యాంక్ పొంగిపొర్లడం గమనిస్తే వెంటనే వాచ్‌మన్‌కు తెలియజేయండి.",
      createdAt: T,
      updatedAt: T,
    },
  ];

  const today = todayISO(now);
  const nowIso = now.toISOString();
  db.notices = [
    {
      id: "demo-n-lift",
      titleEn: "Lift servicing — lift will be off",
      titleTe: "లిఫ్ట్ సర్వీసింగ్ — లిఫ్ట్ పనిచేయదు",
      bodyEn: `The lift will be switched off for servicing on ${formatDate(addDaysISO(today, 5))} from 10 AM to 2 PM. Please use the stairs during this time.`,
      bodyTe: `${formatDate(addDaysISO(today, 5), "te")} న ఉదయం 10 నుండి మధ్యాహ్నం 2 వరకు సర్వీసింగ్ కోసం లిఫ్ట్ ఆపివేయబడుతుంది. దయచేసి ఆ సమయంలో మెట్లు వాడండి.`,
      important: true,
      popupMode: "every",
      expiresOn: addDaysISO(today, 5),
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "demo-n-1",
      titleEn: "Water tank cleaning on Sunday",
      titleTe: "ఆదివారం వాటర్ ట్యాంక్ శుభ్రత",
      bodyEn: "The overhead water tank will be cleaned this Sunday from 9 AM to 1 PM. There will be no water supply during this time. Please store water in advance.",
      bodyTe: "ఈ ఆదివారం ఉదయం 9 నుండి మధ్యాహ్నం 1 గంట వరకు పైన ఉన్న వాటర్ ట్యాంక్ శుభ్రం చేయబడుతుంది. ఈ సమయంలో నీటి సరఫరా ఉండదు. దయచేసి ముందుగానే నీరు నిల్వ చేసుకోండి.",
      popupMode: "once",
      expiresOn: addDaysISO(today, 10),
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "demo-n-contacts",
      titleEn: "Emergency help",
      titleTe: "అత్యవసర సహాయం",
      bodyEn: "Watchman is available at the gate 24×7.\nIf stuck in the lift, press the alarm button and stay calm.\nFor water or power problems, inform the watchman first.",
      bodyTe: "వాచ్‌మన్ గేటు వద్ద 24 గంటలూ అందుబాటులో ఉంటారు.\nలిఫ్ట్‌లో ఇరుక్కుపోతే అలారం బటన్ నొక్కి ప్రశాంతంగా ఉండండి.\nనీరు లేదా కరెంటు సమస్యలకు ముందుగా వాచ్‌మన్‌కు తెలియజేయండి.",
      popupMode: "none",
      createdAt: T,
      updatedAt: T,
    },
  ];

  db.audit = [
    { id: "demo-a-1", at: T, by: "System", action: "Sample data", detail: "Loaded September and October 2026 from the maintenance book, plus a sample November" },
  ];
  return db;
}

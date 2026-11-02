import type { MonthKey } from "./types";

const TZ = "Asia/Kolkata";

/** Today's date in India as YYYY-MM-DD. */
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function currentMonth(now: Date = new Date()): MonthKey {
  return todayISO(now).slice(0, 7);
}

export function dayOfMonth(now: Date = new Date()): number {
  return Number(todayISO(now).slice(8, 10));
}

export function isMonthKey(s: unknown): s is MonthKey {
  return typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function addMonths(m: MonthKey, n: number): MonthKey {
  const [y, mo] = m.split("-").map(Number);
  const idx = y * 12 + (mo - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export function compareMonths(a: MonthKey, b: MonthKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Inclusive list of months from a to b. */
export function monthRange(a: MonthKey, b: MonthKey): MonthKey[] {
  const out: MonthKey[] = [];
  if (compareMonths(a, b) > 0) return out;
  let m = a;
  while (compareMonths(m, b) <= 0 && out.length < 600) {
    out.push(m);
    m = addMonths(m, 1);
  }
  return out;
}

const EN_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const TE_MONTHS = [
  "జనవరి", "ఫిబ్రవరి", "మార్చి", "ఏప్రిల్", "మే", "జూన్",
  "జూలై", "ఆగస్టు", "సెప్టెంబర్", "అక్టోబర్", "నవంబర్", "డిసెంబర్",
];

export function monthLabel(m: MonthKey, lang: "en" | "te" = "en", short = false): string {
  const [y, mo] = m.split("-").map(Number);
  const name = (lang === "te" ? TE_MONTHS : EN_MONTHS)[mo - 1];
  return `${short && lang === "en" ? name.slice(0, 3) : name} ${y}`;
}

export function formatDate(iso: string | undefined, lang: "en" | "te" = "en"): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  const months = lang === "te" ? TE_MONTHS : EN_MONTHS;
  return `${d} ${lang === "en" ? months[m - 1].slice(0, 3) : months[m - 1]} ${y}`;
}

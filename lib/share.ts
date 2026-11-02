import type { DB, Flat } from "./types";
import type { DuesReport, MonthSummary } from "./calc";
import { inr } from "./calc";
import { monthLabel } from "./dates";
import { categoryLabel, type Lang } from "./i18n";

export function flatName(f: Flat): string {
  return f.resident ? `${f.owner} / ${f.resident}` : f.owner;
}

export function whatsappLink(text: string, phone?: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  const to = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

export function monthSummaryText(db: DB, s: MonthSummary, lang: Lang, url: string): string {
  const m = monthLabel(s.month, lang);
  const unpaid = s.flats.filter((f) => f.status !== "paid");
  const lines: string[] = [];
  if (lang === "te") {
    lines.push(`*${db.settings.apartmentName}*`, `*${m} మెయింటెనెన్స్ వివరాలు*`, "");
    lines.push(`✅ చెల్లించినవారు: ${s.paidCount}/${s.flats.length} ఫ్లాట్లు`);
    lines.push(`💰 వసూలు: ${inr(s.income)}`);
    lines.push(`🧾 ఖర్చు: ${inr(s.spent)}`);
    for (const c of s.byCategory) lines.push(`   • ${categoryLabel(c.category, lang)}: ${inr(c.amount)}`);
    lines.push(`${s.closing < 0 ? "🔻 కొరత" : "🟢 నిల్వ"}: ${inr(s.closing)}`);
    if (unpaid.length) lines.push("", `🔴 చెల్లించాల్సినవారు: ${unpaid.map((u) => `${u.flat.id} (${inr(u.pending)})`).join(", ")}`);
    lines.push("", `పూర్తి వివరాలు: ${url}`);
  } else {
    lines.push(`*${db.settings.apartmentName}*`, `*Maintenance summary – ${m}*`, "");
    lines.push(`✅ Paid: ${s.paidCount} of ${s.flats.length} flats`);
    lines.push(`💰 Collected: ${inr(s.income)}`);
    lines.push(`🧾 Spent: ${inr(s.spent)}`);
    for (const c of s.byCategory) lines.push(`   • ${c.category}: ${inr(c.amount)}`);
    lines.push(`${s.closing < 0 ? "🔻 Shortage" : "🟢 Balance"}: ${inr(s.closing)}`);
    if (unpaid.length) lines.push("", `🔴 Yet to pay: ${unpaid.map((u) => `${u.flat.id} (${inr(u.pending)})`).join(", ")}`);
    lines.push("", `Full details: ${url}`);
  }
  return lines.join("\n");
}

export function groupReminderText(db: DB, dues: DuesReport, lang: Lang, url: string): string {
  const list = dues.overdue.map(
    (d) => `• ${d.flat.id} – ${flatName(d.flat)}: ${inr(d.total)} (${d.months.map((m) => monthLabel(m.month, lang, true)).join(", ")})`,
  );
  if (lang === "te") {
    return [
      `*${db.settings.apartmentName}*`,
      "🔔 మెయింటెనెన్స్ బాకీ గుర్తింపు",
      "",
      ...list,
      "",
      `మొత్తం బాకీ: ${inr(dues.overdueTotal)}`,
      "దయచేసి త్వరగా చెల్లించండి. ధన్యవాదాలు 🙏",
      url,
    ].join("\n");
  }
  return [
    `*${db.settings.apartmentName}*`,
    "🔔 Maintenance reminder",
    "",
    ...list,
    "",
    `Total pending: ${inr(dues.overdueTotal)}`,
    "Kindly pay at the earliest. Thank you 🙏",
    url,
  ].join("\n");
}

export function flatReminderText(db: DB, flat: Flat, months: { month: string; pending: number }[], lang: Lang): string {
  const total = months.reduce((s, m) => s + m.pending, 0);
  const ms = months.map((m) => monthLabel(m.month, lang)).join(", ");
  if (lang === "te") {
    return `నమస్తే ${flat.owner} గారు, ${db.settings.apartmentName} ఫ్లాట్ ${flat.id} కి ${ms} మెయింటెనెన్స్ ${inr(total)} బాకీ ఉంది. దయచేసి చెల్లించండి. ధన్యవాదాలు 🙏`;
  }
  return `Namaste ${flat.owner} garu, maintenance of ${inr(total)} for flat ${flat.id} (${ms}) at ${db.settings.apartmentName} is pending. Kindly pay at the earliest. Thank you 🙏`;
}

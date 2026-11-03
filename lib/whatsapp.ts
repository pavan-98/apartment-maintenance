import type { DB, Flat, Notice } from "./types";
import type { DuesReport, FlatDue } from "./calc";
import { inr } from "./calc";
import { monthLabel, todayISO } from "./dates";
import { normalizePhone } from "./phone";

export type Audience = "owners" | "residents" | "both";
export type MsgLang = "en" | "te" | "both";

/** One WhatsApp contact; a person who owns several flats gets one message. */
export interface Recipient {
  phone: string;
  name: string;
  flats: string[];
  role: "owner" | "resident" | "owner+resident";
}

export interface OutMessage {
  recipient: Recipient;
  text: string;
}

/** Notices that are currently showing (not past their end date), newest first. */
export function activeNotices(db: DB, today: string = todayISO()): Notice[] {
  return db.notices.filter((n) => !n.expiresOn || n.expiresOn >= today);
}

export function noticeShareText(db: DB, n: Notice, url: string, lang: MsgLang = "both"): string {
  const lines = [`*${db.settings.apartmentName}*`, `📢 *${lang === "te" ? "నోటీసు" : lang === "en" ? "NOTICE" : "NOTICE / నోటీసు"}*${n.important ? " ❗" : ""}`, ""];
  if (lang !== "te" && (n.titleEn || n.bodyEn)) {
    if (n.titleEn) lines.push(`*${n.titleEn}*`);
    if (n.bodyEn) lines.push(n.bodyEn);
    lines.push("");
  }
  if (lang !== "en" && (n.titleTe || n.bodyTe)) {
    if (n.titleTe) lines.push(`*${n.titleTe}*`);
    if (n.bodyTe) lines.push(n.bodyTe);
    lines.push("");
  }
  if (url) lines.push(url);
  return lines.join("\n").trim();
}

/** Everyone with a phone number, grouped by number. */
export function recipients(db: DB, audience: Audience, onlyFlats?: Set<string>): Recipient[] {
  const map = new Map<string, Recipient>();
  const add = (raw: string | undefined, name: string, flat: Flat, role: "owner" | "resident") => {
    const phone = normalizePhone(raw);
    if (!phone) return;
    const r = map.get(phone);
    if (!r) {
      map.set(phone, { phone, name, flats: [flat.id], role });
      return;
    }
    if (!r.flats.includes(flat.id)) r.flats.push(flat.id);
    if (r.role !== role) r.role = "owner+resident";
  };
  for (const f of db.flats) {
    if (onlyFlats && !onlyFlats.has(f.id)) continue;
    if (audience !== "residents") add(f.phone, f.owner, f, "owner");
    if (audience !== "owners") {
      // A flat with no separate resident is lived in by the owner.
      if (f.resident) add(f.residentPhone, f.resident, f, "resident");
      else if (audience === "residents") add(f.phone, f.owner, f, "owner");
    }
  }
  return [...map.values()].sort((a, b) => a.flats[0].localeCompare(b.flats[0]));
}

/** Flats that have no number for the chosen audience. */
export function flatsMissingPhone(db: DB, audience: Audience): Flat[] {
  return db.flats.filter((f) => {
    const owner = !!normalizePhone(f.phone);
    const res = f.resident ? !!normalizePhone(f.residentPhone) : owner;
    if (audience === "owners") return !owner;
    if (audience === "residents") return !res;
    return !owner && !res;
  });
}

function reminderText(db: DB, r: Recipient, dues: FlatDue[], lang: MsgLang, url: string): string {
  const total = dues.reduce((s, d) => s + d.total, 0);
  const en = [
    `Namaste ${r.name} garu 🙏`,
    `This is a reminder from ${db.settings.apartmentName}. Maintenance pending:`,
    ...dues.map((d) => `• Flat ${d.flat.id}: ${inr(d.total)} (${d.months.map((m) => monthLabel(m.month, "en")).join(", ")})`),
    dues.length > 1 ? `Total: ${inr(total)}` : "",
    "Kindly pay at the earliest. Thank you.",
  ].filter(Boolean);
  const te = [
    `నమస్తే ${r.name} గారు 🙏`,
    `${db.settings.apartmentName} నుండి గుర్తింపు. మెయింటెనెన్స్ బాకీ:`,
    ...dues.map((d) => `• ఫ్లాట్ ${d.flat.id}: ${inr(d.total)} (${d.months.map((m) => monthLabel(m.month, "te")).join(", ")})`),
    dues.length > 1 ? `మొత్తం: ${inr(total)}` : "",
    "దయచేసి త్వరగా చెల్లించండి. ధన్యవాదాలు.",
  ].filter(Boolean);
  const parts = lang === "en" ? [en] : lang === "te" ? [te] : [en, te];
  return [...parts.map((p) => p.join("\n")), url].filter(Boolean).join("\n\n");
}

/** Personal reminders to everyone who owes maintenance (one per phone number). */
export function reminderMessages(
  db: DB,
  dues: DuesReport,
  opts: { includeUpcoming: boolean; audience: Audience; lang: MsgLang; url: string },
): OutMessage[] {
  const byFlat = new Map<string, FlatDue>();
  const merge = (list: FlatDue[]) => {
    for (const d of list) {
      const cur = byFlat.get(d.flat.id);
      if (!cur) byFlat.set(d.flat.id, { ...d, months: [...d.months] });
      else {
        cur.months.push(...d.months);
        cur.total += d.total;
      }
    }
  };
  merge(dues.overdue);
  if (opts.includeUpcoming) merge(dues.upcoming);
  const rs = recipients(db, opts.audience, new Set(byFlat.keys()));
  return rs.map((r) => {
    const flatDues = r.flats.map((id) => byFlat.get(id)!).filter(Boolean);
    return { recipient: r, text: reminderText(db, r, flatDues, opts.lang, opts.url) };
  });
}

export function noticeMessages(db: DB, n: Notice, opts: { audience: Audience; lang: MsgLang; url: string }): OutMessage[] {
  const text = noticeShareText(db, n, opts.url, opts.lang);
  return recipients(db, opts.audience).map((recipient) => ({ recipient, text }));
}

/** Custom message. {name} and {flat} are replaced for each person. */
export function customMessages(db: DB, template: string, audience: Audience): OutMessage[] {
  return recipients(db, audience).map((recipient) => ({
    recipient,
    text: template.replaceAll("{name}", recipient.name).replaceAll("{flat}", recipient.flats.join(", ")),
  }));
}

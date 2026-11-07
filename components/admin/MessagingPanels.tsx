"use client";

import { useEffect, useMemo, useState } from "react";
import type { DB, Notice, PopupMode } from "@/lib/types";
import { duesReport } from "@/lib/calc";
import { formatDate, todayISO } from "@/lib/dates";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { whatsappLink } from "@/lib/share";
import { noticeTitle } from "@/lib/actions";
import {
  customMessages,
  flatsMissingPhone,
  noticeMessages,
  noticeShareText,
  reminderMessages,
  type Audience,
  type MsgLang,
  type OutMessage,
} from "@/lib/whatsapp";
import { Sheet } from "../Sheet";
import { Field, Group, SectionTitle, useAdmin } from "./ui";
import { Dropdown, Segmented } from "../Pickers";

function origin() {
  return typeof window === "undefined" ? "" : window.location.origin;
}

/* ===================== Notices ===================== */

const POPUP_LABEL: Record<PopupMode, string> = {
  every: "🔁 Pops up every time",
  once: "1️⃣ Pops up once",
  none: "📌 Notices tab only",
};

export function NoticesPanel({ db, onSendToAll }: { db: DB; onSendToAll: (noticeId: string) => void }) {
  const [editing, setEditing] = useState<Notice | "new" | null>(null);
  const [showExpired, setShowExpired] = useState(false);
  const today = todayISO();
  const current = db.notices.filter((n) => !n.expiresOn || n.expiresOn >= today);
  const expired = db.notices.filter((n) => n.expiresOn && n.expiresOn < today);

  const card = (n: Notice, isExpired: boolean) => {
    const link = `${origin()}/notice?id=${n.id}`;
    return (
      <article key={n.id} className={`card p-4 ${n.important ? "border-l-4 border-l-crit" : ""} ${isExpired ? "opacity-70" : ""}`}>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex-1 text-base font-bold">{noticeTitle(n)}</h3>
          {n.important && <span className="rounded-full bg-crit-bg px-2 py-0.5 text-xs font-bold text-crit-ink">Important</span>}
        </div>
        {n.titleTe && n.titleEn && <p className="text-sm font-semibold text-ink-2">{n.titleTe}</p>}
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold">
          {isExpired ? (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted">Expired {formatDate(n.expiresOn)} · hidden from residents</span>
          ) : (
            <>
              <span className={`rounded-full px-2 py-0.5 ${n.popupMode === "none" ? "bg-surface-2 text-ink-2" : "bg-brand-soft text-brand"}`}>{POPUP_LABEL[n.popupMode]}</span>
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-ink-2">{n.expiresOn ? `📅 Until ${formatDate(n.expiresOn)}` : "♾ No end date"}</span>
            </>
          )}
        </div>
        <p className="mt-2 line-clamp-2 text-sm text-ink-2">{n.bodyEn || n.bodyTe}</p>
        <p className="mt-1 text-xs text-muted">
          Posted {formatDate(n.createdAt.slice(0, 10))}
          {n.updatedAt !== n.createdAt && ` · edited ${formatDate(n.updatedAt.slice(0, 10))}`}
          {(!n.titleTe || !n.bodyTe) && " · ⚠ Telugu missing"}
          {(!n.titleEn || !n.bodyEn) && " · ⚠ English missing"}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn btn-sm" onClick={() => setEditing(n)}>
            ✎ {isExpired ? "Edit / show again" : "Edit"}
          </button>
          <a className="btn btn-sm" href={`/notice?id=${n.id}`} target="_blank" rel="noopener noreferrer">
            🖨 Print
          </a>
          {!isExpired && (
            <>
              <a className="btn btn-sm" href={whatsappLink(noticeShareText(db, n, link))} target="_blank" rel="noopener noreferrer">
                <span className="text-[#1a9e4b]">●</span> Share to group
              </a>
              <button className="btn btn-sm" onClick={() => onSendToAll(n.id)}>
                <span className="text-[#1a9e4b]">●</span> Send to each owner
              </button>
            </>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <SectionTitle action={<button className="btn btn-primary" onClick={() => setEditing("new")}>+ New notice</button>}>
          Notices
        </SectionTitle>
        <p className="text-sm text-ink-2">
          Write each notice in English and Telugu, and choose how it pops up: <strong>every time</strong> the app is opened until the
          notice date, <strong>once</strong>, or <strong>not at all</strong> (only in the Notices tab). After its end date a notice is
          hidden from residents automatically. Notices with no end date stay in the Notices tab.
        </p>
      </div>
      {current.length === 0 && <p className="card p-6 text-center text-ink-2">No notices showing right now.</p>}
      {current.map((n) => card(n, false))}
      {expired.length > 0 && (
        <div>
          <button className="btn w-full" onClick={() => setShowExpired((v) => !v)} aria-expanded={showExpired}>
            {showExpired ? "Hide" : "Show"} expired notices ({expired.length})
          </button>
          {showExpired && <div className="mt-3 space-y-3">{expired.map((n) => card(n, true))}</div>}
        </div>
      )}
      {editing && <NoticeSheet notice={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

const POPUP_OPTIONS: { v: PopupMode; title: string; hint: string }[] = [
  { v: "every", title: "🔁 Every time the app is opened, until the notice date", hint: "For something happening soon: water cut, lift off, a meeting. Needs an end date." },
  { v: "once", title: "1️⃣ Once", hint: "Pops up one time on each phone (again if you edit the notice)." },
  { v: "none", title: "📌 Don’t pop up", hint: "Only listed in the Notices tab." },
];

function NoticeSheet({ notice, onClose }: { notice: Notice | null; onClose: () => void }) {
  const { run } = useAdmin();
  const [f, setF] = useState({
    titleEn: notice?.titleEn ?? "",
    bodyEn: notice?.bodyEn ?? "",
    titleTe: notice?.titleTe ?? "",
    bodyTe: notice?.bodyTe ?? "",
    important: !!notice?.important,
    popupMode: (notice?.popupMode ?? "once") as PopupMode,
    expiresOn: notice?.expiresOn ?? "",
    keep: notice ? !notice.expiresOn : false,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const needsDate = f.popupMode === "every" || !f.keep;
  const dateMissing = needsDate && !f.expiresOn;
  const save = async () => {
    const { keep, ...rest } = f;
    const payload = { ...rest, expiresOn: keep && f.popupMode !== "every" ? undefined : f.expiresOn || undefined };
    const ok = notice
      ? await run({ type: "notice.update", id: notice.id, notice: payload }, "Notice saved — residents will see it again")
      : await run({ type: "notice.add", notice: payload }, "Notice posted");
    if (ok) onClose();
  };
  return (
    <Sheet open onClose={onClose} title={notice ? "Edit notice" : "New notice"} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="space-y-3 rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-bold">English</legend>
          <Field label="Title">
            <input className="input" value={f.titleEn} onChange={(e) => set("titleEn", e.target.value)} placeholder="e.g. Water supply stopped on Sunday" />
          </Field>
          <Field label="Notice">
            <textarea className="input min-h-36" value={f.bodyEn} onChange={(e) => set("bodyEn", e.target.value)} />
          </Field>
        </fieldset>
        <fieldset className="space-y-3 rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-bold">తెలుగు</legend>
          <Field label="శీర్షిక (Title)">
            <input className="input" lang="te" value={f.titleTe} onChange={(e) => set("titleTe", e.target.value)} placeholder="ఉదా: ఆదివారం నీటి సరఫరా ఉండదు" />
          </Field>
          <Field label="నోటీసు (Notice)" hint="Tip: use your phone's Telugu keyboard or 🎤 voice typing in Telugu.">
            <textarea className="input min-h-36" lang="te" value={f.bodyTe} onChange={(e) => set("bodyTe", e.target.value)} />
          </Field>
        </fieldset>
      </div>

      <fieldset className="mt-4">
        <legend className="label">When residents open the app</legend>
        <div className="grid gap-2">
          {POPUP_OPTIONS.map((o) => (
            <label key={o.v} className={`flex cursor-pointer gap-3 rounded-xl border-2 p-3 ${f.popupMode === o.v ? "border-brand bg-brand-soft" : "border-line"}`}>
              <input type="radio" name="popupMode" className="mt-1 h-4 w-4" checked={f.popupMode === o.v} onChange={() => set("popupMode", o.v)} />
              <span>
                <span className="block text-sm font-bold">{o.title}</span>
                <span className="block text-xs text-ink-2">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-4">
        <legend className="label">How long to show it</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 ${!f.keep || f.popupMode === "every" ? "border-brand bg-brand-soft" : "border-line"}`}>
            <input type="radio" name="keep" className="mt-1 h-4 w-4" checked={!f.keep || f.popupMode === "every"} onChange={() => set("keep", false)} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">Until the notice date</span>
              <input
                className={`input mt-1 ${dateMissing ? "border-crit" : ""}`}
                type="date"
                value={f.expiresOn}
                onChange={(e) => setF((x) => ({ ...x, expiresOn: e.target.value, keep: false }))}
              />
              <span className="mt-1 block text-xs text-ink-2">After this day it is hidden from residents and marked expired here.</span>
            </span>
          </label>
          <label
            className={`flex items-start gap-3 rounded-xl border-2 p-3 ${f.popupMode === "every" ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${f.keep && f.popupMode !== "every" ? "border-brand bg-brand-soft" : "border-line"}`}
          >
            <input type="radio" name="keep" className="mt-1 h-4 w-4" disabled={f.popupMode === "every"} checked={f.keep && f.popupMode !== "every"} onChange={() => set("keep", true)} />
            <span>
              <span className="block text-sm font-bold">♾ Keep without end date</span>
              <span className="block text-xs text-ink-2">
                {f.popupMode === "every" ? "Not possible for notices that pop up every time." : "Stays in the Notices tab until you delete it (e.g. emergency contacts)."}
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      <label className="mt-4 flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" className="h-5 w-5" checked={f.important} onChange={(e) => set("important", e.target.checked)} />
        Mark as important (red)
      </label>

      <div className="mt-4 flex gap-2">
        {notice && (
          <button
            className="btn text-crit-ink"
            onClick={async () => {
              if (confirm("Delete this notice?") && (await run({ type: "notice.delete", id: notice.id }, "Notice removed"))) onClose();
            }}
          >
            Delete
          </button>
        )}
        <button
          className="btn btn-primary flex-1"
          disabled={!(f.titleEn || f.titleTe) || !(f.bodyEn || f.bodyTe) || dateMissing}
          onClick={save}
        >
          {notice ? "Save notice" : "Post notice"}
        </button>
      </div>
      {dateMissing && <p className="mt-2 text-center text-xs font-semibold text-crit-ink">Pick the notice date, or choose “Keep without end date”.</p>}
    </Sheet>
  );
}

/* ===================== Phone numbers ===================== */

export function ContactsPanel({ db }: { db: DB }) {
  const { run } = useAdmin();
  const [rows, setRows] = useState(() =>
    db.flats.map((f) => ({ flatId: f.id, phone: formatPhone(f.phone), residentPhone: formatPhone(f.residentPhone) })),
  );
  const [saving, setSaving] = useState(false);
  const bad = (v: string) => !!v.trim() && !normalizePhone(v);
  const anyBad = rows.some((r) => bad(r.phone) || bad(r.residentPhone));
  const filled = db.flats.filter((f) => normalizePhone(f.phone)).length;
  const set = (i: number, k: "phone" | "residentPhone", v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <SectionTitle>Phone numbers</SectionTitle>
        <p className="text-sm text-ink-2">
          WhatsApp numbers for each flat, used for reminders and notices. Only admins can see them. {filled} of {db.flats.length} owners have a number.
          A 10-digit Indian number is enough; +91 is added automatically. If an owner has several flats, enter the same number on each; they will get one message.
        </p>
      </div>
      <div className="space-y-2">
        {db.flats.map((f, i) => (
          <div key={f.id} className="card grid grid-cols-[44px_1fr] gap-x-3 gap-y-2 p-3 sm:grid-cols-[44px_1fr_1fr]">
            <span className="row-span-2 grid h-11 w-11 place-items-center rounded-xl bg-surface-2 font-extrabold sm:row-span-1">{f.id}</span>
            <label className="block">
              <span className="mb-1 block truncate text-xs font-semibold text-ink-2">Owner · {f.owner}</span>
              <input
                className={`input ${bad(rows[i].phone) ? "border-crit outline-crit" : ""}`}
                type="tel"
                inputMode="tel"
                placeholder="98xxxxxxxx"
                value={rows[i].phone}
                onChange={(e) => set(i, "phone", e.target.value)}
              />
            </label>
            <label className="col-start-2 block sm:col-start-3">
              <span className="mb-1 block truncate text-xs font-semibold text-ink-2">{f.resident ? `Lives here · ${f.resident}` : "Tenant (if any)"}</span>
              <input
                className={`input ${bad(rows[i].residentPhone) ? "border-crit outline-crit" : ""}`}
                type="tel"
                inputMode="tel"
                placeholder={f.resident ? "98xxxxxxxx" : "Owner lives here"}
                value={rows[i].residentPhone}
                onChange={(e) => set(i, "residentPhone", e.target.value)}
              />
            </label>
          </div>
        ))}
      </div>
      {anyBad && <p className="rounded-lg bg-crit-bg px-3 py-2 text-sm font-semibold text-crit-ink">Some numbers look wrong (marked in red). Please check them.</p>}
      <div className="sticky bottom-3 z-10">
        <button
          className="btn btn-primary w-full text-base shadow-lg"
          disabled={saving || anyBad}
          onClick={async () => {
            setSaving(true);
            await run({ type: "contacts.save", contacts: rows }, "Phone numbers saved");
            setSaving(false);
          }}
        >
          Save all numbers
        </button>
      </div>
    </div>
  );
}

/* ===================== WhatsApp send queue ===================== */

type Kind = "reminder" | "notice" | "custom";

export interface SendPreset {
  kind: Kind;
  noticeId?: string;
}

function readSent(key: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

export function SendPanel({ db, preset, goContacts }: { db: DB; preset: SendPreset | null; goContacts: () => void }) {
  const [kind, setKind] = useState<Kind>(preset?.kind ?? "reminder");
  const [noticeId, setNoticeId] = useState(preset?.noticeId ?? db.notices[0]?.id ?? "");
  const [audience, setAudience] = useState<Audience>(preset?.kind === "notice" ? "both" : "owners");
  const [lang, setLang] = useState<MsgLang>("both");
  const [includeUpcoming, setIncludeUpcoming] = useState(false);
  const [custom, setCustom] = useState("Namaste {name} garu,\n\n");
  const [preview, setPreview] = useState<OutMessage | null>(null);

  useEffect(() => {
    if (preset) {
      setKind(preset.kind);
      if (preset.noticeId) setNoticeId(preset.noticeId);
      if (preset.kind === "notice") setAudience("both");
    }
  }, [preset]);

  const dues = useMemo(() => duesReport(db), [db]);
  const notice = db.notices.find((n) => n.id === noticeId);
  const url = origin();

  const messages: OutMessage[] = useMemo(() => {
    if (kind === "reminder") return reminderMessages(db, dues, { includeUpcoming, audience, lang, url });
    if (kind === "notice") return notice ? noticeMessages(db, notice, { audience, lang, url: `${url}/notice?id=${notice.id}` }) : [];
    return custom.trim() ? customMessages(db, custom, audience) : [];
  }, [kind, db, dues, includeUpcoming, audience, lang, url, notice, custom]);

  // Progress is remembered on this phone for today, so you can leave WhatsApp and come back.
  const campaign = `apt-sent:${todayISO()}:${kind}:${kind === "notice" ? noticeId : ""}:${audience}:${lang}:${includeUpcoming}`;
  const [sent, setSent] = useState<string[]>([]);
  useEffect(() => setSent(readSent(campaign)), [campaign]);
  const markSent = (phone: string) => {
    setSent((s) => {
      const next = s.includes(phone) ? s : [...s, phone];
      try {
        localStorage.setItem(campaign, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  const resetSent = () => {
    setSent([]);
    try {
      localStorage.removeItem(campaign);
    } catch {
      /* ignore */
    }
  };

  const missing = flatsMissingPhone(db, audience);
  const relevantMissing =
    kind === "reminder"
      ? missing.filter((f) => [...dues.overdue, ...(includeUpcoming ? dues.upcoming : [])].some((d) => d.flat.id === f.id))
      : missing;
  const next = messages.find((m) => !sent.includes(m.recipient.phone));
  const doneCount = messages.filter((m) => sent.includes(m.recipient.phone)).length;

  const open = (m: OutMessage) => {
    window.open(whatsappLink(m.text, m.recipient.phone), "_blank", "noopener");
    markSent(m.recipient.phone);
  };

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <SectionTitle>Send on WhatsApp</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Group label="What to send">
              <Segmented<Kind>
                stack
                label="What to send"
                value={kind}
                onChange={setKind}
                options={[
                  { v: "reminder", l: "Maintenance reminder", hint: "to flats with dues" },
                  { v: "notice", l: "A notice" },
                  { v: "custom", l: "My own message" },
                ]}
              />
            </Group>
          </div>
          <div className="sm:col-span-2">
            <Group label="Send to">
              <Segmented<Audience>
                label="Send to"
                value={audience}
                onChange={setAudience}
                options={[
                  { v: "owners", l: "Owners" },
                  { v: "residents", l: "Tenants", hint: "people living there" },
                  { v: "both", l: "Both" },
                ]}
              />
            </Group>
          </div>
          {kind === "notice" && (
            <Group label="Notice">
              <Dropdown
                label="Notice"
                placeholder="No notices yet"
                value={noticeId}
                onChange={setNoticeId}
                options={db.notices.map((n) => ({ v: n.id, l: noticeTitle(n) }))}
              />
            </Group>
          )}
          {kind !== "custom" && (
            <Group label="Language">
              <Segmented<MsgLang>
                label="Language"
                value={lang}
                onChange={setLang}
                options={[
                  { v: "both", l: "English + Telugu" },
                  { v: "en", l: "English" },
                  { v: "te", l: "తెలుగు" },
                ]}
              />
            </Group>
          )}
          {kind === "reminder" && (
            <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
              <input type="checkbox" className="h-5 w-5" checked={includeUpcoming} onChange={(e) => setIncludeUpcoming(e.target.checked)} />
              Also remind flats that haven’t paid this month yet (before the due date)
            </label>
          )}
          {kind === "custom" && (
            <div className="sm:col-span-2">
              <Field label="Message" hint="{name} becomes the person’s name and {flat} their flat number(s).">
                <textarea className="input min-h-32" value={custom} onChange={(e) => setCustom(e.target.value)} />
              </Field>
            </div>
          )}
        </div>
      </div>

      {relevantMissing.length > 0 && (
        <div className="rounded-xl border border-warn bg-warn-bg p-3 text-sm text-warn-ink">
          <strong>No number for:</strong> {relevantMissing.map((f) => f.id).join(", ")}.{" "}
          <button className="font-bold underline" onClick={goContacts}>
            Add phone numbers
          </button>
        </div>
      )}

      {messages.length === 0 ? (
        <p className="card p-6 text-center text-ink-2">
          {kind === "reminder" ? "Nobody to remind — no pending dues for people with phone numbers." : "No one to send to yet. Add phone numbers first."}
        </p>
      ) : (
        <>
          <div className="card p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold">
                {doneCount} of {messages.length} sent
              </p>
              {doneCount > 0 && (
                <button className="text-sm text-ink-2 underline" onClick={resetSent}>
                  Start over
                </button>
              )}
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-good transition-[width]" style={{ width: `${(doneCount / messages.length) * 100}%` }} />
            </div>
            {next ? (
              <button className="btn mt-3 w-full border-transparent bg-[#1a9e4b] text-base text-white hover:bg-[#1a9e4b] hover:opacity-90" onClick={() => open(next)}>
                Send to {next.recipient.name} ({next.recipient.flats.join(", ")}) →
              </button>
            ) : (
              <p className="mt-3 rounded-lg bg-good-bg px-3 py-2 text-center font-bold text-good-ink">✓ All sent</p>
            )}
            <p className="mt-2 text-xs text-muted">
              WhatsApp opens with the message ready. Tap send in WhatsApp, come back here, and tap the green button for the next person.
            </p>
          </div>

          <ul className="space-y-2">
            {messages.map((m) => {
              const done = sent.includes(m.recipient.phone);
              return (
                <li key={m.recipient.phone} className={`card flex items-center gap-3 p-3 ${done ? "opacity-70" : ""}`}>
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ${done ? "bg-good-bg text-good-ink" : "bg-surface-2"}`}>
                    {done ? "✓" : m.recipient.flats.length}
                  </span>
                  <button className="min-w-0 flex-1 text-left" onClick={() => setPreview(m)}>
                    <span className="block truncate font-semibold">{m.recipient.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {m.recipient.flats.join(", ")} · {formatPhone(m.recipient.phone)} · <span className="underline">preview</span>
                    </span>
                  </button>
                  <button className={`btn btn-sm ${done ? "" : "btn-primary"}`} onClick={() => open(m)}>
                    {done ? "Send again" : "Send"}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <details className="card p-4 text-sm text-ink-2">
        <summary className="cursor-pointer font-bold text-ink">Why not send to everyone with one tap?</summary>
        <p className="mt-2">
          WhatsApp only allows fully automatic bulk messages through its paid Business API, which needs Meta approval and pre-approved templates.
          This screen is the free way: one tap per person, with the message already written.
        </p>
        <p className="mt-2">
          For a notice that should reach everyone at once, use <strong>Share to group</strong> on the notice. Or create a WhatsApp{" "}
          <strong>Broadcast list</strong> on your phone (WhatsApp → ⋮ → New broadcast) and paste the message there; it reaches everyone who has
          saved your number.
        </p>
        {messages[0] && kind !== "reminder" && (
          <button
            className="btn btn-sm mt-3"
            onClick={() => navigator.clipboard?.writeText(messages[0].text).catch(() => undefined)}
          >
            Copy message for a broadcast list
          </button>
        )}
      </details>

      {preview && (
        <Sheet open onClose={() => setPreview(null)} title={`To ${preview.recipient.name}`}>
          <pre className="whitespace-pre-wrap rounded-xl bg-[#e7ffdb] p-3 font-sans text-sm text-[#111]">{preview.text}</pre>
          <button
            className="btn btn-primary mt-3 w-full"
            onClick={() => {
              open(preview);
              setPreview(null);
            }}
          >
            Open in WhatsApp
          </button>
        </Sheet>
      )}
    </div>
  );
}

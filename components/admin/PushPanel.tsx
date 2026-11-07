"use client";

import { useCallback, useEffect, useState } from "react";
import type { DB } from "@/lib/types";
import type { DeviceInfo } from "@/lib/push";
import { OPEN_PAGES } from "@/lib/push";
import { currentMonth, monthLabel } from "@/lib/dates";
import { currentDeviceId } from "../push";
import { Segmented } from "../Pickers";
import { Field, SectionTitle, useAdmin } from "./ui";

type Form = { titleEn: string; bodyEn: string; titleTe: string; bodyTe: string; url: string; important: boolean };
const EMPTY: Form = { titleEn: "", bodyEn: "", titleTe: "", bodyTe: "", url: "/", important: false };

/** Ready-made messages to start from. */
function templates(db: DB): { label: string; form: Form }[] {
  const m = currentMonth();
  const day = db.settings.dueDay ?? 10;
  return [
    {
      label: "💰 Maintenance reminder",
      form: {
        titleEn: `Maintenance for ${monthLabel(m)}`,
        bodyEn: `Please pay this month's maintenance by the ${day}th. Thank you 🙏`,
        titleTe: `${monthLabel(m, "te")} మెయింటెనెన్స్`,
        bodyTe: `దయచేసి ఈ నెల మెయింటెనెన్స్ ${day}వ తేదీ లోపు చెల్లించండి. ధన్యవాదాలు 🙏`,
        url: "/",
        important: false,
      },
    },
    {
      label: "🚰 Water supply",
      form: {
        titleEn: "Water supply update",
        bodyEn: "",
        titleTe: "నీటి సరఫరా సమాచారం",
        bodyTe: "",
        url: "/",
        important: true,
      },
    },
    {
      label: "👥 Meeting",
      form: {
        titleEn: "Association meeting",
        bodyEn: "",
        titleTe: "అసోసియేషన్ మీటింగ్",
        bodyTe: "",
        url: "/",
        important: false,
      },
    },
  ];
}

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function PushPanel({ db }: { db: DB }) {
  const { toast } = useAdmin();
  const [devices, setDevices] = useState<DeviceInfo[] | null>(null);
  const [removed, setRemoved] = useState<DeviceInfo[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [mine, setMine] = useState<string | null>(null);
  const [f, setF] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/push/devices", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) return toast(j.error || "Could not load devices", true);
      setEnabled(j.enabled);
      setDevices(j.devices);
      setRemoved(j.removed ?? []);
    } catch {
      toast("No internet connection", true);
    }
  }, [toast]);

  useEffect(() => {
    load();
    currentDeviceId().then(setMine);
  }, [load]);

  const send = async (key: string, body: unknown, what: string) => {
    setBusy(key);
    try {
      const res = await fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) toast(j.error || "Could not send", true);
      else {
        const unreachable = j.failed - j.removed;
        const parts = [`${what} sent to ${plural(j.sent, "device")}`];
        if (j.removed) parts.push(`${j.removed} had turned notifications off (removed)`);
        if (unreachable) parts.push(`${unreachable} could not be reached`);
        toast(parts.join(" · "), j.sent === 0);
      }
    } catch {
      toast("No internet connection — not sent", true);
    }
    setBusy(null);
    load();
  };

  const remove = async (d: DeviceInfo) => {
    if (!confirm(`Stop sending notifications to “${d.device}”? You can add it back any time from “Removed devices”.`)) return;
    setBusy(`rm:${d.id}`);
    const res = await fetch("/api/push/devices", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: d.id }),
    }).catch(() => null);
    if (!res?.ok) toast("Could not remove", true);
    else toast("Device removed. Add it back any time from “Removed devices”.");
    setBusy(null);
    load();
  };

  const restore = async (d: DeviceInfo) => {
    setBusy(`re:${d.id}`);
    const res = await fetch("/api/push/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restore: d.id }),
    }).catch(() => null);
    if (!res?.ok) toast("Could not add back", true);
    else toast(`${d.device} added back`);
    setBusy(null);
    load();
  };

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const count = devices?.length ?? 0;
  const hasTitle = !!(f.titleEn.trim() || f.titleTe.trim());
  const previewTitle = (lang: "en" | "te") => {
    const t = lang === "te" ? f.titleTe || f.titleEn : f.titleEn || f.titleTe;
    return `${f.important ? "❗" : "🔔"} ${t}`;
  };
  const previewBody = (lang: "en" | "te") => (lang === "te" ? f.bodyTe || f.bodyEn : f.bodyEn || f.bodyTe);

  if (!enabled) {
    return (
      <div className="card p-4">
        <SectionTitle>Notifications</SectionTitle>
        <p className="text-sm text-ink-2">
          🔕 Not set up: add <code>VAPID_PUBLIC_KEY</code> and <code>VAPID_PRIVATE_KEY</code> in Vercel and redeploy (see docs/VERCEL_SETUP.md).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <SectionTitle>Send a notification</SectionTitle>
        <p className="mb-3 text-sm text-ink-2">
          Goes to every device that turned on notifications, in each device&apos;s language (English or Telugu; if one is empty the other is used).
          For notices, you can also use 🔔 <strong>Notify devices</strong> in the Notices section.
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          {templates(db).map((tp) => (
            <button key={tp.label} className="btn btn-sm" onClick={() => setF(tp.form)}>
              {tp.label}
            </button>
          ))}
          {f !== EMPTY && (
            <button className="btn btn-sm text-ink-2" onClick={() => setF(EMPTY)}>
              Clear
            </button>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset className="space-y-3 rounded-xl border border-line p-3">
            <legend className="px-1 text-sm font-bold">English</legend>
            <Field label="Title">
              <input className="input" maxLength={100} value={f.titleEn} onChange={(e) => set("titleEn", e.target.value)} placeholder="e.g. Water supply stopped till 4 pm" />
            </Field>
            <Field label="Message (optional)">
              <textarea className="input min-h-24" maxLength={400} value={f.bodyEn} onChange={(e) => set("bodyEn", e.target.value)} />
            </Field>
          </fieldset>
          <fieldset className="space-y-3 rounded-xl border border-line p-3">
            <legend className="px-1 text-sm font-bold">తెలుగు</legend>
            <Field label="శీర్షిక (Title)">
              <input className="input" lang="te" maxLength={100} value={f.titleTe} onChange={(e) => set("titleTe", e.target.value)} placeholder="ఉదా: సాయంత్రం 4 వరకు నీరు రాదు" />
            </Field>
            <Field label="సందేశం (Message, optional)">
              <textarea className="input min-h-24" lang="te" maxLength={400} value={f.bodyTe} onChange={(e) => set("bodyTe", e.target.value)} />
            </Field>
          </fieldset>
        </div>

        <div className="mt-4">
          <p className="label">When tapped, open</p>
          <Segmented label="When tapped, open" options={OPEN_PAGES.map((p) => ({ v: p.url, l: p.label }))} value={f.url} onChange={(v) => set("url", v)} />
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="h-5 w-5" checked={f.important} onChange={(e) => set("important", e.target.checked)} />
          Important (❗, delivered right away even when the device is saving battery)
        </label>

        {hasTitle && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {(["en", "te"] as const).map((lang) => (
              <div key={lang} className="rounded-xl bg-surface-2 p-3">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted">Preview · {lang === "te" ? "Telugu phones" : "English phones"}</p>
                <p className="font-bold">{previewTitle(lang)}</p>
                {previewBody(lang) && <p className="mt-0.5 line-clamp-3 text-sm text-ink-2">{previewBody(lang)}</p>}
              </div>
            ))}
          </div>
        )}

        <button
          className="btn btn-primary mt-4 w-full text-base"
          disabled={!hasTitle || count === 0 || busy !== null}
          onClick={() => {
            if (!confirm(`Send “${f.titleEn || f.titleTe}” to ${plural(count, "device")}?`)) return;
            send("msg", { message: f }, "Notification").then(() => setF(EMPTY));
          }}
        >
          {busy === "msg" ? "Sending…" : count === 0 ? "No devices subscribed yet" : `🔔 Send to ${plural(count, "device")}`}
        </button>
      </div>

      <div className="card p-4">
        <SectionTitle
          action={
            count > 0 && (
              <button className="btn btn-sm" disabled={busy !== null} onClick={() => send("testall", { testIds: devices!.map((d) => d.id) }, "Test")}>
                {busy === "testall" ? "Sending…" : "Send test to all"}
              </button>
            )
          }
        >
          Subscribed devices {devices && `(${count})`}
        </SectionTitle>
        {!devices && <p className="text-sm text-ink-2">Loading…</p>}
        {devices && count === 0 && (
          <p className="text-sm text-ink-2">
            No devices yet. Residents are asked to turn on notifications after the notice pop-ups, or from the top of the Notices tab.
          </p>
        )}
        <ul className="space-y-2">
          {devices?.map((d) => (
            <li key={d.id} className="rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg" aria-hidden>
                  {/iPhone|iPad|Android/.test(d.device) ? "📱" : "💻"}
                </span>
                <span className="font-bold">{d.device}</span>
                {d.id === mine && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-bold text-brand">This device</span>}
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-ink-2">{d.installed ? "Installed app" : "Browser"}</span>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-ink-2">{d.lang === "te" ? "తెలుగు" : "English"}</span>
              </div>
              <p className="mt-1 text-xs text-muted">
                Subscribed {when(d.at)} · delivered by {d.service}
              </p>
              <p className={`mt-1 text-sm ${d.last && !d.last.ok ? "font-semibold text-crit-ink" : "text-ink-2"}`}>
                {!d.last
                  ? "Nothing sent yet"
                  : d.last.ok
                    ? `✓ Last notification ${when(d.last.at)}: accepted by ${d.service}`
                    : `✗ Last notification ${when(d.last.at)} failed${d.last.status ? ` (error ${d.last.status})` : ""}`}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button className="btn btn-sm" disabled={busy !== null} onClick={() => send(`t:${d.id}`, { testIds: [d.id] }, "Test")}>
                  {busy === `t:${d.id}` ? "Sending…" : "Send test"}
                </button>
                <button className="btn btn-sm text-crit-ink" disabled={busy !== null} onClick={() => remove(d)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
        {removed.length > 0 && (
          <details className="mt-3 rounded-xl border border-line p-3">
            <summary className="cursor-pointer text-sm font-bold">Removed devices ({removed.length})</summary>
            <p className="mt-2 text-sm text-ink-2">
              These devices still have notifications turned on but are not sent anything. “Last seen” is when the app was last opened on them. Add one
              back to start sending again.
            </p>
            <ul className="mt-2 space-y-2">
              {removed.map((d) => (
                <li key={d.id} className="rounded-xl bg-surface-2 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg" aria-hidden>
                      {/iPhone|iPad|Android/.test(d.device) ? "📱" : "💻"}
                    </span>
                    <span className="font-bold">{d.device}</span>
                    {d.id === mine && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-bold text-brand">This device</span>}
                    <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-ink-2">{d.installed ? "Installed app" : "Browser"}</span>
                    <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-ink-2">{d.lang === "te" ? "తెలుగు" : "English"}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Removed {d.removedAt ? when(d.removedAt) : ""} · last seen {when(d.at)} · delivered by {d.service}
                  </p>
                  <button className="btn btn-sm mt-2" disabled={busy !== null} onClick={() => restore(d)}>
                    {busy === `re:${d.id}` ? "Adding…" : "↩ Add back"}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
        <details className="mt-3 rounded-xl bg-surface-2 p-3 text-sm text-ink-2">
          <summary className="cursor-pointer font-semibold text-ink">“Accepted” but nothing appeared on the device?</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>“Accepted” means Google / Apple took the notification; the device shows it when it is online.</li>
            <li>
              <strong>Android:</strong> Settings → Apps → Chrome (or the browser used) → Notifications → allowed, including the <em>Sites</em> category. Also
              check the site isn&apos;t blocked: open the app, tap 🔒 next to the address → Notifications → Allow.
            </li>
            <li>
              <strong>iPhone:</strong> works only from the app added to the Home Screen; Settings → Notifications → the app → Allow.
            </li>
            <li>Do Not Disturb, Focus or battery saver can hold notifications back. Tick “Important” for urgent ones.</li>
            <li>
              Each browser shows once: when a device turns notifications on again, its old entry is replaced. Entries the browser has dropped are removed
              when you next send. <strong>Remove</strong> stops sending to a device and moves it to “Removed devices”, where you can add it back.
            </li>
          </ul>
        </details>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import type { DB, ExpenseTemplate, Flat, MonthKey, Rule } from "@/lib/types";
import { inr } from "@/lib/calc";
import { monthLabel } from "@/lib/dates";
import { downloadText, ledgerCSV } from "@/lib/export";
import { whatsappLink } from "@/lib/share";
import { formatPhone } from "@/lib/phone";
import { Sheet } from "../Sheet";
import { Field, SectionTitle, useAdmin } from "./ui";

/* ---------- flats ---------- */

export function FlatsPanel({ db }: { db: DB }) {
  const [editing, setEditing] = useState<Flat | null>(null);
  return (
    <div className="space-y-4">
      <div className="card p-4">
        <SectionTitle>Flats &amp; owners</SectionTitle>
        <p className="text-sm text-ink-2">Edit owner and resident names. Phone numbers are only visible to admins and are used for WhatsApp reminders.</p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {db.flats.map((f) => (
          <li key={f.id}>
            <button className="card flex w-full items-center gap-3 p-3 text-left hover:bg-surface-2" onClick={() => setEditing(f)}>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-2 font-extrabold">{f.id}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{f.owner}</span>
                <span className="block truncate text-xs text-muted">
                  {f.resident ? `Lives here: ${f.resident}` : "Owner lives here"}
                  {f.phone ? ` · ${formatPhone(f.phone)}` : " · no number"}
                </span>
              </span>
              <span className="text-muted" aria-hidden>✎</span>
            </button>
          </li>
        ))}
      </ul>
      {editing && <FlatSheet flat={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function FlatSheet({ flat, onClose }: { flat: Flat; onClose: () => void }) {
  const { run } = useAdmin();
  const [owner, setOwner] = useState(flat.owner);
  const [resident, setResident] = useState(flat.resident ?? "");
  const [phone, setPhone] = useState(formatPhone(flat.phone));
  const [residentPhone, setResidentPhone] = useState(formatPhone(flat.residentPhone));
  const [notes, setNotes] = useState(flat.notes ?? "");
  return (
    <Sheet open onClose={onClose} title={`Flat ${flat.id}`}>
      <div className="grid gap-3">
        <Field label="Owner name">
          <input className="input" value={owner} onChange={(e) => setOwner(e.target.value)} />
        </Field>
        <Field label="Resident / tenant (if different from owner)">
          <input className="input" value={resident} onChange={(e) => setResident(e.target.value)} placeholder="Leave empty if owner lives here" />
        </Field>
        <Field label="Owner's WhatsApp number (admins only)">
          <input className="input" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98xxxxxxxx" />
        </Field>
        <Field label="Tenant / resident's WhatsApp number (admins only)">
          <input className="input" type="tel" inputMode="tel" value={residentPhone} onChange={(e) => setResidentPhone(e.target.value)} placeholder="Leave empty if owner lives here" />
        </Field>
        <Field label="Notes (admins only)">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      <button
        className="btn btn-primary mt-4 w-full"
        disabled={!owner.trim()}
        onClick={async () => {
          if (await run({ type: "flat.update", flatId: flat.id, owner, resident, phone, residentPhone, notes }, `Flat ${flat.id} saved`)) onClose();
        }}
      >
        Save
      </button>
    </Sheet>
  );
}

/* ---------- rules ---------- */

export function RulesPanel({ db }: { db: DB }) {
  const { run } = useAdmin();
  const [editing, setEditing] = useState<Rule | "new" | null>(null);
  const shareText = `*${db.settings.apartmentName} – Apartment rules*\n\n${db.rules
    .map((r, i) => `${i + 1}. *${r.title}*${r.important ? " ❗" : ""}\n${r.body}`)
    .join("\n\n")}\n\n${typeof window !== "undefined" ? window.location.origin : ""}/#rules`;
  return (
    <div className="space-y-4">
      <div className="card p-4">
        <SectionTitle action={<button className="btn btn-primary" onClick={() => setEditing("new")}>+ Add rule</button>}>
          Apartment rules
        </SectionTitle>
        <p className="text-sm text-ink-2">Rules show for everyone (owners and tenants) under the “Rules” tab. New or changed rules get a “New” badge for 14 days.</p>
        {db.rules.length > 0 && (
          <a className="btn btn-sm mt-3" href={whatsappLink(shareText)} target="_blank" rel="noopener noreferrer">
            Share rules on WhatsApp
          </a>
        )}
      </div>
      {db.rules.length === 0 && <p className="card p-6 text-center text-ink-2">No rules yet.</p>}
      <ol className="space-y-2">
        {db.rules.map((r, i) => (
          <li key={r.id} className={`card flex items-start gap-2 p-3 ${r.important ? "border-l-4 border-l-crit" : ""}`}>
            <div className="flex flex-col gap-1">
              <button className="btn btn-sm px-2" disabled={i === 0} onClick={() => run({ type: "rule.move", id: r.id, dir: -1 }, "Moved")} aria-label="Move up">
                ↑
              </button>
              <button className="btn btn-sm px-2" disabled={i === db.rules.length - 1} onClick={() => run({ type: "rule.move", id: r.id, dir: 1 }, "Moved")} aria-label="Move down">
                ↓
              </button>
            </div>
            <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(r)}>
              <span className="block font-bold">
                {i + 1}. {r.title} {r.important && <span className="text-crit-ink">❗</span>}
              </span>
              <span className="line-clamp-2 text-sm text-ink-2">{r.body}</span>
            </button>
          </li>
        ))}
      </ol>
      {editing && <RuleSheet rule={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RuleSheet({ rule, onClose }: { rule: Rule | null; onClose: () => void }) {
  const { run } = useAdmin();
  const [title, setTitle] = useState(rule?.title ?? "");
  const [body, setBody] = useState(rule?.body ?? "");
  const [important, setImportant] = useState(!!rule?.important);
  return (
    <Sheet open onClose={onClose} title={rule ? "Edit rule" : "New rule"}>
      <div className="grid gap-3">
        <Field label="Title">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Parking" />
        </Field>
        <Field label="Details" hint="You can write in Telugu or English.">
          <textarea className="input min-h-32" value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="h-5 w-5" checked={important} onChange={(e) => setImportant(e.target.checked)} />
          Mark as important (shown in red)
        </label>
      </div>
      <div className="mt-4 flex gap-2">
        {rule && (
          <button
            className="btn text-crit-ink"
            onClick={async () => {
              if (confirm(`Delete rule "${rule.title}"?`) && (await run({ type: "rule.delete", id: rule.id }, "Rule removed"))) onClose();
            }}
          >
            Delete
          </button>
        )}
        <button
          className="btn btn-primary flex-1"
          disabled={!title.trim() || !body.trim()}
          onClick={async () => {
            const ok = rule
              ? await run({ type: "rule.update", id: rule.id, title, body, important }, "Rule saved")
              : await run({ type: "rule.add", title, body, important }, "Rule added");
            if (ok) onClose();
          }}
        >
          Save
        </button>
      </div>
    </Sheet>
  );
}

/* ---------- settings ---------- */

export function SettingsPanel({ db, month }: { db: DB; month: MonthKey }) {
  const { run } = useAdmin();
  const s = db.settings;
  const [name, setName] = useState(s.apartmentName);
  const [amount, setAmount] = useState(String(s.maintenanceAmount));
  const [dueDay, setDueDay] = useState(String(s.dueDay));
  const [startMonth, setStartMonth] = useState(s.startMonth);
  const [opening, setOpening] = useState(String(s.openingBalance));
  const [carry, setCarry] = useState(s.carryForward);

  return (
    <div className="space-y-4">
      {s.isDemo && (
        <section className="rounded-2xl border-2 border-crit bg-crit-bg p-4">
          <h2 className="text-lg font-bold text-crit-ink">Sample data is loaded</h2>
          <p className="mt-1 text-sm text-crit-ink">
            The app is showing September 2026 from the book for a trial run. When you are ready, remove it to start fresh from{" "}
            <strong>this month with ₹0</strong>. Flat owner names and phone numbers are kept; payments, expenses, works, rules and notices are removed.
          </p>
          <button
            className="btn btn-danger mt-3"
            onClick={async () => {
              if (confirm("Remove ALL sample data and start fresh from this month with ₹0? This cannot be undone.")) {
                await run({ type: "data.clearDemo" }, "Started fresh — welcome!");
              }
            }}
          >
            Remove sample data &amp; start fresh
          </button>
        </section>
      )}

      <section className="card p-4">
        <SectionTitle>General</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Apartment name">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          <Field label="Monthly maintenance per flat (₹)">
            <input className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Due by day of month" hint="After this day, unpaid flats show in the red alert.">
            <input className="input" inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
          </Field>
          <Field label="Books start from month">
            <input className="input" type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} disabled={s.isDemo} />
          </Field>
          <Field label="Money in hand at start (₹)" hint="Use a minus sign for a shortage.">
            <input className="input" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
            <input type="checkbox" className="h-5 w-5" checked={carry} onChange={(e) => setCarry(e.target.checked)} />
            Carry each month’s balance into the next month
          </label>
        </div>
        <button
          className="btn btn-primary mt-4"
          onClick={() =>
            run(
              {
                type: "settings.update",
                settings: {
                  apartmentName: name,
                  maintenanceAmount: Number(amount),
                  dueDay: Number(dueDay),
                  ...(s.isDemo ? {} : { startMonth }),
                  openingBalance: Number(opening),
                  carryForward: carry,
                },
              },
              "Settings saved",
            )
          }
        >
          Save settings
        </button>
      </section>

      <TemplatesEditor templates={s.expenseTemplates} />

      <section className="card p-4">
        <SectionTitle>Export &amp; print</SectionTitle>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => downloadText(`maintenance-${month}.csv`, ledgerCSV(db, month))}>
            ⬇ {monthLabel(month)} (Excel)
          </button>
          <button className="btn" onClick={() => downloadText(`maintenance-all.csv`, ledgerCSV(db))}>
            ⬇ All months (Excel)
          </button>
          <a className="btn" href={`/report?month=${month}`} target="_blank" rel="noopener noreferrer">
            🖨 Print / PDF statement
          </a>
        </div>
      </section>

      {!s.isDemo && (
        <section className="card p-4">
          <SectionTitle>Trial data</SectionTitle>
          <p className="text-sm text-ink-2">Load the September 2026 sample again to show someone how the app works. This replaces all current records.</p>
          <button
            className="btn mt-3 text-crit-ink"
            onClick={async () => {
              if (confirm("This will REPLACE all real records with the September 2026 sample. Continue?")) await run({ type: "data.loadDemo" }, "Sample data loaded");
            }}
          >
            Load sample data
          </button>
        </section>
      )}
    </div>
  );
}

function TemplatesEditor({ templates }: { templates: ExpenseTemplate[] }) {
  const { run } = useAdmin();
  const [rows, setRows] = useState(templates.map((t) => ({ ...t, amount: String(t.amount) })));
  const set = (i: number, k: "category" | "label" | "amount", v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <section className="card p-4">
      <SectionTitle>Regular monthly expenses</SectionTitle>
      <p className="mb-3 text-sm text-ink-2">These are added in one tap each month from the Expenses tab. Change any amount there if it differs that month.</p>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.id} className="grid grid-cols-[1fr_100px_auto] gap-2">
            <input className="input" value={r.label} onChange={(e) => set(i, "label", e.target.value)} aria-label="Description" />
            <input className="input" inputMode="numeric" value={r.amount} onChange={(e) => set(i, "amount", e.target.value)} aria-label="Amount" />
            <button className="btn btn-sm self-center text-crit-ink" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} aria-label="Remove">
              ✕
            </button>
            <input
              className="input col-span-3 -mt-1 text-sm"
              value={r.category}
              onChange={(e) => set(i, "category", e.target.value)}
              aria-label="Category"
              placeholder="Category"
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn" onClick={() => setRows((x) => [...x, { id: "", category: "Misc", label: "", amount: "0" }])}>
          + Add row
        </button>
        <button
          className="btn btn-primary"
          onClick={() =>
            run(
              { type: "template.save", templates: rows.map((r) => ({ ...r, label: r.label || r.category, amount: Number(r.amount) })) },
              "Regular expenses saved",
            )
          }
        >
          Save list
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">Total per month: {inr(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0))}</p>
    </section>
  );
}

/* ---------- edit history ---------- */

export function AuditPanel({ db }: { db: DB }) {
  return (
    <div className="space-y-4">
      <div className="card p-4">
        <SectionTitle>Edit history</SectionTitle>
        <p className="text-sm text-ink-2">Every change, who made it, and when (last 1,000 changes).</p>
      </div>
      {db.audit.length === 0 ? (
        <p className="card p-6 text-center text-ink-2">No changes yet.</p>
      ) : (
        <ul className="card divide-y divide-line">
          {db.audit.map((a) => (
            <li key={a.id} className="p-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-bold">{a.action}</span>
                <span className="text-xs text-muted">
                  {new Date(a.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })} · {a.by}
                </span>
              </div>
              <p className="text-ink-2">{a.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

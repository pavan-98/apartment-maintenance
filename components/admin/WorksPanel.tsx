"use client";

import { useState } from "react";
import type { DB, MonthKey, PayMode, SpecialCollection } from "@/lib/types";
import { collectionSummary, inr } from "@/lib/calc";
import { monthLabel } from "@/lib/dates";
import { Sheet } from "../Sheet";
import { defaultDateFor, Field, ModeSelect, ReceiptInput, SectionTitle, useAdmin } from "./ui";

export function WorksPanel({ db, month }: { db: DB; month: MonthKey }) {
  const [creating, setCreating] = useState(false);
  const list = db.collections.filter((c) => c.month === month);
  return (
    <div className="space-y-4">
      <div className="card p-4">
        <SectionTitle action={<button className="btn btn-primary" onClick={() => setCreating(true)}>+ New work</button>}>
          Additional works · {monthLabel(month)}
        </SectionTitle>
        <p className="text-sm text-ink-2">
          One-off works paid by a separate collection from each flat (pest control, painting, motor repair…). Add the costs and tick off
          who has paid.
        </p>
      </div>
      {list.length === 0 && <p className="card p-6 text-center text-ink-2">No additional works this month.</p>}
      {list.map((c) => (
        <WorkCard key={c.id} db={db} c={c} />
      ))}
      {creating && <WorkSheet db={db} month={month} onClose={() => setCreating(false)} />}
    </div>
  );
}

function WorkCard({ db, c }: { db: DB; c: SpecialCollection }) {
  const { run } = useAdmin();
  const s = collectionSummary(db, c);
  const [edit, setEdit] = useState(false);
  const [mode, setMode] = useState<PayMode>("cash");
  const [costLabel, setCostLabel] = useState("");
  const [costAmount, setCostAmount] = useState("");
  const [receiptId, setReceiptId] = useState<string | undefined>();
  const paidBy = new Map<string, number>();
  for (const p of c.payments) paidBy.set(p.flatId, (paidBy.get(p.flatId) ?? 0) + p.amount);

  return (
    <article className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold">{c.title}</h3>
          <p className="text-sm text-ink-2">
            {inr(c.perFlatAmount)} per flat · {s.expectedFlats.length} flats
            {c.description && ` · ${c.description}`}
          </p>
        </div>
        <button className="btn btn-sm" onClick={() => setEdit(true)}>
          Edit
        </button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
        <div className="rounded-xl bg-surface-2 p-2">
          <p className="text-xs text-muted">Collected</p>
          <p className="tnum font-bold">{inr(s.collected)}</p>
        </div>
        <div className="rounded-xl bg-surface-2 p-2">
          <p className="text-xs text-muted">Cost</p>
          <p className="tnum font-bold">{inr(s.cost)}</p>
        </div>
        <div className={`rounded-xl p-2 ${s.net < 0 ? "bg-crit-bg text-crit-ink" : "bg-good-bg text-good-ink"}`}>
          <p className="text-xs">{s.net < 0 ? "Shortage" : "Balance"}</p>
          <p className="tnum font-bold">{inr(s.net)}</p>
        </div>
      </div>

      <h4 className="mt-4 mb-2 text-sm font-bold uppercase tracking-wide text-muted">Who has paid</h4>
      <div className="mb-2 max-w-sm">
        <ModeSelect value={mode} onChange={setMode} />
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {s.expectedFlats.map((f) => {
          const paid = paidBy.get(f.id) ?? 0;
          const done = paid >= c.perFlatAmount;
          return (
            <button
              key={f.id}
              className={`rounded-xl border-2 p-2 text-left text-sm ${done ? "border-good/50 bg-good-bg" : "border-crit/60 bg-crit-bg"}`}
              onClick={async () => {
                if (done) {
                  const last = [...c.payments].reverse().find((p) => p.flatId === f.id);
                  if (last && confirm(`Undo ${f.id}'s payment of ${inr(last.amount)}?`))
                    await run({ type: "collection.payment.delete", id: c.id, paymentId: last.id }, "Payment removed");
                } else {
                  await run(
                    { type: "collection.payment.add", id: c.id, flatId: f.id, amount: c.perFlatAmount - paid, date: defaultDateFor(c.month), mode },
                    `${f.id} paid`,
                  );
                }
              }}
            >
              <span className="block font-extrabold">{f.id}</span>
              <span className={`text-xs font-bold ${done ? "text-good-ink" : "text-crit-ink"}`}>{done ? "✓ Paid" : paid ? `${inr(paid)} part` : "Tap if paid"}</span>
            </button>
          );
        })}
      </div>

      <h4 className="mt-4 mb-2 text-sm font-bold uppercase tracking-wide text-muted">Costs</h4>
      {c.costs.length > 0 && (
        <ul className="mb-3 divide-y divide-line rounded-xl border border-line text-sm">
          {c.costs.map((x) => (
            <li key={x.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span>
                {x.label}
                {x.receiptId && (
                  <a className="ml-2 text-xs text-brand underline" href={`/api/receipts/${x.receiptId}`} target="_blank" rel="noopener noreferrer">
                    📎 bill
                  </a>
                )}
              </span>
              <span className="flex items-center gap-2">
                <span className="tnum font-semibold">{inr(x.amount)}</span>
                <button
                  className="btn btn-sm text-crit-ink"
                  aria-label={`Remove ${x.label}`}
                  onClick={async () => {
                    if (confirm(`Remove ${x.label}?`)) await run({ type: "collection.cost.delete", id: c.id, costId: x.id }, "Cost removed");
                  }}
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-[1fr_110px] gap-2">
        <input className="input" placeholder="Item (e.g. Labour charges)" value={costLabel} onChange={(e) => setCostLabel(e.target.value)} />
        <input className="input" placeholder="₹" inputMode="decimal" value={costAmount} onChange={(e) => setCostAmount(e.target.value)} />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <ReceiptInput value={receiptId} onChange={setReceiptId} />
        <button
          className="btn btn-primary btn-sm"
          disabled={!costLabel || !costAmount}
          onClick={async () => {
            const ok = await run({ type: "collection.cost.add", id: c.id, label: costLabel, amount: Number(costAmount), receiptId }, "Cost added");
            if (ok) {
              setCostLabel("");
              setCostAmount("");
              setReceiptId(undefined);
            }
          }}
        >
          + Add cost
        </button>
      </div>
      {edit && <WorkSheet db={db} month={c.month} existing={c} onClose={() => setEdit(false)} />}
    </article>
  );
}

function WorkSheet({ db, month, existing, onClose }: { db: DB; month: MonthKey; existing?: SpecialCollection; onClose: () => void }) {
  const { run } = useAdmin();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [amount, setAmount] = useState(existing ? String(existing.perFlatAmount) : "");
  const [exempt, setExempt] = useState<string[]>(existing?.exemptFlats ?? []);

  const save = async () => {
    const ok = existing
      ? await run({ type: "collection.update", id: existing.id, title, description, perFlatAmount: Number(amount), exemptFlats: exempt }, "Saved")
      : await run({ type: "collection.create", month, title, description, perFlatAmount: Number(amount), exemptFlats: exempt }, "Work added");
    if (ok) onClose();
  };

  return (
    <Sheet open onClose={onClose} title={existing ? "Edit work" : `New work · ${monthLabel(month)}`}>
      <div className="grid gap-3">
        <Field label="What work?">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Pest control" />
        </Field>
        <Field label="Details (optional)">
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Amount to collect per flat (₹)">
          <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <div>
          <span className="label">Flats that don’t need to pay (tap to exclude)</span>
          <div className="grid grid-cols-5 gap-1.5">
            {db.flats.map((f) => {
              const out = exempt.includes(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  className={`rounded-lg border px-1 py-2 text-sm font-bold ${out ? "border-line bg-surface-2 text-muted line-through" : "border-brand bg-brand-soft text-brand"}`}
                  onClick={() => setExempt((x) => (out ? x.filter((i) => i !== f.id) : [...x, f.id]))}
                  aria-pressed={!out}
                >
                  {f.id}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        {existing && (
          <button
            className="btn text-crit-ink"
            onClick={async () => {
              if (confirm(`Delete "${existing.title}" with all its costs and payments?`)) {
                if (await run({ type: "collection.delete", id: existing.id }, "Work removed")) onClose();
              }
            }}
          >
            Delete
          </button>
        )}
        <button className="btn btn-primary flex-1" disabled={!title || amount === ""} onClick={save}>
          Save
        </button>
      </div>
    </Sheet>
  );
}

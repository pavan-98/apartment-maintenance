"use client";

import { useState } from "react";
import type { DB, Flat, MonthKey, PayMode } from "@/lib/types";
import { activeMonths, flatStatus, inr, maintenanceDue } from "@/lib/calc";
import { compareMonths, formatDate, monthLabel, todayISO } from "@/lib/dates";
import { flatName } from "@/lib/share";
import { StatusChip } from "../dashboard";
import { Sheet } from "../Sheet";
import { defaultDateFor, Field, Group, ModeSelect, SectionTitle, useAdmin } from "./ui";

export function PaymentsPanel({ db, month, isManager }: { db: DB; month: MonthKey; isManager: boolean }) {
  const { run } = useAdmin();
  const [mode, setMode] = useState<PayMode>("cash");
  const [editing, setEditing] = useState<Flat | null>(null);
  const [late, setLate] = useState<{ flat: Flat; month: MonthKey } | null>(null);
  // Dues still pending from months before the one being viewed.
  const earlier = activeMonths(db)
    .filter((m) => compareMonths(m, month) < 0)
    .flatMap((m) => db.flats.map((f) => ({ month: m, ...flatStatus(db, f, m) })))
    .filter((x) => x.pending > 0);
  const [busy, setBusy] = useState<string | null>(null);
  const due = maintenanceDue(db, month);
  const statuses = db.flats.map((f) => flatStatus(db, f, month));
  const pendingIds = statuses.filter((s) => s.pending > 0).map((s) => s.flat.id);
  const collected = statuses.reduce((s, x) => s + x.paid, 0);

  const quickPay = async (flatId: string) => {
    setBusy(flatId);
    await run({ type: "payment.markAll", flatIds: [flatId], month, date: defaultDateFor(month), mode }, `${flatId} marked as paid`);
    setBusy(null);
  };

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <SectionTitle>
          Maintenance · {monthLabel(month)}
        </SectionTitle>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-surface-2 p-2">
            <p className="text-xs text-muted">Per flat</p>
            <p className="tnum font-bold">{inr(due)}</p>
          </div>
          <div className="rounded-xl bg-good-bg p-2">
            <p className="text-xs text-good-ink">Collected</p>
            <p className="tnum font-bold text-good-ink">{inr(collected)}</p>
          </div>
          <div className="rounded-xl bg-crit-bg p-2">
            <p className="text-xs text-crit-ink">Pending</p>
            <p className="tnum font-bold text-crit-ink">{pendingIds.length} flats</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-2">
          <Group label="Quick-mark payment mode">
            <ModeSelect value={mode} onChange={setMode} />
          </Group>
          <button
            className="btn"
            disabled={!pendingIds.length}
            onClick={async () => {
              if (!confirm(`Mark ALL ${pendingIds.length} remaining flats as paid for ${monthLabel(month)}?`)) return;
              await run({ type: "payment.markAll", flatIds: pendingIds, month, date: defaultDateFor(month), mode }, "All marked as paid");
            }}
          >
            Mark all paid
          </button>
        </div>
        {!isManager && <MonthAmount db={db} month={month} />}
      </div>

      {earlier.length > 0 && (
        <div className="card border-crit/40 p-4">
          <SectionTitle>Pending from earlier months</SectionTitle>
          <p className="mb-2 text-sm text-ink-2">If someone pays old dues now, record it here. It counts towards the month it was due for.</p>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {earlier.map((x) => (
              <li key={`${x.month}-${x.flat.id}`} className="flex items-center gap-3 p-2.5">
                <span className="min-w-0 flex-1 text-sm">
                  <strong>{x.flat.id}</strong> {flatName(x.flat)}
                  <span className="block text-xs text-crit-ink">
                    {monthLabel(x.month)} · {inr(x.pending)} pending
                  </span>
                </span>
                <button className="btn btn-sm" onClick={() => setLate({ flat: x.flat, month: x.month })}>
                  Record payment
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="space-y-2">
        {statuses.map((s) => (
          <li key={s.flat.id} className={`card flex items-center gap-3 p-3 ${s.status === "unpaid" ? "border-crit/40" : ""}`}>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-base font-extrabold">{s.flat.id}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{flatName(s.flat)}</span>
              <span className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
                <StatusChip status={s.status} />
                {s.paid > 0 && <span className="tnum">{inr(s.paid)}{s.lastPaidOn && ` · ${formatDate(s.lastPaidOn)}`}</span>}
              </span>
            </span>
            {s.pending > 0 && (
              <button className="btn btn-primary btn-sm" disabled={busy === s.flat.id} onClick={() => quickPay(s.flat.id)}>
                ✓ Paid
              </button>
            )}
            <button className="btn btn-sm" onClick={() => setEditing(s.flat)} aria-label={`More for ${s.flat.id}`}>
              ⋯
            </button>
          </li>
        ))}
      </ul>

      {editing && <PaymentSheet db={db} flat={editing} month={month} canRemove onClose={() => setEditing(null)} />}
      {late && <PaymentSheet db={db} flat={late.flat} month={late.month} late canRemove={!isManager} onClose={() => setLate(null)} />}
    </div>
  );
}

function MonthAmount({ db, month }: { db: DB; month: MonthKey }) {
  const { run } = useAdmin();
  const override = db.settings.maintenanceOverrides[month];
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(override ?? db.settings.maintenanceAmount));
  if (!open)
    return (
      <button className="mt-3 text-sm font-semibold text-brand underline" onClick={() => setOpen(true)}>
        Different amount for this month?
      </button>
    );
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-surface-2 p-3">
      <div className="min-w-32 flex-1">
        <Field label={`Amount per flat for ${monthLabel(month)}`}>
          <input className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
      </div>
      <button className="btn btn-primary" onClick={() => run({ type: "settings.monthAmount", month, amount: Number(amount) }).then((ok) => ok && setOpen(false))}>
        Save
      </button>
      {override !== undefined && (
        <button className="btn" onClick={() => run({ type: "settings.monthAmount", month, amount: null }).then((ok) => ok && setOpen(false))}>
          Use default
        </button>
      )}
    </div>
  );
}

function PaymentSheet({
  db,
  flat,
  month,
  onClose,
  late = false,
  canRemove,
}: {
  db: DB;
  flat: Flat;
  month: MonthKey;
  onClose: () => void;
  /** Recording an earlier month's dues paid now. */
  late?: boolean;
  canRemove: boolean;
}) {
  const { run } = useAdmin();
  const st = flatStatus(db, flat, month);
  const [amount, setAmount] = useState(String(st.pending || st.due));
  const [date, setDate] = useState(late ? todayISO() : defaultDateFor(month));
  const [mode, setMode] = useState<PayMode>("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const ok = await run(
      { type: "payment.add", flatId: flat.id, month, amount: Number(amount), date, mode, note },
      `Payment saved for ${flat.id}`,
    );
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Sheet open onClose={onClose} title={`${flat.id} · ${flatName(flat)}`}>
      <p className="mb-3 text-sm text-ink-2">
        {late && <strong className="text-crit-ink">Late payment for </strong>}
        {monthLabel(month)} · due {inr(st.due)} · paid {inr(st.paid)}
      </p>
      {st.payments.length > 0 && (
        <ul className="mb-4 divide-y divide-line rounded-xl border border-line text-sm">
          {st.payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 p-3">
              <span>
                <strong className="tnum">{inr(p.amount)}</strong> · {formatDate(p.date)} · {p.mode.toUpperCase()}
                {p.note && <span className="block text-xs text-muted">{p.note}</span>}
              </span>
              {canRemove && (
                <button
                  className="btn btn-sm text-crit-ink"
                  onClick={async () => {
                    if (confirm(`Remove this ${inr(p.amount)} payment?`)) await run({ type: "payment.delete", id: p.id }, "Payment removed");
                  }}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <h3 className="mb-2 font-bold">Record a payment</h3>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (₹)">
          <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Date">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Group label="Mode">
          <ModeSelect value={mode} onChange={setMode} />
        </Group>
        <Field label="Note (optional)">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. UPI ref" />
        </Field>
      </div>
      <button className="btn btn-primary mt-4 w-full" disabled={saving} onClick={save}>
        Save payment
      </button>
    </Sheet>
  );
}

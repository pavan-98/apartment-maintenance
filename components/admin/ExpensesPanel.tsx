"use client";

import { useState } from "react";
import type { DB, Expense, MonthKey } from "@/lib/types";
import { inr } from "@/lib/calc";
import { formatDate, monthLabel } from "@/lib/dates";
import { Sheet } from "../Sheet";
import { defaultDateFor, Field, Group, ReceiptInput, SectionTitle, useAdmin } from "./ui";
import { ChipPicker } from "../Pickers";

const BASE_CATEGORIES = ["Salary", "Electricity", "GVMC & water tank", "Lift maintenance", "Cleaning material", "Repairs", "Water", "Festival", "Misc"];

export function ExpensesPanel({ db, month }: { db: DB; month: MonthKey }) {
  const { run } = useAdmin();
  const [editing, setEditing] = useState<Expense | "new" | null>(null);
  const items = db.expenses.filter((e) => e.month === month);
  const total = items.reduce((s, e) => s + e.amount, 0);
  const existingLabels = new Set(items.map((e) => e.label));
  const missing = db.settings.expenseTemplates.filter((t) => !existingLabels.has(t.label) && t.amount > 0);

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <SectionTitle action={<button className="btn btn-primary" onClick={() => setEditing("new")}>+ Add expense</button>}>
          Expenses · {monthLabel(month)}
        </SectionTitle>
        <p className="text-sm text-ink-2">
          Total <strong className="tnum text-ink">{inr(total)}</strong> · {items.length} items
        </p>
        {missing.length > 0 && (
          <div className="mt-3 rounded-xl border border-dashed border-brand bg-brand-soft p-3">
            <p className="text-sm font-semibold text-brand">Regular monthly expenses not added yet:</p>
            <p className="mt-1 text-sm text-ink-2">{missing.map((t) => `${t.label} (${inr(t.amount)})`).join(" · ")}</p>
            <button
              className="btn btn-primary btn-sm mt-2"
              onClick={() => run({ type: "expense.applyTemplates", month }, "Regular expenses added — edit any amount that changed")}
            >
              Add all {missing.length} with usual amounts
            </button>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <p className="card p-6 text-center text-ink-2">No expenses for this month yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((e) => (
            <li key={e.id}>
              <button className="card flex w-full items-center gap-3 p-3 text-left hover:bg-surface-2" onClick={() => setEditing(e)}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{e.label}</span>
                  <span className="block text-xs text-muted">
                    {e.category}
                    {e.date && ` · ${formatDate(e.date)}`}
                    {e.receiptId && " · 📎 bill"}
                    {e.note && ` · ${e.note}`}
                  </span>
                </span>
                <span className="tnum font-bold">{inr(e.amount)}</span>
                <span className="text-muted" aria-hidden>›</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && <ExpenseSheet db={db} month={month} expense={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ExpenseSheet({ db, month, expense, onClose }: { db: DB; month: MonthKey; expense: Expense | null; onClose: () => void }) {
  const { run } = useAdmin();
  const categories = [...new Set([...BASE_CATEGORIES, ...db.settings.expenseTemplates.map((t) => t.category), ...db.expenses.map((e) => e.category)])];
  const [category, setCategory] = useState(expense?.category ?? "Misc");
  const [custom, setCustom] = useState("");
  const [label, setLabel] = useState(expense?.label ?? "");
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [date, setDate] = useState(expense?.date ?? defaultDateFor(month));
  const [note, setNote] = useState(expense?.note ?? "");
  const [receiptId, setReceiptId] = useState<string | undefined>(expense?.receiptId);
  const [saving, setSaving] = useState(false);
  const cat = category === "__new" ? custom : category;

  const save = async () => {
    setSaving(true);
    const ok = expense
      ? await run({ type: "expense.update", id: expense.id, category: cat, label: label || cat, amount: Number(amount), date, note, receiptId: receiptId ?? null }, "Expense updated")
      : await run({ type: "expense.add", month, category: cat, label: label || cat, amount: Number(amount), date, note, receiptId }, "Expense added");
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Sheet open onClose={onClose} title={expense ? "Edit expense" : `New expense · ${monthLabel(month)}`}>
      <div className="grid gap-3">
        <Group label="Category">
          <ChipPicker
            label="Category"
            options={[...categories.map((c) => ({ v: c, l: c })), { v: "__new", l: "+ New category" }]}
            value={category}
            onChange={setCategory}
          />
        </Group>
        {category === "__new" && (
          <Field label="New category name">
            <input className="input" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. Generator diesel" />
          </Field>
        )}
        <Field label="Description">
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={cat || "What was it for?"} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (₹)">
            <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Date">
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Note (optional)">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div>
          <span className="label">Bill / receipt photo (optional, visible to residents)</span>
          <ReceiptInput value={receiptId} onChange={setReceiptId} />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        {expense && (
          <button
            className="btn text-crit-ink"
            onClick={async () => {
              if (confirm(`Delete "${expense.label}" (${inr(expense.amount)})?`)) {
                if (await run({ type: "expense.delete", id: expense.id }, "Expense removed")) onClose();
              }
            }}
          >
            Delete
          </button>
        )}
        <button className="btn btn-primary flex-1" disabled={saving || !amount || !cat} onClick={save}>
          {expense ? "Save changes" : "Add expense"}
        </button>
      </div>
    </Sheet>
  );
}

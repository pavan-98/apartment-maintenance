"use client";

import { useState } from "react";
import type { AdminUser, DB } from "@/lib/types";
import { formatDate } from "@/lib/dates";
import { MANAGER_CAN, MANAGER_CANNOT } from "@/lib/permissions";
import { whatsappLink } from "@/lib/share";
import { Sheet } from "../Sheet";
import { Field, SectionTitle, useAdmin } from "./ui";

function suggestPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const arr = new Uint32Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
}

function loginMessage(db: DB, name: string, password: string): string {
  const url = typeof window !== "undefined" ? `${window.location.origin}/admin` : "/admin";
  return [
    `*${db.settings.apartmentName}* – manager login`,
    "",
    `Open: ${url}`,
    `Name: ${name}`,
    `Password: ${password}`,
    "",
    "You can manage this month's maintenance, expenses, additional works and notices.",
  ].join("\n");
}

/** Main admin only: add managers with limited access. */
export function TeamPanel({ db }: { db: DB }) {
  const { run } = useAdmin();
  const [adding, setAdding] = useState(false);
  const [resetFor, setResetFor] = useState<AdminUser | null>(null);
  const [shared, setShared] = useState<{ name: string; password: string } | null>(null);

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <SectionTitle action={<button className="btn btn-primary" onClick={() => setAdding(true)}>+ Add manager</button>}>
          Managers
        </SectionTitle>
        <p className="text-sm text-ink-2">
          Hand over day-to-day work without sharing your main password. Each manager logs in with their own name and password. You can pause
          or remove them any time; their login stops working immediately.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-good-bg p-3 text-sm text-good-ink">
            <p className="font-bold">Managers can</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {MANAGER_CAN.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl bg-crit-bg p-3 text-sm text-crit-ink">
            <p className="font-bold">Managers cannot</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {MANAGER_CANNOT.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {shared && (
        <div className="rounded-xl border-2 border-brand bg-brand-soft p-4">
          <p className="font-bold text-brand">Send these login details to {shared.name}</p>
          <p className="mt-1 text-sm">
            Name: <strong>{shared.name}</strong> · Password: <strong className="font-mono">{shared.password}</strong>
          </p>
          <p className="mt-1 text-xs text-ink-2">The password is shown only now. If it’s lost, set a new one.</p>
          <div className="mt-2 flex gap-2">
            <a className="btn btn-sm" href={whatsappLink(loginMessage(db, shared.name, shared.password))} target="_blank" rel="noopener noreferrer">
              <span className="text-[#1a9e4b]">●</span> Send on WhatsApp
            </a>
            <button className="btn btn-sm" onClick={() => setShared(null)}>
              Done
            </button>
          </div>
        </div>
      )}

      {db.users.length === 0 ? (
        <p className="card p-6 text-center text-ink-2">No managers yet. Only you can make changes.</p>
      ) : (
        <ul className="space-y-2">
          {db.users.map((u) => (
            <li key={u.id} className={`card p-3 ${u.active ? "" : "opacity-70"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 font-bold">{u.name.slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">
                    {u.name}{" "}
                    <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${u.active ? "bg-good-bg text-good-ink" : "bg-surface-2 text-muted"}`}>
                      {u.active ? "Active" : "Paused"}
                    </span>
                  </span>
                  <span className="block text-xs text-muted">
                    Added {formatDate(u.createdAt.slice(0, 10))}
                    {u.lastLoginAt ? ` · last login ${formatDate(u.lastLoginAt.slice(0, 10))}` : " · never logged in"}
                  </span>
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button className="btn btn-sm" onClick={() => setResetFor(u)}>
                  🔑 New password
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => run({ type: "user.setActive", id: u.id, active: !u.active }, u.active ? `${u.name} paused` : `${u.name} can log in again`)}
                >
                  {u.active ? "⏸ Pause access" : "▶ Restore access"}
                </button>
                <button
                  className="btn btn-sm text-crit-ink"
                  onClick={async () => {
                    if (confirm(`Remove ${u.name}? They will be logged out immediately.`)) await run({ type: "user.remove", id: u.id }, `${u.name} removed`);
                  }}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <PasswordSheet
          title="Add manager"
          askName
          onClose={() => setAdding(false)}
          onSave={async (name, password) => {
            const ok = await run({ type: "user.add", name, password }, `${name} added`);
            if (ok) setShared({ name, password });
            return ok;
          }}
        />
      )}
      {resetFor && (
        <PasswordSheet
          title={`New password for ${resetFor.name}`}
          onClose={() => setResetFor(null)}
          onSave={async (_n, password) => {
            const ok = await run({ type: "user.resetPassword", id: resetFor.id, password }, "Password changed — old login no longer works");
            if (ok) setShared({ name: resetFor.name, password });
            return ok;
          }}
        />
      )}
    </div>
  );
}

function PasswordSheet({
  title,
  askName,
  onClose,
  onSave,
}: {
  title: string;
  askName?: boolean;
  onClose: () => void;
  onSave: (name: string, password: string) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState(suggestPassword);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open onClose={onClose} title={title}>
      <div className="grid gap-3">
        {askName && (
          <Field label="Manager's name" hint="They type this name when logging in.">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ravi" autoComplete="off" />
          </Field>
        )}
        <Field label="Password" hint="At least 6 characters. A random one is filled in for you.">
          <div className="flex gap-2">
            <input className="input font-mono" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            <button type="button" className="btn shrink-0" onClick={() => setPassword(suggestPassword())}>
              ↻
            </button>
          </div>
        </Field>
      </div>
      <button
        className="btn btn-primary mt-4 w-full"
        disabled={busy || password.length < 6 || (askName && name.trim().length < 2)}
        onClick={async () => {
          setBusy(true);
          const ok = await onSave(name.trim(), password);
          setBusy(false);
          if (ok) onClose();
        }}
      >
        Save
      </button>
    </Sheet>
  );
}

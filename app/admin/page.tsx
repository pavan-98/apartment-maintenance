"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { activeMonths, defaultMonth } from "@/lib/calc";
import { addMonths, currentMonth, monthLabel } from "@/lib/dates";
import { useApp } from "@/components/AppProvider";
import { Header } from "@/components/Header";
import { AdminToasts, MonthPicker } from "@/components/admin/ui";
import { PaymentsPanel } from "@/components/admin/PaymentsPanel";
import { ExpensesPanel } from "@/components/admin/ExpensesPanel";
import { WorksPanel } from "@/components/admin/WorksPanel";
import { AuditPanel, FlatsPanel, RulesPanel, SettingsPanel } from "@/components/admin/OtherPanels";
import { ContactsPanel, NoticesPanel, SendPanel, type SendPreset } from "@/components/admin/MessagingPanels";
import { TeamPanel } from "@/components/admin/TeamPanel";

// `owner: true` = main admin only; managers don't see these tabs.
const TABS = [
  { k: "pay", l: "Maintenance", monthly: true },
  { k: "exp", l: "Expenses", monthly: true },
  { k: "works", l: "Additional works", monthly: true },
  { k: "notices", l: "Notices" },
  { k: "send", l: "WhatsApp send" },
  { k: "phones", l: "Phone numbers" },
  { k: "flats", l: "Flats" },
  { k: "rules", l: "Rules", owner: true },
  { k: "team", l: "Managers", owner: true },
  { k: "settings", l: "Settings", monthly: true, owner: true },
  { k: "log", l: "History", owner: true },
] as const;
type TabKey = (typeof TABS)[number]["k"];

export default function AdminPage() {
  const { db, admin, role, loading, storage } = useApp();
  const isManager = role === "manager";
  const [tab, setTab] = useState<TabKey>("pay");
  const [month, setMonth] = useState<string | null>(null);
  const [sendPreset, setSendPreset] = useState<SendPreset | null>(null);

  const months = useMemo(() => {
    if (!db) return [];
    // Managers work on the current month only.
    if (isManager) return [currentMonth()];
    const m = activeMonths(db);
    return db.settings.isDemo ? m : [...m, addMonths(m[m.length - 1], 1)];
  }, [db, isManager]);
  const current = month && months.includes(month) ? month : isManager ? months[0] : db ? defaultMonth(db) : "";
  const tabs = TABS.filter((t) => !("owner" in t && t.owner) || !isManager);
  const activeTab = tabs.some((t) => t.k === tab) ? tab : "pay";
  const tabInfo = TABS.find((t) => t.k === activeTab)!;

  return (
    <>
      <Header adminArea />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-4">
        {loading && !db ? (
          <p className="py-20 text-center text-ink-2">Loading…</p>
        ) : !admin ? (
          <Login />
        ) : db ? (
          <AdminToasts>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h1 className="text-xl font-extrabold">Admin</h1>
                <p className="text-sm text-ink-2">
                  Logged in as <strong>{admin}</strong>
                  <span className={`ml-2 rounded px-1.5 text-xs font-bold ${isManager ? "bg-surface-2 text-ink-2" : "bg-brand-soft text-brand"}`}>
                    {isManager ? "Manager" : "Main admin"}
                  </span>
                  {storage === "file" && <span className="ml-2 rounded bg-warn-bg px-1.5 text-xs font-bold text-warn-ink">local storage</span>}
                </p>
              </div>
              <div className="flex gap-2">
                <Link href="/" className="btn btn-sm">
                  View app
                </Link>
                <LogoutButton />
              </div>
            </div>
            {isManager && (
              <p className="mb-4 rounded-xl bg-surface-2 px-4 py-2.5 text-sm text-ink-2">
                You are managing <strong>{monthLabel(current)}</strong>. Past months can’t be changed, but you can record late payments for
                earlier dues from the Maintenance tab.
              </p>
            )}
            {db.settings.isDemo && !isManager && (
              <p className="mb-4 rounded-xl border border-dashed border-crit bg-crit-bg px-4 py-2.5 text-sm font-semibold text-crit-ink">
                Sample data is loaded.{" "}
                <button className="underline" onClick={() => setTab("settings")}>
                  Remove it in Settings
                </button>{" "}
                when you are ready to start.
              </p>
            )}
            <nav className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1" aria-label="Admin sections">
              {tabs.map((t) => (
                <button
                  key={t.k}
                  onClick={() => setTab(t.k)}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${activeTab === t.k ? "bg-brand text-brand-ink" : "bg-surface text-ink-2 ring-1 ring-line hover:text-ink"}`}
                  aria-current={activeTab === t.k ? "page" : undefined}
                >
                  {t.l}
                </button>
              ))}
            </nav>
            {"monthly" in tabInfo && tabInfo.monthly && months.length > 1 && (
              <div className="mb-4">
                <MonthPicker months={months} value={current} onChange={setMonth} />
              </div>
            )}
            {activeTab === "pay" && <PaymentsPanel db={db} month={current} isManager={isManager} />}
            {activeTab === "exp" && <ExpensesPanel db={db} month={current} />}
            {activeTab === "works" && <WorksPanel db={db} month={current} />}
            {activeTab === "notices" && (
              <NoticesPanel
                db={db}
                onSendToAll={(noticeId) => {
                  setSendPreset({ kind: "notice", noticeId });
                  setTab("send");
                }}
              />
            )}
            {activeTab === "send" && <SendPanel db={db} preset={sendPreset} goContacts={() => setTab("phones")} />}
            {activeTab === "phones" && <ContactsPanel key={db.version} db={db} />}
            {activeTab === "flats" && <FlatsPanel db={db} isManager={isManager} />}
            {activeTab === "rules" && <RulesPanel db={db} />}
            {activeTab === "team" && <TeamPanel db={db} />}
            {activeTab === "settings" && <SettingsPanel key={db.version} db={db} month={current} />}
            {activeTab === "log" && <AuditPanel db={db} />}
          </AdminToasts>
        ) : (
          <p className="py-20 text-center text-ink-2">Could not load data.</p>
        )}
      </main>
    </>
  );
}

function Login() {
  const { reload } = useApp();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error || "Login failed");
      else await reload();
    } catch {
      setError("No internet connection");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card mx-auto mt-6 max-w-sm space-y-4 p-6">
      <div>
        <h1 className="text-xl font-extrabold">Admin login</h1>
        <p className="mt-1 text-sm text-ink-2">Only for the people who manage maintenance. Main admin: your name and the main password. Managers: the name and password the main admin gave you.</p>
      </div>
      <label className="block">
        <span className="label">Your name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
      </label>
      <label className="block">
        <span className="label">Password</span>
        <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      </label>
      {error && <p className="rounded-lg bg-crit-bg px-3 py-2 text-sm font-semibold text-crit-ink">{error}</p>}
      <button className="btn btn-primary w-full" disabled={busy}>
        {busy ? "Checking…" : "Log in"}
      </button>
    </form>
  );
}

function LogoutButton() {
  const { reload } = useApp();
  return (
    <button
      className="btn btn-sm"
      onClick={async () => {
        await fetch("/api/logout", { method: "POST" });
        await reload();
      }}
    >
      Log out
    </button>
  );
}

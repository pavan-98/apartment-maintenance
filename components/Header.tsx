"use client";

import Link from "next/link";
import { useApp } from "./AppProvider";
import { InstallButton } from "./InstallButton";
import { APARTMENT_NAME } from "@/lib/config";

export function Header({ adminArea = false }: { adminArea?: boolean }) {
  const { db, lang, setLang, t, admin } = useApp();
  const name = db?.settings.apartmentName ?? APARTMENT_NAME;
  // Show the last two words large (e.g. "Sunrise Residency") so the name fits on small screens.
  const words = name.split(" ");
  const short = words.slice(-2).join(" ");
  const lead = words.slice(0, -2).join(" ");

  return (
    <header className="sticky top-0 z-30 bg-header text-header-ink no-print shadow-sm">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3 sm:gap-3">
        <Link href="/" className="flex min-w-0 flex-1 items-center gap-3">
          <span className="hidden h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15 min-[420px]:grid" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 21V5l8-3 8 3v16" />
              <path d="M9 21v-4h6v4M8 8h2M14 8h2M8 12h2M14 12h2" />
            </svg>
          </span>
          <span className="min-w-0">
            {lead && <span className="block truncate text-[11px] font-medium uppercase tracking-wide opacity-80">{lead}</span>}
            <span className="block truncate text-lg font-bold leading-tight">{short}</span>
          </span>
        </Link>
        <button
          className="btn btn-sm border-white/25 bg-white/10 text-header-ink hover:bg-white/20"
          onClick={() => setLang(lang === "en" ? "te" : "en")}
          aria-label="Change language"
        >
          {lang === "en" ? "తెలుగు" : "EN"}
        </button>
        <span className="[&_.btn]:border-white/25 [&_.btn]:bg-white/10 [&_.btn]:text-header-ink">
          <InstallButton />
        </span>
        {!adminArea && (
          <Link
            href="/admin"
            className="btn btn-sm border-white/25 bg-white/10 text-header-ink hover:bg-white/20"
            aria-label={t("admin")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            <span className="hidden sm:inline">{admin ? admin : t("admin")}</span>
          </Link>
        )}
      </div>
    </header>
  );
}

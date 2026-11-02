"use client";

import Link from "next/link";
import { formatDate, todayISO } from "@/lib/dates";
import { groupRules } from "@/lib/rules";
import { useApp } from "@/components/AppProvider";

/** Printable apartment rules in English and Telugu (A4). */
export default function PrintRulesPage() {
  const { db, t } = useApp();
  if (!db) return <p className="p-8 text-center">{t("loading")}</p>;
  let n = 0;
  return (
    <main className="mx-auto min-h-dvh max-w-3xl bg-white p-6 text-black print:max-w-none print:p-0">
      <div className="no-print mb-6 flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={() => window.print()}>
          🖨 Print / Save as PDF
        </button>
        <Link className="btn" href="/#rules">
          ← Back
        </Link>
      </div>
      <article className="rounded-sm border-4 border-double border-black p-8">
        <header className="border-b-2 border-black pb-4 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em]">{db.settings.apartmentName}</p>
          <h1 className="mt-2 text-3xl font-extrabold">APARTMENT RULES</h1>
          <p className="text-2xl font-extrabold">అపార్ట్‌మెంట్ నియమాలు</p>
        </header>
        {groupRules(db.rules).map((g) => (
          <section key={g.category.id} className="mt-6 break-inside-avoid">
            <h2 className="border-b border-black pb-1 text-lg font-bold">
              {g.category.icon} {g.category.en} / {g.category.te}
            </h2>
            <ol className="mt-2 space-y-3">
              {g.rules.map((r) => {
                n += 1;
                return (
                  <li key={r.id} className="break-inside-avoid">
                    <p className="font-bold">
                      {n}. {r.titleEn}
                      {r.titleEn && r.titleTe && " / "}
                      {r.titleTe}
                      {r.important && " ❗"}
                    </p>
                    {r.bodyEn && <p className="leading-relaxed">{r.bodyEn}</p>}
                    {r.bodyTe && <p className="leading-loose">{r.bodyTe}</p>}
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
        <footer className="mt-12 flex justify-between text-sm">
          <span>Date / తేదీ: {formatDate(todayISO())}</span>
          <span className="border-t border-black px-6 pt-1 font-semibold">Management / నిర్వహణ కమిటీ</span>
        </footer>
      </article>
    </main>
  );
}

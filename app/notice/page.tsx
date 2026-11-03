"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/dates";
import { useApp } from "@/components/AppProvider";

/** Printable bilingual notice (A4), for the notice board. */
export default function NoticePrintPage() {
  const { db, t } = useApp();
  const [id, setId] = useState<string | null>(null);
  useEffect(() => setId(new URLSearchParams(window.location.search).get("id")), []);
  if (!db) return <p className="p-8 text-center">{t("loading")}</p>;
  const n = db.notices.find((x) => x.id === id);
  if (!n)
    return (
      <p className="p-8 text-center">
        Notice not found.{" "}
        <Link className="underline" href="/#notices">
          Back
        </Link>
      </p>
    );

  return (
    <main className="mx-auto min-h-dvh max-w-3xl bg-white p-6 text-black print:max-w-none print:p-0">
      <div className="no-print mb-6 flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={() => window.print()}>
          🖨 Print / Save as PDF
        </button>
        <Link className="btn" href="/#notices">
          ← Back
        </Link>
      </div>
      <article className="rounded-sm border-4 border-double border-black p-8 print:min-h-[260mm]">
        <header className="border-b-2 border-black pb-4 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em]">{db.settings.apartmentName}</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-wide">NOTICE / నోటీసు</h1>
          {n.important && <p className="mt-1 text-sm font-bold uppercase">Important / ముఖ్యం</p>}
        </header>
        <p className="mt-4 text-right text-sm">Date / తేదీ: {formatDate(n.updatedAt.slice(0, 10))}</p>
        {(n.titleEn || n.bodyEn) && (
          <section className="mt-6">
            {n.titleEn && <h2 className="text-xl font-bold underline underline-offset-4">{n.titleEn}</h2>}
            {n.bodyEn && <p className="mt-3 whitespace-pre-line text-lg leading-relaxed">{n.bodyEn}</p>}
          </section>
        )}
        {(n.titleTe || n.bodyTe) && (
          <section className="mt-8 border-t border-dashed border-black pt-6">
            {n.titleTe && <h2 className="text-xl font-bold underline underline-offset-4">{n.titleTe}</h2>}
            {n.bodyTe && <p className="mt-3 whitespace-pre-line text-lg leading-loose">{n.bodyTe}</p>}
          </section>
        )}
        {n.expiresOn && <p className="mt-6 text-sm">Valid until / చెల్లుబాటు: {formatDate(n.expiresOn)}</p>}
        <footer className="mt-16 text-right">
          <p className="inline-block border-t border-black px-6 pt-1 text-sm font-semibold">Management / నిర్వహణ కమిటీ</p>
        </footer>
      </article>
    </main>
  );
}

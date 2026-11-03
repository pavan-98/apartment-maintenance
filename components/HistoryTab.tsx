"use client";

import { useRef, useState } from "react";
import { inr, type MonthSummary } from "@/lib/calc";
import { monthLabel } from "@/lib/dates";
import { useApp } from "./AppProvider";

/** Round a step up to 1, 2, 2.5 or 5 × 10^k so axis labels are round numbers. */
function niceStep(raw: number): number {
  if (raw <= 0) return 250;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

/** Axis maximum with four equal, round steps. */
function niceMax(v: number): number {
  return niceStep(v / 4) * 4;
}

function short(n: number): string {
  const a = Math.abs(n);
  const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
  const s = a >= 100000 ? `${fmt(a / 100000)}L` : a >= 1000 ? `${fmt(a / 1000)}k` : String(Math.round(a));
  return (n < 0 ? "−" : "") + s;
}

interface Tip {
  x: number;
  y: number;
  s: MonthSummary;
}

export function HistoryTab({ summaries, onPickMonth }: { summaries: MonthSummary[]; onPickMonth: (m: string) => void }) {
  const { t, lang } = useApp();
  const [tip, setTip] = useState<Tip | null>(null);
  const [table, setTable] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const data = summaries.slice(-12);

  const W = 640;
  const H = 240;
  const pad = { l: 44, r: 8, t: 12, b: 28 };
  const max = niceMax(Math.max(...data.map((d) => Math.max(d.income, d.spent)), 0));
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const band = iw / Math.max(1, data.length);
  const barW = Math.min(28, (band - 10) / 2);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);

  // Balance line (separate chart, same ₹ unit but different meaning).
  const BH = 180;
  const bpad = { l: 44, r: 8, t: 14, b: 28 };
  const bih = BH - bpad.t - bpad.b;
  const bvals = data.map((d) => d.closing);
  const bmaxAbs = niceMax(Math.max(1, ...bvals.map(Math.abs)));
  const bmin = Math.min(0, ...bvals) < 0 ? -bmaxAbs : 0;
  const bmax = Math.max(0, ...bvals) > 0 || bmin === 0 ? bmaxAbs : 0;
  const by = (v: number) => bpad.t + bih - ((v - bmin) / (bmax - bmin || 1)) * bih;
  const bx = (i: number) => pad.l + band * i + band / 2;

  const show = (e: React.PointerEvent | React.FocusEvent, s: MonthSummary) => {
    const r = wrap.current?.getBoundingClientRect();
    const target = (e.currentTarget as Element).getBoundingClientRect();
    if (!r) return;
    setTip({ x: target.left - r.left + target.width / 2, y: target.top - r.top, s });
  };

  return (
    <div className="space-y-4">
      {data.length < 2 && <p className="card p-4 text-sm text-ink-2">{t("nothingYet")}</p>}

      <section className="card p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">{t("incomeVsSpent")}</h2>
          <div className="flex items-center gap-3 text-xs text-ink-2">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-series-1" />{t("collected")}</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-series-2" />{t("spent")}</span>
          </div>
        </div>
        <div ref={wrap} className="relative" onPointerLeave={() => setTip(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={t("incomeVsSpent")}>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? "var(--axis)" : "var(--grid)"} strokeWidth="1" />
                <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="tnum">
                  {short(v)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = pad.l + band * i + band / 2;
              return (
                <g
                  key={d.month}
                  tabIndex={0}
                  role="button"
                  aria-label={`${monthLabel(d.month, lang)}: ${t("collected")} ${inr(d.income)}, ${t("spent")} ${inr(d.spent)}`}
                  onPointerEnter={(e) => show(e, d)}
                  onPointerDown={(e) => show(e, d)}
                  onFocus={(e) => show(e, d)}
                  onBlur={() => setTip(null)}
                  onClick={() => onPickMonth(d.month)}
                  className="cursor-pointer outline-none [&:hover_.hit]:fill-[var(--surface-2)] [&:focus_.hit]:fill-[var(--surface-2)]"
                >
                  <rect className="hit" x={cx - band / 2} y={pad.t} width={band} height={ih} fill="transparent" />
                  <path d={barPath(cx - barW - 1, y(d.income), barW, y(0) - y(d.income))} fill="var(--series-1)" />
                  <path d={barPath(cx + 1, y(d.spent), barW, y(0) - y(d.spent))} fill="var(--series-2)" />
                  <text x={cx} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">
                    {monthLabel(d.month, "en", true).replace(" 20", " '")}
                  </text>
                </g>
              );
            })}
          </svg>
          {tip && (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg"
              style={{ left: Math.min(Math.max(tip.x, 80), (wrap.current?.clientWidth ?? 300) - 80), top: tip.y - 6 }}
            >
              <p className="mb-1 font-bold">{monthLabel(tip.s.month, lang)}</p>
              <p className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-series-1" /><strong className="tnum">{inr(tip.s.income)}</strong> {t("collected")}</p>
              <p className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-series-2" /><strong className="tnum">{inr(tip.s.spent)}</strong> {t("spent")}</p>
              <p className="mt-1 text-muted">{t("closing")}: <strong className="tnum text-ink">{inr(tip.s.closing)}</strong></p>
            </div>
          )}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-2 text-lg font-bold">{t("balanceTrend")}</h2>
        <svg viewBox={`0 0 ${W} ${BH}`} className="h-auto w-full" role="img" aria-label={t("balanceTrend")}>
          {[bmin, (bmin + bmax) / 2, bmax].map((v) => (
            <g key={v}>
              <line x1={bpad.l} x2={W - bpad.r} y1={by(v)} y2={by(v)} stroke={v === 0 ? "var(--axis)" : "var(--grid)"} />
              <text x={bpad.l - 6} y={by(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{short(v)}</text>
            </g>
          ))}
          {bmin < 0 && bmax > 0 && <line x1={bpad.l} x2={W - bpad.r} y1={by(0)} y2={by(0)} stroke="var(--axis)" />}
          {data.length > 1 && (
            <polyline
              fill="none"
              stroke="var(--series-1)"
              strokeWidth="2"
              strokeLinejoin="round"
              points={data.map((d, i) => `${bx(i)},${by(d.closing)}`).join(" ")}
            />
          )}
          {data.map((d, i) => (
            <g key={d.month}>
              <circle cx={bx(i)} cy={by(d.closing)} r="5" fill={d.closing < 0 ? "var(--crit)" : "var(--series-1)"} stroke="var(--surface)" strokeWidth="2">
                <title>{`${monthLabel(d.month, lang)}: ${inr(d.closing)}`}</title>
              </circle>
              <text x={bx(i)} y={BH - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">
                {monthLabel(d.month, "en", true).replace(" 20", " '")}
              </text>
            </g>
          ))}
          {data.length > 0 && (
            <text
              x={bx(data.length - 1)}
              y={by(data[data.length - 1].closing) - 10}
              textAnchor={data.length > 1 ? "end" : "middle"}
              fontSize="12"
              fontWeight="700"
              fill="var(--ink)"
            >
              {inr(data[data.length - 1].closing)}
            </text>
          )}
        </svg>
      </section>

      <button className="btn w-full" onClick={() => setTable((v) => !v)} aria-expanded={table}>
        {table ? t("hideTable") : t("showTable")}
      </button>
      {table && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">{t("month")}</th>
                <th className="px-3 py-2 text-right">{t("collected")}</th>
                <th className="px-3 py-2 text-right">{t("spent")}</th>
                <th className="px-3 py-2 text-right">{t("closing")}</th>
                <th className="px-3 py-2 text-right">{t("paid")}</th>
              </tr>
            </thead>
            <tbody className="tnum">
              {summaries
                .slice()
                .reverse()
                .map((d) => (
                  <tr key={d.month} className="cursor-pointer border-t border-line hover:bg-surface-2" onClick={() => onPickMonth(d.month)}>
                    <td className="px-3 py-2 font-semibold">{monthLabel(d.month, lang)}</td>
                    <td className="px-3 py-2 text-right">{inr(d.income)}</td>
                    <td className="px-3 py-2 text-right">{inr(d.spent)}</td>
                    <td className={`px-3 py-2 text-right font-bold ${d.closing < 0 ? "text-crit-ink" : ""}`}>{inr(d.closing)}</td>
                    <td className="px-3 py-2 text-right">{d.paidCount}/{d.flats.length}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Bar with 4px rounded top, square at the baseline. */
function barPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0 || w <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

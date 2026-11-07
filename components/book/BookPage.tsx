"use client";

import type { CSSProperties, ReactNode } from "react";
import { inr } from "@/lib/calc";
import { monthLabel } from "@/lib/dates";
import { bookTotals, type BookSheet } from "@/lib/book";

/**
 * One A4 book page, laid out in millimetres so that the two printing passes
 * land in exactly the same place on the paper.
 *
 *   names    → header, flat rows (sign + amount by hand), empty expenses box, footer
 *   expenses → only the contents of the expenses box
 *   full     → everything (a fresh copy, or a PDF)
 */
export type PrintPart = "names" | "expenses" | "full";

// Page geometry (mm).
const W = 210;
const X = 12; // left/right margin
const CW = W - 2 * X; // 186
const TABLE_Y = 31;
const HEAD_H = 8;
const ROWS_H = 138; // space for all flat rows together
const EXP_Y = 192; // top of the expenses box — fixed so both passes line up
const EXP_H = 86;
const STRIP_H = 7;
const FOOT_Y = 284;

const COLS = [
  { k: "flat", l: "Flat", w: 15 },
  { k: "name", l: "Name of the owner / tenant", w: 71 },
  { k: "date", l: "Date", w: 22 },
  { k: "sign", l: "Sign", w: 44 },
  { k: "amount", l: "Amount ₹", w: 34 },
] as const;

const mm = (n: number) => `${n}mm`;
/** The note prints in red so it stands out on a colour printer (dark enough to read in black and white too). */
const NOTE_RED = "#c40000";

function Box({ x, y, w, h, style, className, children }: { x: number; y: number; w: number; h?: number; style?: CSSProperties; className?: string; children?: ReactNode }) {
  return (
    <div className={className} style={{ position: "absolute", left: mm(x), top: mm(y), width: mm(w), height: h === undefined ? undefined : mm(h), ...style }}>
      {children}
    </div>
  );
}

export function BookPage({ sheet, part, apartmentName, due }: { sheet: BookSheet; part: PrintPart; apartmentName: string; due: number }) {
  // The part that is NOT being printed stays in the layout but is invisible on paper
  // (shown faintly on screen so you can see where things will land).
  const namesCls = part === "expenses" ? "book-hide" : "";
  const expCls = part === "names" ? "book-hide" : "";
  const n = Math.max(1, sheet.rows.length);
  const rowH = Math.min(9.5, ROWS_H / n);
  const totalY = TABLE_Y + HEAD_H + n * rowH;
  const nameSize = Math.min(3.9, rowH * 0.45);

  return (
    <div className="book-page" style={{ position: "relative", width: mm(W), height: "296mm", background: "#fff", color: "#000", overflow: "hidden", fontFamily: "Arial, 'Noto Sans Telugu', sans-serif" }}>
      {/* ---------- pass 1: header, rows, empty box, footer ---------- */}
      <div className={namesCls}>
        <Box x={X} y={9} w={CW} style={{ textAlign: "center" }}>
          <div style={{ fontSize: "5.2mm", fontWeight: 800, letterSpacing: "0.02em" }}>{apartmentName}</div>
          <div style={{ fontSize: "4.2mm", fontWeight: 700, marginTop: "1mm" }}>Monthly maintenance — {monthLabel(sheet.month)}</div>
        </Box>
        <Box x={X} y={22.5} w={CW / 2} style={{ fontSize: "3.2mm" }}>
          Maintenance: <strong>{inr(due)}</strong> per flat
        </Box>
        <Box x={X + CW / 2} y={22.5} w={CW / 2} style={{ fontSize: "3.2mm", textAlign: "right" }}>
          Page No. <strong style={{ display: "inline-block", minWidth: "14mm", borderBottom: "0.3mm solid #000", textAlign: "center" }}>{sheet.pageNo ?? ""}</strong>
        </Box>

        {/* table */}
        <Box x={X} y={TABLE_Y} w={CW} h={HEAD_H + n * rowH + HEAD_H} style={{ border: "0.4mm solid #000" }} />
        {/* column lines */}
        {COLS.slice(0, -1).reduce<{ x: number; els: ReactNode[] }>(
          (acc, c) => {
            const x = acc.x + c.w;
            acc.els.push(<Box key={c.k} x={x} y={TABLE_Y} w={0} h={HEAD_H + n * rowH} style={{ borderLeft: "0.25mm solid #000" }} />);
            return { x, els: acc.els };
          },
          { x: X, els: [] },
        ).els}
        {/* header row */}
        <Box x={X} y={TABLE_Y} w={CW} h={HEAD_H} style={{ display: "flex", borderBottom: "0.4mm solid #000", background: "#f2f2f2", fontSize: "3.1mm", fontWeight: 700 }}>
          {COLS.map((c) => (
            <div key={c.k} style={{ width: mm(c.w), display: "flex", alignItems: "center", justifyContent: c.k === "name" ? "flex-start" : "center", paddingLeft: c.k === "name" ? "2mm" : 0 }}>
              {c.l}
            </div>
          ))}
        </Box>
        {/* flat rows */}
        {sheet.rows.map((r, i) => (
          <Box
            key={r.flatId}
            x={X}
            y={TABLE_Y + HEAD_H + i * rowH}
            w={CW}
            h={rowH}
            style={{ display: "flex", alignItems: "center", borderBottom: i < n - 1 ? "0.15mm solid #777" : undefined }}
          >
            <div style={{ width: mm(COLS[0].w), textAlign: "center", fontWeight: 800, fontSize: mm(nameSize + 0.2) }}>{r.flatId}</div>
            <div style={{ width: mm(COLS[1].w), paddingLeft: "2mm", fontSize: mm(nameSize), lineHeight: 1.15, overflow: "hidden" }}>{r.name}</div>
          </Box>
        ))}
        {/* total row, filled in by hand */}
        <Box x={X} y={totalY} w={CW} h={HEAD_H} style={{ display: "flex", alignItems: "center", borderTop: "0.4mm solid #000", fontSize: "3.3mm", fontWeight: 700 }}>
          <div style={{ width: mm(CW - COLS[4].w), textAlign: "right", paddingRight: "3mm" }}>Total collected</div>
          <div style={{ width: 0, alignSelf: "stretch", borderLeft: "0.25mm solid #000" }} />
        </Box>

        {/* expenses box: empty frame + title strip */}
        <Box x={X} y={EXP_Y} w={CW} h={EXP_H} style={{ border: "0.4mm solid #000" }} />
        <Box
          x={X}
          y={EXP_Y}
          w={CW}
          h={STRIP_H}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 3mm", borderBottom: "0.4mm solid #000", background: "#f2f2f2", fontSize: "3.2mm", fontWeight: 700 }}
        >
          <span>Expenses</span>
          <span>Balance</span>
        </Box>
        <Box x={X + 110} y={EXP_Y} w={0} h={EXP_H} style={{ borderLeft: "0.25mm solid #000" }} />

        <Box x={X} y={FOOT_Y} w={CW} style={{ display: "flex", justifyContent: "space-between", fontSize: "3.1mm" }}>
          <span>Prepared by: ____________________</span>
          <span>Checked by: ____________________</span>
          <span>Date: ____________</span>
        </Box>
      </div>

      {/* ---------- pass 2: expenses and balance, inside the box ---------- */}
      <div className={expCls}>
        <ExpenseContents sheet={sheet} />
      </div>
    </div>
  );
}

function ExpenseContents({ sheet }: { sheet: BookSheet }) {
  const t = bookTotals(sheet);
  const top = EXP_Y + STRIP_H + 1.5;
  const bottom = EXP_Y + EXP_H - 1.5;

  // Left column: expense lines (a line with a note gets a second, smaller row), then the total.
  const leftW = 110 - 6;
  const weight = (note?: string) => (note ? 1.65 : 1);
  const units = Math.max(1, sheet.expenses.reduce((a, e) => a + weight(e.note), 0));
  const unit = Math.max(3.6, Math.min(6, (bottom - top - 8) / units));
  const fs = Math.min(3.4, unit * 0.62);
  const numW = 24;
  let y = top;
  const placed = sheet.expenses.map((e) => {
    const h = unit * weight(e.note);
    const at = y;
    y += h;
    return { e, y: at, h };
  });
  const listEnd = y;

  // Right column: the balance sum, then notes.
  const rx = X + 110 + 3;
  const rw = CW - 110 - 6;
  const rows: { l: string; v: string; bold?: boolean; line?: boolean; big?: boolean }[] = [];
  if (sheet.collected !== null) rows.push({ l: "Maintenance collected", v: inr(t.collected) });
  for (const l of sheet.income) rows.push({ l: `+ ${l.label}`, v: inr(l.amount) });
  rows.push({ l: "− Total expenses", v: inr(t.spent) });
  rows.push({ l: "This month", v: inr(t.net), bold: true, line: true });
  if (sheet.previousBalance !== null) {
    rows.push({ l: "Previous balance", v: inr(sheet.previousBalance) });
    rows.push({ l: t.closing < 0 ? "Closing (shortage)" : "Closing balance", v: inr(t.closing), bold: true, line: true, big: true });
  }
  const rfs = rows.length > 8 ? 3 : 3.3;
  const rlh = rfs * 1.75;

  return (
    <>
      {placed.map(({ e, y, h }) => (
        <Box key={e.id} x={X + 3} y={y} w={leftW} h={h} style={{ display: "flex", alignItems: "center", fontSize: mm(fs), borderBottom: "0.12mm dotted #888" }}>
          <span style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
            <span style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.label}</span>
            {e.note && (
              <span style={{ display: "block", color: "#333", fontSize: mm(fs * 0.8), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.note}</span>
            )}
          </span>
          <span style={{ width: mm(numW), textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{inr(e.amount)}</span>
        </Box>
      ))}
      <Box
        x={X + 3}
        y={listEnd + 1}
        w={leftW}
        h={6}
        style={{ display: "flex", alignItems: "center", borderTop: "0.35mm solid #000", fontSize: "3.5mm", fontWeight: 800 }}
      >
        <span style={{ flex: 1 }}>Total expenditure</span>
        <span style={{ width: mm(numW), textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{inr(t.spent)}</span>
      </Box>

      {rows.map((r, i) => (
        <Box
          key={i}
          x={rx}
          y={top + i * rlh}
          w={rw}
          h={rlh}
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: mm(r.big ? rfs + 0.4 : rfs),
            fontWeight: r.bold ? 800 : 400,
            borderTop: r.line ? "0.3mm solid #000" : undefined,
          }}
        >
          <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.l}</span>
          <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", paddingLeft: "2mm" }}>{r.v}</span>
        </Box>
      ))}
      {sheet.notes && (
        <Box x={rx} y={top + rows.length * rlh + 2} w={rw} h={bottom - (top + rows.length * rlh + 2)} style={{ fontSize: "3.2mm", lineHeight: 1.35, fontWeight: 600, color: NOTE_RED, overflow: "hidden", whiteSpace: "pre-wrap", printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
          <strong style={{ fontWeight: 800 }}>Note: </strong>
          {sheet.notes}
        </Box>
      )}
    </>
  );
}

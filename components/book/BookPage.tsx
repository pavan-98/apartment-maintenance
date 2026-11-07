"use client";

import type { CSSProperties, ReactNode } from "react";
import { inr } from "@/lib/calc";
import { monthLabel } from "@/lib/dates";
import { bookTotals, type BookSheet } from "@/lib/book";

/**
 * One A4 book page, laid out in millimetres so that every printing pass
 * lands in exactly the same place on the paper.
 *
 *   names    → header, flat rows (sign + amount by hand), empty expenses box, footer
 *   expenses → only the contents of the expenses box (optionally with the not-paid marks)
 *   notPaid  → only the not-paid marks: a red outline round the row and NOT PAID in the amount column
 *   full     → everything (a fresh copy, or a PDF)
 */
export type PrintPart = "names" | "expenses" | "notPaid" | "full";

// Page geometry (mm).
const W = 210;
// A4 only. Wide left margin so a 2-hole punch for an A4 binder (holes ~12 mm
// from the edge) never touches the writing.
const X = 25; // left margin (binding side)
const RIGHT = 10;
const CW = W - X - RIGHT; // 175
const TABLE_Y = 30;
const HEAD_H = 8.5;
const ROWS_H = 147; // space for all flat rows together (15 flats → 9.8 mm each)
const EXP_Y = 199; // top of the expenses box — fixed so every pass lines up
const EXP_H = 84;
const STRIP_H = 7;
const FOOT_Y = 286.5;
const SPLIT = 102; // width of the expenses column inside the box

const COLS = [
  { k: "flat", l: "Flat", w: 14 },
  { k: "name", l: "Name of the owner / tenant", w: 64 },
  { k: "date", l: "Date", w: 22 },
  { k: "sign", l: "Sign", w: 43 },
  { k: "amount", l: "Amount ₹", w: 32 },
] as const;

const mm = (n: number) => `${n}mm`;
/** The note prints in red so it stands out on a colour printer (dark enough to read in black and white too). */
const NOTE_RED = "#c40000";
const EXACT: CSSProperties = { printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" };

function Box({ x, y, w, h, style, className, children }: { x: number; y: number; w: number; h?: number; style?: CSSProperties; className?: string; children?: ReactNode }) {
  return (
    <div className={className} style={{ position: "absolute", left: mm(x), top: mm(y), width: mm(w), height: h === undefined ? undefined : mm(h), ...style }}>
      {children}
    </div>
  );
}

export function BookPage({
  sheet,
  part,
  apartmentName,
  due,
  marks = false,
}: {
  sheet: BookSheet;
  part: PrintPart;
  apartmentName: string;
  due: number;
  /** With part "expenses": also print the not-paid marks in the same pass. */
  marks?: boolean;
}) {
  // The parts that are NOT being printed stay in the layout but are invisible on paper
  // (shown faintly on screen so you can see where things will land).
  const namesCls = part === "names" || part === "full" ? "" : "book-hide";
  const expCls = part === "expenses" || part === "full" ? "" : "book-hide";
  const marksCls = part === "notPaid" || part === "full" || (part === "expenses" && marks) ? "" : "book-hide";
  const n = Math.max(1, sheet.rows.length);
  const rowH = Math.min(11, ROWS_H / n);
  const totalY = TABLE_Y + HEAD_H + n * rowH;
  const nameSize = Math.min(4.2, rowH * 0.42);

  return (
    <div className="book-page" style={{ position: "relative", width: mm(W), height: "296mm", background: "#fff", color: "#000", overflow: "hidden", fontFamily: "Arial, 'Noto Sans Telugu', sans-serif", ...EXACT }}>
      {/* ---------- not-paid marks: a thin red outline (no ink-heavy fill) + NOT PAID ---------- */}
      <div className={marksCls}>
        {sheet.rows.map((r, i) =>
          sheet.notPaid.includes(r.flatId) ? (
            <div key={r.flatId}>
              <Box x={X + 0.8} y={TABLE_Y + HEAD_H + i * rowH + 0.8} w={CW - 1.6} h={rowH - 1.6} style={{ border: `0.7mm solid ${NOTE_RED}`, borderRadius: "0.8mm", boxSizing: "border-box", ...EXACT }} />
              <Box
                x={X + CW - COLS[4].w}
                y={TABLE_Y + HEAD_H + i * rowH}
                w={COLS[4].w}
                h={rowH}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", color: NOTE_RED, fontWeight: 900, fontSize: mm(Math.min(3.8, rowH * 0.42)), letterSpacing: "0.03em", ...EXACT }}
              >
                NOT PAID
              </Box>
            </div>
          ) : null,
        )}
      </div>

      {/* ---------- pass 1: header, rows, empty box, footer ---------- */}
      <div className={namesCls}>
        <Box x={X} y={8} w={CW} style={{ textAlign: "center" }}>
          <div style={{ fontSize: "5.6mm", fontWeight: 800, letterSpacing: "0.02em" }}>{apartmentName}</div>
          <div style={{ fontSize: "4.4mm", fontWeight: 700, marginTop: "1mm" }}>Monthly maintenance — {monthLabel(sheet.month)}</div>
        </Box>
        <Box x={X} y={22} w={CW / 2} style={{ fontSize: "3.4mm" }}>
          Maintenance: <strong>{inr(due)}</strong> per flat
        </Box>
        <Box x={X + CW / 2} y={22} w={CW / 2} style={{ fontSize: "3.4mm", textAlign: "right" }}>
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
        <Box x={X} y={TABLE_Y} w={CW} h={HEAD_H} style={{ display: "flex", borderBottom: "0.4mm solid #000", background: "#f2f2f2", fontSize: "3.3mm", fontWeight: 700 }}>
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
            <NameCell name={r.name} rowH={rowH} size={nameSize} />
          </Box>
        ))}
        {/* total row, filled in by hand */}
        <Box x={X} y={totalY} w={CW} h={HEAD_H} style={{ display: "flex", alignItems: "center", borderTop: "0.4mm solid #000", fontSize: "3.5mm", fontWeight: 700 }}>
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
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 3mm", borderBottom: "0.4mm solid #000", background: "#f2f2f2", fontSize: "3.4mm", fontWeight: 700 }}
        >
          <span>Expenses</span>
          <span>Balance</span>
        </Box>
        <Box x={X + SPLIT} y={EXP_Y} w={0} h={EXP_H} style={{ borderLeft: "0.25mm solid #000" }} />

        <Box x={X} y={FOOT_Y} w={CW} style={{ display: "flex", justifyContent: "space-between", fontSize: "3.2mm" }}>
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

/**
 * A name always stays inside its row, clear of the row lines and of a not-paid outline:
 * long names shrink to one line, very long ones go on two smaller lines.
 */
function NameCell({ name, rowH, size }: { name: string; rowH: number; size: number }) {
  const width = COLS[1].w - 5; // text width inside the cell, clear of the column line
  const room = rowH - 2 * 1.8; // height between the outline strokes
  const charW = 0.6; // generous average character width, as a share of the font size
  const one = Math.min(size, width / Math.max(1, name.length * charW), room / 1.2);
  const two = Math.min(size, (2 * width) / Math.max(1, name.length * charW), room / (2 * 1.15));
  const twoLines = one < 3 && two > one;
  const f = twoLines ? two : one;
  return (
    <div
      style={{
        width: mm(COLS[1].w),
        height: mm(room),
        paddingLeft: "2mm",
        paddingRight: "2.5mm",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        fontSize: mm(f),
        lineHeight: twoLines ? 1.15 : 1.2,
        overflow: "hidden",
        whiteSpace: twoLines ? "normal" : "nowrap",
      }}
    >
      <span style={{ maxHeight: mm(room), overflow: "hidden" }}>{name}</span>
    </div>
  );
}

function ExpenseContents({ sheet }: { sheet: BookSheet }) {
  const t = bookTotals(sheet);
  const top = EXP_Y + STRIP_H + 1.5;
  const bottom = EXP_Y + EXP_H - 1.5;

  // Left column: expense lines, then the total. A line with a note gets a second, smaller
  // row when there is room; on a very full page the note goes on the same line instead.
  // Everything is sized to fit the box, so nothing ever runs past its bottom edge.
  const leftW = SPLIT - 6;
  const avail = bottom - top - 8; // room above the total row
  const noteUnits = sheet.expenses.reduce((a, e) => a + (e.note ? 1.65 : 1), 0);
  const twoLine = avail / Math.max(1, noteUnits) >= 3.6;
  const weight = (note?: string) => (twoLine && note ? 1.65 : 1);
  const units = Math.max(1, sheet.expenses.reduce((a, e) => a + weight(e.note), 0));
  const unit = Math.min(6, avail / units);
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
  const rx = X + SPLIT + 3;
  const rw = CW - SPLIT - 6;
  const rows: { l: string; v: string; bold?: boolean; line?: boolean; big?: boolean }[] = [];
  if (sheet.collected !== null) rows.push({ l: "Maintenance collected", v: inr(t.collected) });
  for (const l of sheet.income) rows.push({ l: `+ ${l.label}`, v: inr(l.amount) });
  rows.push({ l: "− Total expenses", v: inr(t.spent) });
  rows.push({ l: "This month", v: inr(t.net), bold: true, line: true });
  if (sheet.previousBalance !== null) {
    rows.push({ l: "Previous balance", v: inr(sheet.previousBalance) });
    rows.push({ l: t.closing < 0 ? "Closing (shortage)" : "Closing balance", v: inr(t.closing), bold: true, line: true, big: true });
  }
  // Fit the sum (and leave at least 10 mm for a note) inside the box.
  const H = bottom - top;
  const rlh = Math.min(3.3 * 1.75, (H - (sheet.notes ? 12 : 0)) / rows.length);
  const rfs = rlh / 1.75;
  // Shrink the note's text until it fits the space left under the sum.
  const noteY = top + rows.length * rlh + 2;
  const noteH = bottom - noteY;
  const noteText = sheet.notes ? `Note: ${sheet.notes}` : "";
  let nfs = 3.2;
  const linesAt = (f: number) => {
    const perLine = Math.max(1, Math.floor(rw / (f * 0.6)));
    return noteText.split("\n").reduce((a, p) => a + Math.max(1, Math.ceil(p.length / perLine)), 0);
  };
  while (nfs > 2.2 && linesAt(nfs) * nfs * 1.35 > noteH) nfs -= 0.1;
  // Show only whole lines, so a note that is still too long never prints a half-cut line.
  const noteBoxH = Math.max(nfs * 1.35, Math.floor(noteH / (nfs * 1.35)) * nfs * 1.35);

  return (
    <>
      {placed.map(({ e, y, h }) => (
        <Box key={e.id} x={X + 3} y={y} w={leftW} h={h} style={{ display: "flex", alignItems: "center", fontSize: mm(fs), borderBottom: "0.12mm dotted #888" }}>
          {twoLine ? (
            <span style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
              <span style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.label}</span>
              {e.note && (
                <span style={{ display: "block", color: "#333", fontSize: mm(fs * 0.8), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.note}</span>
              )}
            </span>
          ) : (
            <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {e.label}
              {e.note && <span style={{ color: "#333", fontSize: mm(fs * 0.8) }}> ({e.note})</span>}
            </span>
          )}
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
            fontSize: mm(r.big ? rfs * 1.12 : rfs),
            fontWeight: r.bold ? 800 : 400,
            borderTop: r.line ? "0.3mm solid #000" : undefined,
          }}
        >
          <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.l}</span>
          <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", paddingLeft: "2mm" }}>{r.v}</span>
        </Box>
      ))}
      {sheet.notes && (
        <Box x={rx} y={noteY} w={rw} h={noteBoxH} style={{ fontSize: mm(nfs), lineHeight: 1.35, fontWeight: 600, color: NOTE_RED, overflow: "hidden", whiteSpace: "pre-wrap", printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
          <strong style={{ fontWeight: 800 }}>Note: </strong>
          {sheet.notes}
        </Box>
      )}
    </>
  );
}

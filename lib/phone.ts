/**
 * Normalise an Indian (or international) mobile number to "+<country><number>".
 * Accepts "98765 43210", "098765-43210", "+91 98765 43210", "919876543210".
 * Returns null if it doesn't look like a phone number.
 */
export function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let d = trimmed.replace(/\D/g, "");
  if (!trimmed.startsWith("+")) {
    if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
    if (d.length === 10) d = "91" + d;
  }
  if (d.length < 11 || d.length > 15) return null;
  if (d.startsWith("91") && d.length === 12 && !/^91[6-9]/.test(d)) return null;
  return "+" + d;
}

/** "+919876543210" → "+91 98765 43210" */
export function formatPhone(p: string | undefined): string {
  if (!p) return "";
  const m = p.match(/^\+91(\d{5})(\d{5})$/);
  return m ? `+91 ${m[1]} ${m[2]}` : p;
}

/** Digits for a wa.me link. */
export function waDigits(p: string | undefined): string {
  const n = normalizePhone(p ?? "");
  return n ? n.slice(1) : "";
}

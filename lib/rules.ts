import type { DB, Rule, RuleCategory } from "./types";
import type { Lang } from "./i18n";

export const RULE_CATEGORIES: { id: RuleCategory; icon: string; en: string; te: string }[] = [
  { id: "payments", icon: "💰", en: "Maintenance & payments", te: "మెయింటెనెన్స్ & చెల్లింపులు" },
  { id: "cleanliness", icon: "🧹", en: "Cleanliness & garbage", te: "శుభ్రత & చెత్త" },
  { id: "water", icon: "💧", en: "Water", te: "నీరు" },
  { id: "lift", icon: "🛗", en: "Lift", te: "లిఫ్ట్" },
  { id: "parking", icon: "🚗", en: "Parking", te: "పార్కింగ్" },
  { id: "security", icon: "🔒", en: "Security & visitors", te: "భద్రత & సందర్శకులు" },
  { id: "noise", icon: "🔇", en: "Noise & timings", te: "శబ్దం & సమయాలు" },
  { id: "pets", icon: "🐾", en: "Pets", te: "పెంపుడు జంతువులు" },
  { id: "general", icon: "📋", en: "General", te: "సాధారణం" },
  { id: "other", icon: "📌", en: "Other", te: "ఇతరాలు" },
];

export function categoryInfo(id: RuleCategory) {
  return RULE_CATEGORIES.find((c) => c.id === id) ?? RULE_CATEGORIES[RULE_CATEGORIES.length - 2];
}

export function isRuleCategory(v: unknown): v is RuleCategory {
  return RULE_CATEGORIES.some((c) => c.id === v);
}

/** Title in the reader's language, falling back to the other one. */
export function ruleTitle(r: Rule, lang: Lang): string {
  return (lang === "te" ? r.titleTe || r.titleEn : r.titleEn || r.titleTe) || "";
}

export function ruleBody(r: Rule, lang: Lang): string {
  return (lang === "te" ? r.bodyTe || r.bodyEn : r.bodyEn || r.bodyTe) || "";
}

/** Rules grouped by category (in the fixed category order), important rules first. */
export function groupRules(rules: Rule[]) {
  return RULE_CATEGORIES.map((c) => ({
    category: c,
    rules: rules
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.category === c.id)
      .sort((a, b) => Number(!!b.r.important) - Number(!!a.r.important) || a.i - b.i)
      .map(({ r }) => r),
  })).filter((g) => g.rules.length > 0);
}

const ANNOUNCE_DAYS = 30;

/** Rules the admin chose to announce, changed in the last 30 days. */
export function announcedRules(rules: Rule[], now = Date.now()): Rule[] {
  return rules.filter((r) => r.announce && now - new Date(r.updatedAt).getTime() < ANNOUNCE_DAYS * 86400000);
}

export function rulesShareText(db: DB, url: string): string {
  const lines = [`*${db.settings.apartmentName}*`, "📋 *Apartment rules / అపార్ట్‌మెంట్ నియమాలు*", ""];
  let n = 1;
  for (const g of groupRules(db.rules)) {
    lines.push(`${g.category.icon} *${g.category.en} / ${g.category.te}*`);
    for (const r of g.rules) {
      const title = [r.titleEn, r.titleTe].filter(Boolean).join(" / ");
      lines.push(`${n++}. *${title}*${r.important ? " ❗" : ""}`);
      if (r.bodyEn) lines.push(r.bodyEn);
      if (r.bodyTe) lines.push(r.bodyTe);
      lines.push("");
    }
  }
  if (url) lines.push(url);
  return lines.join("\n").trim();
}

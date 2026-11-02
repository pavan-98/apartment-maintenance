import { describe, expect, it } from "vitest";
import { demoDB, freshDB, normalizeDB } from "@/lib/seed";
import { applyAction, publicView } from "@/lib/actions";
import { duesReport } from "@/lib/calc";
import { normalizePhone, formatPhone } from "@/lib/phone";
import { activeNotices, customMessages, noticeMessages, recipients, reminderMessages, flatsMissingPhone } from "@/lib/whatsapp";
import type { DB } from "@/lib/types";

const NOW = new Date("2026-11-02T06:00:00Z");

describe("phone numbers", () => {
  it("normalises common Indian formats", () => {
    expect(normalizePhone("98765 43210")).toBe("+919876543210");
    expect(normalizePhone("098765-43210")).toBe("+919876543210");
    expect(normalizePhone("+91 98765 43210")).toBe("+919876543210");
    expect(normalizePhone("919876543210")).toBe("+919876543210");
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("1234567890")).toBeNull(); // not a mobile number
    expect(formatPhone("+919876543210")).toBe("+91 98765 43210");
  });

  it("saves all numbers at once and rejects bad ones", () => {
    const db = applyAction(
      freshDB(undefined, NOW),
      { type: "contacts.save", contacts: [{ flatId: "101", phone: "9876543210" }, { flatId: "301", phone: "9000000001", residentPhone: "9000000002" }] },
      "A",
      NOW,
    );
    expect(db.flats.find((f) => f.id === "101")?.phone).toBe("+919876543210");
    expect(db.flats.find((f) => f.id === "301")?.residentPhone).toBe("+919000000002");
    expect(() => applyAction(db, { type: "contacts.save", contacts: [{ flatId: "101", phone: "123" }] }, "A", NOW)).toThrow(/valid mobile/);
  });

  it("never sends phone numbers to residents", () => {
    const db = applyAction(freshDB(undefined, NOW), { type: "contacts.save", contacts: [{ flatId: "301", phone: "9000000001", residentPhone: "9000000002" }] }, "A", NOW);
    const f = publicView(db).flats.find((x) => x.id === "301")!;
    expect(f.phone).toBeUndefined();
    expect(f.residentPhone).toBeUndefined();
  });
});

function withManjulaPhones(db: DB): DB {
  const manjula = db.flats.filter((f) => f.owner === "Manjula").map((f) => ({ flatId: f.id, phone: "9000000001" }));
  return applyAction(
    db,
    { type: "contacts.save", contacts: [...manjula, { flatId: "102", phone: "9000000102" }, { flatId: "202", phone: "9000000202" }, { flatId: "301", phone: "9000000001", residentPhone: "9000000301" }] },
    "A",
    NOW,
  );
}

describe("WhatsApp sending", () => {
  it("gives one message per person, even if they own several flats", () => {
    const db = withManjulaPhones(demoDB(NOW));
    const rs = recipients(db, "owners");
    const manjula = rs.find((r) => r.name === "Manjula")!;
    expect(manjula.flats).toEqual(["203", "301", "302", "303", "401", "402", "403"]);
    expect(rs).toHaveLength(3);
    expect(recipients(db, "residents").some((r) => r.name === "Ch. Ravi")).toBe(true);
    expect(flatsMissingPhone(db, "owners").map((f) => f.id)).toContain("101");
  });

  it("reminds only flats with dues, with their amounts", () => {
    const db = withManjulaPhones(demoDB(NOW));
    const msgs = reminderMessages(db, duesReport(db, NOW), { includeUpcoming: false, audience: "owners", lang: "both", url: "https://x" });
    expect(msgs.map((m) => m.recipient.flats[0])).toEqual(["102", "202", "401"]);
    expect(msgs.find((m) => m.recipient.flats[0] === "202")?.text).toContain("₹3,000");
    expect(msgs[0].text).toContain("Ramalakshmi");
    expect(msgs[0].text).toContain("₹1,500");
    expect(msgs[0].text).toContain("నమస్తే");
  });

  it("sends notices and custom messages to everyone with a number", () => {
    const db = withManjulaPhones(demoDB(NOW));
    const n = db.notices[0];
    const msgs = noticeMessages(db, n, { audience: "both", lang: "both", url: "https://x/notice" });
    expect(msgs.length).toBe(4);
    expect(msgs[0].text).toContain(n.titleEn);
    expect(msgs[0].text).toContain(n.titleTe);
    const custom = customMessages(db, "Hi {name}, flat {flat}", "owners");
    expect(custom.find((m) => m.recipient.name === "Manjula")?.text).toBe("Hi Manjula, flat 203, 301, 302, 303, 401, 402, 403");
  });
});

describe("notices", () => {
  it("posts, edits and hides expired notices", () => {
    let db = freshDB(undefined, NOW);
    db = applyAction(db, { type: "notice.add", notice: { titleEn: "Lift off", bodyEn: "Lift under repair", titleTe: "లిఫ్ట్ పనిచేయదు", bodyTe: "మరమ్మతు", popup: true } }, "A", NOW);
    expect(db.notices).toHaveLength(1);
    const id = db.notices[0].id;
    db = applyAction(db, { type: "notice.update", id, notice: { ...db.notices[0], expiresOn: "2026-11-01" } }, "A", NOW);
    expect(activeNotices(db, "2026-11-02")).toHaveLength(0);
    expect(activeNotices(db, "2026-11-01")).toHaveLength(1);
    expect(() => applyAction(db, { type: "notice.add", notice: { titleEn: "", titleTe: "", bodyEn: "x" } }, "A", NOW)).toThrow(/title/);
  });

  it("older saved data without notices still loads", () => {
    const old = { ...freshDB(undefined, NOW) } as Partial<DB>;
    delete old.notices;
    expect(normalizeDB(old as DB).notices).toEqual([]);
  });
});

describe("storage settings", async () => {
  const { findRedisEnv } = await import("@/lib/store");
  it("finds Vercel's Upstash variables with or without a prefix", () => {
    expect(findRedisEnv({ KV_REST_API_URL: "u", KV_REST_API_TOKEN: "t" })).toEqual({ url: "u", token: "t" });
    expect(findRedisEnv({ STORAGE_KV_REST_API_URL: "u2", STORAGE_KV_REST_API_TOKEN: "t2" })).toEqual({ url: "u2", token: "t2" });
    expect(findRedisEnv({ UPSTASH_REDIS_REST_URL: "u3", UPSTASH_REDIS_REST_TOKEN: "t3" })).toEqual({ url: "u3", token: "t3" });
    expect(findRedisEnv({ KV_REST_API_URL: "u" })).toBeNull();
  });
});

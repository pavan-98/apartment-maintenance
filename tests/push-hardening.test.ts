import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseSubscription, subKey, type StoredSub } from "@/lib/push";
import { pushNamespace } from "@/lib/store";
import { ordinal } from "@/lib/dates";
import { withAuditEntry } from "@/lib/actions";
import { demoDB } from "@/lib/seed";
import { splashHtml } from "@/components/Splash";
import type { Notice } from "@/lib/types";

const KEYS = { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" };
const sub = (name: string, extra: Record<string, unknown> = {}, at = "2026-11-01T00:00:00Z") =>
  parseSubscription({ subscription: { endpoint: `https://fcm.googleapis.com/fcm/send/${name}`, keys: KEYS }, lang: "en", ...extra }, new Date(at))!;
const notice = (expiresOn?: string): Notice => ({
  id: "n1",
  titleEn: "Water cut",
  titleTe: "",
  bodyEn: "Today",
  bodyTe: "",
  popupMode: "once",
  expiresOn,
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
});

describe("kept apart from live residents", () => {
  it("uses a separate device list for preview builds", () => {
    expect(pushNamespace({ VERCEL_ENV: "production" })).toBe("prod");
    expect(pushNamespace({ VERCEL_ENV: "preview" })).toBe("preview");
    expect(pushNamespace({})).toBe("dev");
  });
});

describe("small helpers", () => {
  it("writes ordinals", () => {
    expect([1, 2, 3, 4, 10, 11, 12, 13, 15, 21, 22, 23, 28].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "10th", "11th", "12th", "13th", "15th", "21st", "22nd", "23rd", "28th",
    ]);
  });

  it("adds a history entry without touching the records", () => {
    const db = demoDB();
    const next = withAuditEntry(db, "Ravi (manager)", "Notification sent", "Meeting · to 3 devices", new Date("2026-11-07T10:00:00Z"));
    expect(next.audit[0]).toMatchObject({ by: "Ravi (manager)", action: "Notification sent", detail: "Meeting · to 3 devices", at: "2026-11-07T10:00:00.000Z" });
    expect(next.audit).toHaveLength(db.audit.length + 1);
    expect(next.payments).toBe(db.payments);
  });

  it("splash shows the name safely, split like the header", () => {
    const html = splashHtml("Srinivasa Sai Vigneswara Puppala Towers");
    expect(html).toContain('id="splash-lead" class="splash-lead">Srinivasa Sai Vigneswara</p>');
    expect(html).toMatch(/<span[^>]*>Puppala<\/span><span[^>]*>Towers<\/span>/);
    expect(splashHtml("Sunrise Residency")).toContain('class="splash-lead" hidden>');
    const evil = splashHtml('<img src=x onerror="alert(1)"> Towers');
    expect(evil).not.toContain("<img");
    expect(evil).toContain("&#60;img");
  });
});

describe("devices", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "push-h-"));
    vi.stubEnv("DATA_DIR", dir);
    vi.stubEnv("VAPID_PUBLIC_KEY", "pub");
    vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("web-push");
    rmSync(dir, { recursive: true, force: true });
  });

  it("keeps when a device first subscribed, and updates when it was last seen", async () => {
    const { saveSubscription, listDevices } = await import("@/lib/pushSend");
    await saveSubscription(sub("a", { deviceId: "dev-aaaa1111" }, "2026-11-01T00:00:00Z"));
    await saveSubscription(sub("a", { deviceId: "dev-aaaa1111" }, "2026-11-05T00:00:00Z"), true);
    // Even a new subscription from the same browser keeps the first date.
    await saveSubscription(sub("a2", { deviceId: "dev-aaaa1111" }, "2026-11-06T00:00:00Z"), true);
    const { devices } = await listDevices(new Date("2026-11-07T00:00:00Z"));
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({ since: "2026-11-01T00:00:00.000Z", at: "2026-11-06T00:00:00.000Z" });
  });

  it("refuses new devices once the list is full, but still lets known ones check in", async () => {
    const { saveSubscription, TooManyDevices, MAX_DEVICES } = await import("@/lib/pushSend");
    const store = await import("@/lib/store");
    const filler: StoredSub = sub("x");
    for (let i = 0; i < MAX_DEVICES; i++) await store.savePushSubscription(`k${i}`, JSON.stringify({ ...filler, endpoint: `${filler.endpoint}${i}` }));
    await expect(saveSubscription(sub("new-one"))).rejects.toBeInstanceOf(TooManyDevices);
    await store.savePushSubscription(subKey(sub("known").endpoint), JSON.stringify(sub("known")));
    await expect(saveSubscription(sub("known"), true)).resolves.toBe("active");
  }, 20_000);

  it("forgets removed devices that haven't been seen for 90 days", async () => {
    const { saveSubscription, removeDevice, listDevices } = await import("@/lib/pushSend");
    await saveSubscription(sub("old", {}, "2026-01-01T00:00:00Z"));
    await saveSubscription(sub("recent", {}, "2026-10-20T00:00:00Z"));
    await removeDevice(subKey(sub("old").endpoint));
    await removeDevice(subKey(sub("recent").endpoint));
    const { removed } = await listDevices(new Date("2026-11-07T00:00:00Z"));
    expect(removed.map((d) => d.id)).toEqual([subKey(sub("recent").endpoint)]);
  });

  it("records a send's result on the device's latest details", async () => {
    const store = await import("@/lib/store");
    const s = sub("a");
    const id = subKey(s.endpoint);
    vi.doMock("web-push", () => ({
      default: {
        // The device switches to Telugu while the notification is being sent.
        sendNotification: async () => {
          await store.savePushSubscription(id, JSON.stringify({ ...s, lang: "te" }));
          return { statusCode: 201 };
        },
      },
    }));
    const { saveSubscription, sendPush } = await import("@/lib/pushSend");
    await saveSubscription(s);
    await sendPush(() => ({ title: "t", body: "", url: "/", tag: "x" }));
    const saved = JSON.parse((await store.allPushSubscriptions())[id]);
    expect(saved).toMatchObject({ lang: "te", last: { ok: true, status: 201 } });
  });

  it("delivers a notice only while it matters", async () => {
    const { noticeTtl } = await import("@/lib/pushSend");
    const now = new Date("2026-11-07T06:30:00Z"); // 12:00 noon in India
    expect(noticeTtl(notice("2026-11-07"), now)).toBe(12 * 60 * 60 - 1); // until 23:59:59 that day
    expect(noticeTtl(notice("2026-11-06"), now)).toBe(60 * 60); // already past: at least an hour
    expect(noticeTtl(notice("2026-12-31"), now)).toBe(3 * 24 * 60 * 60); // capped at 3 days
    expect(noticeTtl(notice(), now)).toBe(3 * 24 * 60 * 60);
  });

  it("passes the delivery window and a timeout to the push service", async () => {
    const seen: Record<string, unknown>[] = [];
    vi.doMock("web-push", () => ({
      default: {
        sendNotification: async (_s: unknown, _p: string, o: Record<string, unknown>) => {
          seen.push(o);
          return { statusCode: 201 };
        },
      },
    }));
    const { saveSubscription, sendPush } = await import("@/lib/pushSend");
    await saveSubscription(sub("a"));
    await sendPush(() => ({ title: "t", body: "", url: "/", tag: "x" }));
    await sendPush(() => ({ title: "t", body: "", url: "/", tag: "x" }), { ttl: 3600, urgency: "high" });
    expect(seen[0]).toMatchObject({ TTL: 86400, urgency: "normal", timeout: 10000 });
    expect(seen[1]).toMatchObject({ TTL: 3600, urgency: "high" });
  });
});

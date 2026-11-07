import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { isPushEndpoint, noticePayload, parseSubscription, subKey } from "@/lib/push";
import type { Notice } from "@/lib/types";

const notice: Notice = {
  id: "n1",
  titleEn: "Water supply stopped on Sunday",
  titleTe: "ఆదివారం నీటి సరఫరా ఉండదు",
  bodyEn: "Tank cleaning from 9 am to 1 pm.\nPlease store water.",
  bodyTe: "ఉదయం 9 నుండి మధ్యాహ్నం 1 వరకు ట్యాంక్ శుభ్రత.",
  popupMode: "once",
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
};

const sub = (endpoint: string) => ({
  subscription: { endpoint, keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } },
  lang: "te",
});

describe("push subscriptions", () => {
  it("accepts the browser makers' push services only", () => {
    expect(isPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(isPushEndpoint("https://web.push.apple.com/QGx")).toBe(true);
    expect(isPushEndpoint("https://wns2-pn1p.notify.windows.com/w/?token=x")).toBe(true);
    expect(isPushEndpoint("http://fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(isPushEndpoint("https://evil.example.com/fcm.googleapis.com")).toBe(false);
    expect(isPushEndpoint("https://googleapis.com.evil.example/x")).toBe(false);
    expect(isPushEndpoint("https://169.254.169.254/latest")).toBe(false);
    expect(isPushEndpoint(42)).toBe(false);
  });

  it("parses a valid subscription and rejects bad keys", () => {
    const now = new Date("2026-11-07T00:00:00Z");
    const ok = parseSubscription(sub("https://fcm.googleapis.com/fcm/send/abc"), now);
    expect(ok).toMatchObject({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", lang: "te", at: "2026-11-07T00:00:00.000Z" });
    expect(parseSubscription({ ...sub("https://fcm.googleapis.com/x"), lang: "fr" })?.lang).toBe("en");
    const bad = sub("https://fcm.googleapis.com/x");
    bad.subscription.keys.auth = "not base64!";
    expect(parseSubscription(bad)).toBeNull();
    expect(parseSubscription(null)).toBeNull();
    expect(parseSubscription({ subscription: { endpoint: "https://fcm.googleapis.com/x" } })).toBeNull();
  });

  it("uses a stable key per endpoint", () => {
    expect(subKey("https://fcm.googleapis.com/a")).toBe(subKey("https://fcm.googleapis.com/a"));
    expect(subKey("https://fcm.googleapis.com/a")).not.toBe(subKey("https://fcm.googleapis.com/b"));
  });

  it("writes the notification in the resident's language", () => {
    expect(noticePayload(notice, "en")).toEqual({
      title: "📢 Water supply stopped on Sunday",
      body: "Tank cleaning from 9 am to 1 pm. Please store water.",
      url: "/#notices",
      tag: "notice-n1",
    });
    expect(noticePayload(notice, "te").title).toBe("📢 ఆదివారం నీటి సరఫరా ఉండదు");
    // Falls back to the other language, marks important notices, and shortens long text.
    const p = noticePayload({ ...notice, titleTe: "", important: true, bodyEn: "x".repeat(400) }, "te");
    expect(p.title).toBe("❗ Water supply stopped on Sunday");
    expect(noticePayload({ ...notice, bodyEn: "x".repeat(400) }, "en").body).toHaveLength(180);
  });
});

describe("sending", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "push-"));
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

  it("sends to every phone and forgets ones that unsubscribed", async () => {
    const calls: { endpoint: string; payload: string }[] = [];
    vi.doMock("web-push", () => ({
      default: {
        sendNotification: async (s: { endpoint: string }, payload: string) => {
          calls.push({ endpoint: s.endpoint, payload });
          if (s.endpoint.endsWith("/gone")) throw Object.assign(new Error("Gone"), { statusCode: 410 });
          if (s.endpoint.endsWith("/down")) throw Object.assign(new Error("Server error"), { statusCode: 500 });
          return {};
        },
      },
    }));
    const store = await import("@/lib/store");
    const { sendNoticePush } = await import("@/lib/pushSend");
    for (const e of ["ok", "gone", "down"]) {
      const s = parseSubscription(sub(`https://fcm.googleapis.com/fcm/send/${e}`))!;
      await store.savePushSubscription(subKey(s.endpoint), JSON.stringify(s));
    }
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const r = await sendNoticePush(notice);
    errors.mockRestore();
    expect(r).toEqual({ sent: 1, failed: 2, removed: 1 });
    expect(JSON.parse(calls[0].payload).title).toBe("📢 ఆదివారం నీటి సరఫరా ఉండదు");
    const left = (await store.allPushSubscriptions()).map((x) => JSON.parse(x).endpoint);
    expect(left.sort()).toEqual(["https://fcm.googleapis.com/fcm/send/down", "https://fcm.googleapis.com/fcm/send/ok"]);
  });

  it("does nothing without VAPID keys", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    const { sendNoticePush, vapidKeys } = await import("@/lib/pushSend");
    expect(vapidKeys()).toBeNull();
    expect(await sendNoticePush(notice)).toEqual({ sent: 0, failed: 0, removed: 0 });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { deviceLabel, isPushEndpoint, messagePayload, noticePayload, parseMessage, parseSubscription, pushService, subKey } from "@/lib/push";
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

describe("devices and custom messages", () => {
  it("names the device from its browser", () => {
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36")).toBe("Android · Chrome");
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36")).toBe("Android · Samsung Internet");
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toBe("iPhone · Safari");
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0")).toBe("Windows · Edge");
    expect(deviceLabel(null)).toBe("Unknown device");
    expect(pushService("https://web.push.apple.com/x")).toBe("Apple");
    const s = parseSubscription({ ...sub("https://fcm.googleapis.com/x"), installed: true }, new Date(), "Mozilla/5.0 (Linux; Android 14) Chrome/130.0");
    expect(s).toMatchObject({ device: "Android · Chrome", installed: true });
  });

  it("checks an admin's message and writes it per language", () => {
    expect(parseMessage({ bodyEn: "no title" })).toBe("Please give the notification a title (English or Telugu)");
    const m = parseMessage({ titleEn: " Meeting today ", bodyEn: "6 pm, terrace", titleTe: "ఈరోజు మీటింగ్", url: "javascript:alert(1)", important: true });
    expect(m).toMatchObject({ titleEn: "Meeting today", url: "/", important: true });
    if (typeof m === "string") throw new Error(m);
    expect(messagePayload(m, "en", "msg-1")).toEqual({ title: "❗ Meeting today", body: "6 pm, terrace", url: "/", tag: "msg-1" });
    // Telugu title, English body as fallback.
    expect(messagePayload(m, "te", "msg-1")).toMatchObject({ title: "❗ ఈరోజు మీటింగ్", body: "6 pm, terrace" });
    expect(parseMessage({ titleEn: "x", url: "/#notices" })).toMatchObject({ url: "/#notices" });
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
    expect(r).toEqual({ sent: 1, failed: 2, removed: 1, errors: ["500 Server error"] });
    expect(JSON.parse(calls[0].payload).title).toBe("📢 ఆదివారం నీటి సరఫరా ఉండదు");
    const left = Object.values(await store.allPushSubscriptions()).map((x) => JSON.parse(x));
    expect(left.map((x) => x.endpoint).sort()).toEqual(["https://fcm.googleapis.com/fcm/send/down", "https://fcm.googleapis.com/fcm/send/ok"]);
    // Each phone's last result is kept for the admin screen.
    const last = Object.fromEntries(left.map((x) => [x.endpoint.split("/").pop(), x.last]));
    expect(last.ok).toMatchObject({ ok: true });
    expect(last.down).toMatchObject({ ok: false, status: 500 });

    // Sending to chosen phones only.
    calls.length = 0;
    const { sendPush, listDevices } = await import("@/lib/pushSend");
    const okId = subKey("https://fcm.googleapis.com/fcm/send/ok");
    expect(await sendPush(() => ({ title: "t", body: "", url: "/", tag: "test" }), { only: [okId] })).toEqual({ sent: 1, failed: 0, removed: 0 });
    expect(calls.map((c) => c.endpoint)).toEqual(["https://fcm.googleapis.com/fcm/send/ok"]);
    const { devices } = await listDevices();
    expect(devices).toHaveLength(2);
    expect(devices[0]).toMatchObject({ service: "Google", lang: "te" });
    expect(JSON.stringify(devices)).not.toContain("p256dh");
  });

  it("removes a device until an admin adds it back or the resident turns notifications on again", async () => {
    const { saveSubscription, removeDevice, restoreDevice, listDevices, isRemovedDevice, sendPush } = await import("@/lib/pushSend");
    const s = parseSubscription({ ...sub("https://fcm.googleapis.com/fcm/send/removed"), deviceId: "device-r1" })!;
    const id = subKey(s.endpoint);
    await saveSubscription(s);
    expect(await removeDevice(id)).toMatchObject({ id });
    let list = await listDevices();
    expect(list.devices).toHaveLength(0);
    expect(list.removed).toMatchObject([{ id, removedAt: expect.any(String) }]);
    expect(await isRemovedDevice(id)).toBe(true);

    // Nothing is sent to it.
    expect(await sendPush(() => ({ title: "t", body: "", url: "/", tag: "x" }))).toEqual({ sent: 0, failed: 0, removed: 0 });

    // The app re-sending its subscription on a later visit doesn't bring it back, but refreshes it.
    const later = parseSubscription({ ...sub("https://fcm.googleapis.com/fcm/send/removed"), deviceId: "device-r1", lang: "en" }, new Date("2030-01-01T00:00:00Z"))!;
    expect(await saveSubscription(later, true)).toBe("removed");
    list = await listDevices();
    expect(list.devices).toHaveLength(0);
    expect(list.removed[0]).toMatchObject({ lang: "en", at: "2030-01-01T00:00:00.000Z" });

    // Even with a new endpoint from the same browser it stays removed (and listed once).
    const rotated = parseSubscription({ ...sub("https://fcm.googleapis.com/fcm/send/removed-2"), deviceId: "device-r1" })!;
    expect(await saveSubscription(rotated, true)).toBe("removed");
    list = await listDevices();
    expect(list.removed).toHaveLength(1);
    const id2 = subKey(rotated.endpoint);
    expect(list.removed[0].id).toBe(id2);

    // Admin adds it back.
    expect(await restoreDevice(id2)).toMatchObject({ id: id2 });
    list = await listDevices();
    expect(list.devices.map((d) => d.id)).toEqual([id2]);
    expect(list.removed).toHaveLength(0);
    expect(list.devices[0].removedAt).toBeUndefined();

    // Removed again, then the resident turns notifications on themselves: it's back too.
    await removeDevice(id2);
    expect(await saveSubscription(rotated)).toBe("active");
    expect((await listDevices()).removed).toHaveLength(0);
    expect(await restoreDevice(id2)).toBeNull(); // nothing left to add back
  });

  it("lists each device once: a new subscription replaces the old one", async () => {
    const { saveSubscription, subscriberCount, listDevices } = await import("@/lib/pushSend");
    const store = await import("@/lib/store");
    const a = parseSubscription({ ...sub("https://fcm.googleapis.com/fcm/send/old"), deviceId: "device-1234" })!;
    const b = parseSubscription({ ...sub("https://fcm.googleapis.com/fcm/send/new"), deviceId: "device-1234" })!;
    const other = parseSubscription({ ...sub("https://fcm.googleapis.com/fcm/send/other"), deviceId: "device-5678" })!;
    await saveSubscription(a);
    await saveSubscription(other);
    await saveSubscription(b);
    const endpoints = Object.values(await store.allPushSubscriptions()).map((x) => JSON.parse(x).endpoint).sort();
    expect(endpoints).toEqual(["https://fcm.googleapis.com/fcm/send/new", "https://fcm.googleapis.com/fcm/send/other"]);
    // A damaged entry is neither listed nor counted.
    await store.savePushSubscription("broken", "{not json");
    expect(await subscriberCount()).toBe(2);
    expect((await listDevices()).devices).toHaveLength(2);
  });

  it("does not bring back a phone that unsubscribed while sending", async () => {
    const store = await import("@/lib/store");
    await store.savePushSubscription("a", "1");
    await store.removePushSubscriptions(["a"]);
    await store.updatePushSubscriptions({ a: "2" });
    expect(await store.allPushSubscriptions()).toEqual({});
  });

  it("does nothing without VAPID keys", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    const { sendNoticePush, vapidKeys } = await import("@/lib/pushSend");
    expect(vapidKeys()).toBeNull();
    expect(await sendNoticePush(notice)).toEqual({ sent: 0, failed: 0, removed: 0 });
  });
});

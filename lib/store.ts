import { promises as fs } from "node:fs";
import path from "node:path";
import { Redis } from "@upstash/redis";
import type { DB } from "./types";
import { demoDB, normalizeDB } from "./seed";
import { normalizeBook, type BookDB } from "./book";

/**
 * Storage: Upstash Redis when its env vars are present (production on Vercel),
 * otherwise a JSON file in ./data (local development).
 */
interface Backend {
  name: string;
  /** Read a stored document ("db" = the main records, "book" = offline book pages). */
  read<T extends Versioned>(doc: DocName): Promise<{ db: T | null; version: number }>;
  /** Write only if the stored version still equals `expected`. */
  write<T extends Versioned>(doc: DocName, db: T, expected: number): Promise<boolean>;
  putReceipt(id: string, data: string): Promise<void>;
  getReceipt(id: string): Promise<string | null>;
  /**
   * Small key → value tables: "push" = push subscriptions (keyed by a hash of
   * their endpoint), "push-removed" = phones an admin removed (key → date).
   */
  hashSet(table: Table, key: string, value: string): Promise<void>;
  hashDelete(table: Table, keys: string[]): Promise<void>;
  /** Overwrite entries, but only those that still exist (a phone may have unsubscribed meanwhile). */
  hashUpdateExisting(table: Table, entries: Record<string, string>): Promise<void>;
  hashGet(table: Table, key: string): Promise<string | null>;
  hashAll(table: Table): Promise<Record<string, string>>;
}

type DocName = "db" | "book";
type Versioned = { version: number };
const docKey = (doc: DocName) => `apt:${doc}`;
const verKey = (doc: DocName) => `apt:${doc}:version`;
type Table = "push" | "push-removed";
/**
 * Preview deployments share the production database, so devices are kept per
 * environment: a test from a preview build never reaches residents' devices.
 */
export function pushNamespace(env: Record<string, string | undefined> = process.env): string {
  return env.VERCEL_ENV === "production" ? "prod" : env.VERCEL_ENV || "dev";
}
const tableKey = (t: Table) => `apt:${t}:${pushNamespace()}`;

/**
 * Find the Upstash REST credentials. Vercel's Upstash integration adds
 * KV_REST_API_URL / KV_REST_API_TOKEN, optionally with a custom prefix
 * (e.g. STORAGE_KV_REST_API_URL); Upstash's own console uses UPSTASH_REDIS_REST_*.
 */
export function findRedisEnv(env: Record<string, string | undefined> = process.env): { url: string; token: string } | null {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    return { url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN };
  }
  for (const key of Object.keys(env).sort((a, b) => a.length - b.length)) {
    if (!key.endsWith("KV_REST_API_URL") && !key.endsWith("REDIS_REST_URL")) continue;
    const tokenKey = key.replace(/URL$/, "TOKEN");
    const url = env[key];
    const token = env[tokenKey];
    if (url && token) return { url, token };
  }
  return null;
}

function redisBackend(): Backend | null {
  const creds = findRedisEnv();
  if (!creds) return null;
  const { url, token } = creds;
  const redis = new Redis({ url, token, automaticDeserialization: false });
  const CAS = `
    local cur = redis.call('GET', KEYS[2])
    if (cur or '0') ~= ARGV[2] then return 0 end
    redis.call('SET', KEYS[1], ARGV[1])
    redis.call('SET', KEYS[2], ARGV[3])
    return 1`;
  return {
    name: "redis",
    async read<T extends Versioned>(doc: DocName) {
      const [raw, ver] = await Promise.all([redis.get<string>(docKey(doc)), redis.get<string>(verKey(doc))]);
      return { db: raw ? (JSON.parse(raw) as T) : null, version: Number(ver ?? 0) };
    },
    async write(doc, db, expected) {
      const res = await redis.eval(CAS, [docKey(doc), verKey(doc)], [JSON.stringify(db), String(expected), String(expected + 1)]);
      return Number(res) === 1;
    },
    async putReceipt(id, data) {
      await redis.set(`apt:receipt:${id}`, data);
    },
    async getReceipt(id) {
      return (await redis.get<string>(`apt:receipt:${id}`)) ?? null;
    },
    async hashSet(table, key, value) {
      await redis.hset(tableKey(table), { [key]: value });
    },
    async hashDelete(table, keys) {
      if (keys.length) await redis.hdel(tableKey(table), ...keys);
    },
    async hashGet(table, key) {
      const v = await redis.hget<unknown>(tableKey(table), key);
      return v == null ? null : typeof v === "string" ? v : JSON.stringify(v);
    },
    async hashUpdateExisting(table, entries) {
      const flat = Object.entries(entries).flat();
      if (!flat.length) return;
      await redis.eval(
        `for i = 1, #ARGV, 2 do
           if redis.call('HEXISTS', KEYS[1], ARGV[i]) == 1 then redis.call('HSET', KEYS[1], ARGV[i], ARGV[i + 1]) end
         end
         return 1`,
        [tableKey(table)],
        flat,
      );
    },
    async hashAll(table) {
      const all = (await redis.hgetall<Record<string, unknown>>(tableKey(table))) ?? {};
      return Object.fromEntries(Object.entries(all).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
    },
  };
}

function fileBackend(): Backend {
  const dir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  const fileOf = (doc: DocName) => path.join(dir, `${doc}.json`);
  const receipts = path.join(dir, "receipts");
  const tableFile = (t: Table) => path.join(dir, `${t}.json`);
  let lock: Promise<unknown> = Promise.resolve();
  const readTable = async (t: Table): Promise<Record<string, string>> => {
    try {
      return JSON.parse(await fs.readFile(tableFile(t), "utf8"));
    } catch {
      return {};
    }
  };
  const editTable = (t: Table, fn: (all: Record<string, string>) => void) => {
    const run = lock.then(async () => {
      const all = await readTable(t);
      fn(all);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(tableFile(t), JSON.stringify(all, null, 1));
    });
    lock = run.catch(() => undefined);
    return run;
  };
  return {
    name: "file",
    async read<T extends Versioned>(doc: DocName) {
      try {
        const db = JSON.parse(await fs.readFile(fileOf(doc), "utf8")) as T;
        return { db: db as T | null, version: db.version ?? 0 };
      } catch {
        return { db: null as T | null, version: 0 };
      }
    },
    async write(doc, db, expected) {
      const file = fileOf(doc);
      const run = lock.then(async () => {
        const cur = await this.read(doc);
        if (cur.version !== expected) return false;
        await fs.mkdir(dir, { recursive: true });
        const tmp = `${file}.${process.pid}.tmp`;
        await fs.writeFile(tmp, JSON.stringify({ ...db, version: expected + 1 }, null, 1));
        await fs.rename(tmp, file);
        return true;
      });
      lock = run.catch(() => undefined);
      return run;
    },
    async putReceipt(id, data) {
      await fs.mkdir(receipts, { recursive: true });
      await fs.writeFile(path.join(receipts, `${id}.txt`), data);
    },
    async getReceipt(id) {
      try {
        return await fs.readFile(path.join(receipts, `${id}.txt`), "utf8");
      } catch {
        return null;
      }
    },
    hashSet: (t, key, value) =>
      editTable(t, (all) => {
        all[key] = value;
      }),
    hashDelete: (t, keys) =>
      editTable(t, (all) => {
        for (const k of keys) delete all[k];
      }),
    hashUpdateExisting: (t, entries) =>
      editTable(t, (all) => {
        for (const [k, v] of Object.entries(entries)) if (k in all) all[k] = v;
      }),
    async hashGet(t, key) {
      return (await readTable(t))[key] ?? null;
    },
    async hashAll(t) {
      return readTable(t);
    },
  };
}

export class StorageNotConfigured extends Error {
  constructor() {
    super(
      "Database is not connected. In Vercel, open your project → Storage → connect “Upstash for Redis”, then redeploy.",
    );
  }
}

let backend: Backend | null = null;
function getBackend(): Backend {
  if (!backend) {
    const redis = redisBackend();
    // Vercel's file system is read-only, so a database is required there.
    if (!redis && process.env.VERCEL) throw new StorageNotConfigured();
    backend = redis ?? fileBackend();
  }
  return backend;
}

export function storageName(): string {
  try {
    return getBackend().name;
  } catch {
    return "none";
  }
}

/** Read the database, creating it with the September 2026 sample on first run. */
export async function loadDB(): Promise<DB> {
  const b = getBackend();
  const { db, version } = await b.read<DB>("db");
  if (db) return { ...normalizeDB(db), version };
  const seeded = demoDB();
  await b.write("db", { ...seeded, version: 0 }, 0);
  const again = await b.read<DB>("db");
  return again.db ? { ...again.db, version: again.version } : seeded;
}

/** Read-modify-write with optimistic locking; retries if two admins save at once. */
export async function updateDB(fn: (db: DB) => DB): Promise<DB> {
  const b = getBackend();
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await loadDB();
    const next = fn(current);
    const ok = await b.write("db", { ...next, version: current.version + 1 }, current.version);
    if (ok) return { ...next, version: current.version + 1 };
  }
  throw new Error("Could not save — please try again");
}

/* ---------- offline book pages: a separate document from the main records ---------- */

export async function loadBook(): Promise<BookDB> {
  const { db, version } = await getBackend().read<BookDB>("book");
  return { ...normalizeBook(db), version };
}

export async function updateBook(fn: (book: BookDB) => BookDB): Promise<BookDB> {
  const b = getBackend();
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await loadBook();
    const next = fn(current);
    const ok = await b.write("book", { ...next, version: current.version + 1 }, current.version);
    if (ok) return { ...next, version: current.version + 1 };
  }
  throw new Error("Could not save — please try again");
}

export async function saveReceipt(id: string, dataUrl: string) {
  await getBackend().putReceipt(id, dataUrl);
}

export async function readReceipt(id: string) {
  return getBackend().getReceipt(id);
}

/* ---------- push notification subscriptions ---------- */

/**
 * Two tables of subscriptions keyed by a hash of their endpoint:
 * "push" = devices that get notifications, "push-removed" = devices an admin
 * removed (still subscribed in their browser, so they can be added back).
 */
export type PushTable = Table;

export async function pushTableAll(table: PushTable): Promise<Record<string, string>> {
  return getBackend().hashAll(table);
}

export async function pushTableGet(table: PushTable, key: string): Promise<string | null> {
  return getBackend().hashGet(table, key);
}

export async function pushTableSet(table: PushTable, key: string, value: string) {
  await getBackend().hashSet(table, key, value);
}

export async function pushTableDelete(table: PushTable, keys: string[]) {
  await getBackend().hashDelete(table, keys);
}

export async function savePushSubscription(key: string, value: string) {
  await pushTableSet("push", key, value);
}

/** Forget subscriptions (the phone unsubscribed, or the push service says it is gone). */
export async function removePushSubscriptions(keys: string[]) {
  await pushTableDelete("push", keys);
}

export async function updatePushSubscriptions(entries: Record<string, string>) {
  if (Object.keys(entries).length) await getBackend().hashUpdateExisting("push", entries);
}

/** Every active subscription, keyed by its storage key. */
export async function allPushSubscriptions(): Promise<Record<string, string>> {
  return pushTableAll("push");
}

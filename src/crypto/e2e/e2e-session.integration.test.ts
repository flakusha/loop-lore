/**
 * Integration tests for crypto/e2e/e2e-session.ts — server-side session
 * lookup helpers + the full Alice→DB→Bob E2E roundtrip the Phase A ticket
 * calls out:
 *
 *   "Alice encrypts → store in DB → Bob fetches via the server → decrypts
 *    with his stored private key + the message's ephemeralPubKey/chainKey"
 *
 * The DB writes use raw `sql\`...\`` for the e2e_payload / e2e_session_id
 * columns because `generate-db-types.ts` only parses `.addColumn(...)`
 * inside `createTable` / `.alterTable` blocks — not raw `ALTER TABLE`
 * statements. Once the generator learns raw ALTER (or migration 056 is
 * rewritten to use the typed builder), these queries can be typed.
 */

import { Database, } from "bun:sqlite";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { Kysely, sql, } from "kysely";
import type { Migration, } from "kysely/migration";
import { Migrator, } from "kysely/migration";
import { readdirSync, } from "node:fs";
import path from "node:path";

import { createSqliteDialect, } from "../../db";
import type { DB, } from "../../db/schema";
import { decryptMessage, } from "../../frontend/e2e/decrypt-message";
import {
  type EncryptedPayload,
  encryptMessage,
} from "../../frontend/e2e/encrypt-message";
import { createLogger, } from "../../logger";
import {
  ensureActiveSession,
  findActiveSession,
  findSession,
  recordMessageSent,
  revokeSession,
} from "./e2e-session";
import { generateKeyPair, } from "./key-pairs";

const OWNER_USER_ID = "e2e-session-owner-user-1";
const ALICE_ID = "e2e-session-alice";
const BOB_ID = "e2e-session-bob";
const ALICE_USER_ID = "e2e-session-alice-user";
const BOB_USER_ID = "e2e-session-bob-user";
const CHAT_ID = "e2e-session-chat-1";
const ACTOR_IDS = [ALICE_ID, BOB_ID,] as const;
const KEY_STORE_PREFIX = "ll-e2e-privkey-v1";

// ── localStorage shim (Bun test env has none) ─────────────────

if (typeof localStorage === "undefined") {
  const storage = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string,) => storage.get(key,) ?? null,
    setItem: (key: string, value: string,) => void storage.set(key, value,),
    removeItem: (key: string,) => void storage.delete(key,),
    clear: () => storage.clear(),
    key: (i: number,) => Array.from(storage.keys(),)[i] ?? null,
    get length() {
      return storage.size;
    },
  } as Storage;
}

/** */
function buildMigrationProvider() {
  // The migration specifier IS genuinely runtime-selected (readdirSync of
  // src/db/migrations/); a static import would require hardcoding every
  // filename. The only writeable alternative would be a generated barrel,
  // which the project deliberately avoids.
  return {
    async getMigrations(): Promise<Record<string, Migration>> {
      const migrationDir = path.join(__dirname, "..", "..", "db", "migrations",);
      const migrationFiles = readdirSync(migrationDir,)
        .filter((f,) => f.endsWith(".ts",))
        .toSorted((a, b,) => a.localeCompare(b,));
      const migrations: Record<string, Migration> = {};
      for (const f of migrationFiles) {
        const mod = (await import(path.join(migrationDir, f,))) as
          | { default?: Migration }
          | Migration;
        const candidate = "default" in mod && mod.default ? mod.default : (mod as Migration);
        const key = f.endsWith(".ts",) ? f.slice(0, -3,) : f;
        migrations[key] = candidate;
      }
      return migrations;
    },
  };
}

/**
 * @param db
 * @param userId
 */
async function seedUser(db: Kysely<DB>, userId: string,): Promise<void> {
  await db.insertInto("users",).values({
    id: userId,
    username: userId,
    display_name: userId,
    password_hash: "dummy",
  },).execute();
}

/**
 * @param db
 * @param actorId
 * @param userId
 */
async function seedActor(
  db: Kysely<DB>,
  actorId: string,
  userId: string,
): Promise<void> {
  await seedUser(db, userId,);
  await db.insertInto("actors",).values({
    id: actorId,
    actor_type: "user",
    display_name: actorId,
    user_id: userId,
    owner_id: userId,
    agent_type: "none",
    settings: "{}",
    import_spec: "raw",
    data_source_format: "json",
    data_raw: null,
    format_version: 0,
    visibility: "private",
  },).execute();
}

/**
 * @param db
 */
async function seedChat(db: Kysely<DB>,): Promise<void> {
  await db.insertInto("chats",).values({
    id: CHAT_ID,
    created_by: OWNER_USER_ID,
    name: "E2E Session Test Chat",
    type: "direct" as never,
  },).execute();
}

let db: Kysely<DB>;

beforeAll(async () => {
  createLogger({ level: "warn", },);
  const sqlite = new Database(":memory:",);
  sqlite.run("PRAGMA foreign_keys = OFF",);
  db = new Kysely<DB>({ dialect: createSqliteDialect(sqlite,), },);

  const migrator = new Migrator({ db, provider: buildMigrationProvider(), },);
  const { error, } = await migrator.migrateToLatest();
  if (error) { throw new Error(`Migration failed: ${JSON.stringify(error,)}`,); }

  await seedUser(db, OWNER_USER_ID,);
  await seedActor(db, ALICE_ID, ALICE_USER_ID,);
  await seedActor(db, BOB_ID, BOB_USER_ID,);
  await seedChat(db,);
},);

afterAll(async () => {
  await db.destroy();
},);

// ── Helpers ──────────────────────────────────────────────────

/**
 * @param actorId
 */
async function persistKeyPair(actorId: string,): Promise<JsonWebKey> {
  const kp = await generateKeyPair();
  const publicJwk = await crypto.subtle.exportKey("jwk", kp.publicKey,);
  const privateJwk = await crypto.subtle.exportKey("jwk", kp.privateKey,);
  // Match the StoredKeyPair shape that key-store.ts reads on load.
  localStorage.setItem(
    `${KEY_STORE_PREFIX}:${actorId}`,
    JSON.stringify({
      actorId,
      keyPairJwk: { publicKey: publicJwk, privateKey: privateJwk, },
      algorithm: "ECDH-P256",
      createdAt: new Date().toISOString(),
    },),
  );
  return publicJwk;
}

/** */
function buildPubKeyRegistry(): Record<string, JsonWebKey> {
  const reg: Record<string, JsonWebKey> = {};
  for (const actorId of ACTOR_IDS) {
    const raw = localStorage.getItem(`${KEY_STORE_PREFIX}:${actorId}`,);
    if (!raw) { continue; }
    const parsed = JSON.parse(raw,) as { keyPairJwk?: { publicKey?: JsonWebKey } };
    const jwk = parsed.keyPairJwk?.publicKey;
    if (jwk) { reg[actorId] = jwk; }
  }
  return reg;
}

/** */
function bindStubFetch(): void {
  const registry = buildPubKeyRegistry();
  const stub = mock(async (input: RequestInfo | URL,) => {
    const url = typeof input === "string" ? input : input.toString();
    const match = url.match(/\/api\/actors\/([^/]+)\/e2e-public-key$/,);
    if (!match) { throw new Error(`Unexpected fetch in test: ${url}`,); }
    const targetId = match[1];
    const jwk = targetId ? registry[targetId] : undefined;
    if (!jwk) {
      return new Response(JSON.stringify({ error: "not_found", },), {
        status: 404,
        headers: { "content-type": "application/json", },
      },);
    }
    return new Response(JSON.stringify({ publicKeyJwk: jwk, algorithm: "ECDH-P256", },), {
      status: 200,
      headers: { "content-type": "application/json", },
    },);
  },);
  globalThis.fetch = stub as unknown as typeof fetch;
}

beforeEach(() => {
  bindStubFetch();
},);

// ── Tests ────────────────────────────────────────────────────

describe("e2e-session lookup helpers", () => {
  test("ensureActiveSession creates then returns the same row on subsequent calls", async () => {
    const a = await ensureActiveSession({
      database: db,
      senderActorId: ALICE_ID,
      recipientActorId: BOB_ID,
    },);
    expect(a.senderActorId,).toBe(ALICE_ID,);
    expect(a.recipientActorId,).toBe(BOB_ID,);
    expect(a.revokedAt,).toBeNull();

    const b = await ensureActiveSession({
      database: db,
      senderActorId: ALICE_ID,
      recipientActorId: BOB_ID,
    },);
    expect(b.id,).toBe(a.id,);
  });

  test("findActiveSession returns null for a never-touched pair", async () => {
    const r = await findActiveSession({
      database: db,
      senderActorId: BOB_ID,
      recipientActorId: ALICE_ID,
    },);
    expect(r,).toBeNull();
  });

  test("findSession returns null for an unknown id", async () => {
    const r = await findSession({ database: db, sessionId: "does-not-exist", },);
    expect(r,).toBeNull();
  });

  test("recordMessageSent updates last_message_at", async () => {
    const session = await ensureActiveSession({
      database: db,
      senderActorId: ALICE_ID,
      recipientActorId: BOB_ID,
    },);
    expect(session.lastMessageAt,).toBeNull();
    await recordMessageSent({ database: db, sessionId: session.id, },);
    const reread = await findSession({ database: db, sessionId: session.id, },);
    expect(reread?.lastMessageAt,).not.toBeNull();
  });

  test("revokeSession is idempotent and hides the session from findActiveSession", async () => {
    const session = await ensureActiveSession({
      database: db,
      senderActorId: BOB_ID,
      recipientActorId: ALICE_ID,
    },);
    expect(await revokeSession({ database: db, sessionId: session.id, },),).toBe(true,);
    expect(await revokeSession({ database: db, sessionId: session.id, },),).toBe(false,);
    const active = await findActiveSession({
      database: db,
      senderActorId: BOB_ID,
      recipientActorId: ALICE_ID,
    },);
    expect(active,).toBeNull();
  });
});

describe("Alice→DB→Bob E2E roundtrip (Phase A acceptance criterion)", () => {
  test("encrypt on Alice → store ciphertext in DB → Bob fetches & decrypts", async () => {
    await persistKeyPair(ALICE_ID,);
    await persistKeyPair(BOB_ID,);
    // Re-bind stubFetch now that keys are in the key store.
    bindStubFetch();

    const session = await ensureActiveSession({
      database: db,
      senderActorId: ALICE_ID,
      recipientActorId: BOB_ID,
    },);

    const plaintext = "The quick brown fox jumps over the lazy dog.";
    // The encrypt path takes the sender's *current* chain key and outputs
    // the advanced one in payload.chainKey. The decrypt path takes the
    // same starting chain key (the value both sides agreed on before
    // sending). Here we feed the same starting key into both.
    const chainKey = crypto.getRandomValues(new Uint8Array(32,),);
    const payload: EncryptedPayload = await encryptMessage({
      senderActorId: ALICE_ID,
      recipientActorId: BOB_ID,
      plaintext,
      chainKey,
    },);
    expect(payload.ciphertext,).toBeTruthy();
    expect(payload.nonce,).toBeTruthy();
    expect(payload.senderEphPub,).toBeTruthy();
    expect(payload.chainKey,).toBeTruthy();

    const messageId = crypto.randomUUID();
    await db.insertInto("messages",).values({
      id: messageId,
      chat_id: CHAT_ID,
      actor_id: ALICE_ID,
      parent_id: null,
      role: "user",
      content: "",
      key_id: null,
      emotion: null,
      model_id: null,
      provider: null,
    },).execute();
    await sql`UPDATE messages SET e2e_payload = ${
      JSON.stringify(payload,)
    }, e2e_session_id = ${session.id} WHERE id = ${messageId}`.execute(
      db,
    );
    await recordMessageSent({ database: db, sessionId: session.id, },);

    const stored = await sql<{
      e2e_payload: string;
      e2e_session_id: string;
      content: string;
    }>`SELECT e2e_payload, e2e_session_id, content FROM messages WHERE id = ${messageId}`.execute(
      db,
    );
    const row = stored.rows[0];
    expect(row,).toBeDefined();
    expect(row?.e2e_session_id,).toBe(session.id,);
    expect(row?.content,).toBe("",);

    const storedPayload = JSON.parse(row!.e2e_payload,) as EncryptedPayload;
    const decrypt = await decryptMessage({
      recipientActorId: BOB_ID,
      chainKey,
      payload: storedPayload,
    },);
    expect(decrypt.plaintext,).toBe(plaintext,);
    expect(decrypt.nextChainKey.byteLength,).toBe(32,);
  });

  test("tampered ciphertext throws on decrypt (AES-GCM auth-tag mismatch)", async () => {
    await persistKeyPair(ALICE_ID,);
    await persistKeyPair(BOB_ID,);
    bindStubFetch();

    const session = await ensureActiveSession({
      database: db,
      senderActorId: ALICE_ID,
      recipientActorId: BOB_ID,
    },);

    const chainKey = crypto.getRandomValues(new Uint8Array(32,),);
    const payload = await encryptMessage({
      senderActorId: ALICE_ID,
      recipientActorId: BOB_ID,
      plaintext: "secret sauce",
      chainKey,
    },);

    const messageId = crypto.randomUUID();
    await db.insertInto("messages",).values({
      id: messageId,
      chat_id: CHAT_ID,
      actor_id: ALICE_ID,
      parent_id: null,
      role: "user",
      content: "",
      key_id: null,
      emotion: null,
      model_id: null,
      provider: null,
    },).execute();
    await sql`UPDATE messages SET e2e_payload = ${
      JSON.stringify(payload,)
    }, e2e_session_id = ${session.id} WHERE id = ${messageId}`.execute(
      db,
    );

    const bytes = Uint8Array.fromBase64(payload.ciphertext,);
    const idx = Math.min(2, bytes.length - 1,);
    bytes[idx] = (bytes[idx] ?? 0) ^ 0x01;
    const tampered: EncryptedPayload = { ...payload, ciphertext: bytes.toBase64(), };

    await expect(
      decryptMessage({
        recipientActorId: BOB_ID,
        chainKey,
        payload: tampered,
      },),
    ).rejects.toThrow();
  });
});

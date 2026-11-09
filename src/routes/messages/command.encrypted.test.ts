import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { decryptMessageContent, getSmk, } from "../../crypto";
import { initSmk, } from "../../crypto/smk";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { insertCommandSystemMessage, } from "./command";

const SMK_HEX = "d".repeat(64,);

let db: Kysely<DB>;
let sqlite: Database;
let chatId: string;
let actorId: string;
// Only the encryption pipeline fields are read on this path.
const config = {
  encryption: { compressThreshold: 1024, compressAlgorithm: "gzip", },
} as Config;

beforeAll(async () => {
  createLogger({ level: "error", },);
  await initSmk({
    serverEncryptionKey: SMK_HEX,
    required: false,
    compressThreshold: 1024,
    compressAlgorithm: "gzip",
  },);

  ({ db, sqlite, } = await createTestDb());

  const userId = uid();
  actorId = uid();
  await insertUsers(db, "cmd-enc-owner", "Owner", {
    id: userId,
    encryption_secret: "e".repeat(64,),
  } as never,);

  await insertActors(db, "CmdEnc", { id: actorId, user_id: userId, } as never,);
  chatId = await insertChats(db, "Cmd enc chat", userId, {
    id: uid(),
    encryption_level: "standard",
  },);

  const smk = getSmk();
  if (!smk) { throw new Error("SMK not loaded — test setup failed",); }
  const { ensureActorKey, } = await import("../../crypto");
  await ensureActorKey({ database: db, actorId, smk, },);
},);

afterAll(async () => {
  // Disarm SMK so the global never leaks into other suites.
  await initSmk({ required: false, compressThreshold: 1024, compressAlgorithm: "gzip", },);
  await db.destroy();
  sqlite.close();
},);

test("a command system message on a standard chat is sealed and round-trips", async () => {
  const text = "/narrate sealed command output";
  await insertCommandSystemMessage(db, config, chatId, actorId, text,);

  const rows = await db
    .selectFrom("messages",)
    .select(["id", "content", "key_id", "content_plaintext",],)
    .where("chat_id", "=", chatId,)
    .where("actor_id", "=", actorId,)
    .execute();

  expect(rows,).toHaveLength(1,);

  const row = rows[0]!;
  expect(row.key_id,).not.toBeNull();
  // The row carries no plaintext mirror — that is exactly why the write path
  // also indexes blind tokens for it (see src/search/token-store.ts).
  expect(row.content_plaintext,).toBeNull();

  const round = await decryptMessageContent(db, {
    content: row.content,
    content_encoding: "identity",
    key_id: row.key_id,
    chat_id: chatId,
  }, getSmk()!,);

  expect(round,).toBe(text,);
});

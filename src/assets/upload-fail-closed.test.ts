// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * An upload into an encrypted chat must never silently land in public storage.
 *
 * `handleUpload` caught whatever `deriveChatKeyForChat` threw and set
 * `chatKey = null`, so a key-derivation failure (here: a chat id with no
 * `chats` row, which violates the `chat_keys.chat_id` foreign key) downgraded
 * the asset to `encryption_tier: "public"` and still answered 200. The upload
 * is refused with 500 and nothing is written instead.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import type { Config, } from "../config/schema";
import { initSmk, } from "../crypto/smk";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { uid, } from "../utils";
import { handleUpload, } from "./controller";

const VALID_HEX_KEY = "a".repeat(64,);

let db: Kysely<DB>;
let uploadDir: string;
let userId: string;

/**
 * @returns a multipart/form-data POST carrying a small PNG
 */
function uploadRequest(): Request {
  const form = new FormData();
  form.set("file", new File([new Uint8Array([1, 2, 3, 4,],),], "note.png", { type: "image/png", },),);

  return new Request("http://localhost/api/assets", { method: "POST", body: form, },);
}

/**
 * @param chatId - chat id forwarded to handleUpload
 */
async function upload(chatId: string | undefined,) {
  return await handleUpload({
    request: uploadRequest(),
    userId,
    database: db,
    uploadDir,
    maxFileSize: 10_000_000,
    chatId,
    config: {
      encryption: {
        serverEncryptionKey: VALID_HEX_KEY,
        required: false,
        compressThreshold: 128,
        compressAlgorithm: "gzip",
      },
    } as unknown as Config,
  },);
}

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, } = await createTestDb());
  uploadDir = join(tmpdir(), `loop-lore-upload-failclosed-${uid()}`,);
  userId = uid();
  await db
    .insertInto("users",)
    .values({
      id: userId,
      username: `u-${userId}`,
      display_name: "Uploader",
      role: "solo",
      status: "active",
      settings: "{}",
    },)
    .execute();

  await initSmk({
    serverEncryptionKey: VALID_HEX_KEY,
    required: false,
    compressThreshold: 128,
    compressAlgorithm: "gzip",
  },);
},);

afterAll(async () => {
  // Reset the SMK global before tearing down: initSmk flipped
  // isEncryptionEnabled() for this process, and leaving an active key would
  // change behaviour for every later suite sharing the process.
  await initSmk({ required: false, compressThreshold: 128, compressAlgorithm: "gzip", },);
  await db?.destroy();
},);

describe("handleUpload encryption fail-closed", () => {
  test("a chat key derivation failure is a 500, not a public asset", async () => {
    // No `chats` row backs this id, so the chat_keys insert violates its FK
    // and deriveChatKeyForChat throws.
    const missingChatId = uid();

    const res = await upload(missingChatId,);

    expect(res.status,).toBe(500,);
    const rows = await db.selectFrom("assets",).select("id",).where("owner_id", "=", userId,).execute();
    expect(rows,).toHaveLength(0,);
  });

  test("an upload with no chat id still succeeds as a public asset", async () => {
    const res = await upload(undefined,);

    expect(res.status,).toBe(201,);
    const rows = await db.selectFrom("assets",).select("encryption_tier",).where("owner_id", "=", userId,).execute();
    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.encryption_tier,).toBe("public",);
  });
});

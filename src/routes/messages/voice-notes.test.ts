// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { AssetType, } from "../../db/enums-content";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertAssets, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { enrichAttachments, } from "./helpers";
type TestDb = Awaited<ReturnType<typeof createTestDb>>;
interface EnrichedAttachment {
  assetId: string;
  order: number;
  caption: string;
  label: string;
  url: string;
  mimeType: string;
  type: string;
  durationSecs: number;
}
describe("enrichAttachments voice notes", () => {
  let db: Kysely<DB>;
  let sqlite: TestDb["sqlite"];
  let ownerId: string;
  let voiceAsset: string;
  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, sqlite, } = await createTestDb());
    ownerId = uid();
    voiceAsset = uid();
    await insertUsers(db, "owner", "Owner", { id: ownerId, } as never,);
    await insertAssets(db, ownerId, "note.ogg", "audio/ogg", AssetType.Audio, 1024, "/tmp/note.ogg", {
      id: voiceAsset,
      duration_secs: 42.5,
    },);
  },);
  afterAll(async () => {
    await sqlite.close();
  },);
  test("exposes duration and voice-note label for audio", async () => {
    const enriched = (await enrichAttachments(
      db,
      JSON.stringify([{ assetId: voiceAsset, order: 0, caption: "", label: "voice-note", },],),
    )) as unknown as EnrichedAttachment[];
    expect(enriched,).toHaveLength(1,);
    const first = enriched[0]!;
    expect(first.label,).toBe("voice-note",);
    expect(first.durationSecs,).toBe(42.5,);
    expect(first.mimeType,).toBe("audio/ogg",);
    expect(first.type,).toBe("audio",);
    expect(first.url,).toBe(`/api/assets/${voiceAsset}/raw`,);
  });
  test("returns null for empty payloads", async () => {
    expect(await enrichAttachments(db, null,),).toBeNull();
    expect(await enrichAttachments(db, "[]",),).toBeNull();
  });
  test("degrades gracefully for unknown assets", async () => {
    const enriched = (await enrichAttachments(
      db,
      JSON.stringify([{ assetId: uid(), order: 0, caption: "", label: "voice-note", },],),
    )) as unknown as EnrichedAttachment[];
    expect(enriched,).toHaveLength(1,);
    const first = enriched[0]!;
    expect(first.durationSecs,).toBe(0,);
    expect(first.mimeType,).toBe("",);
  });
});

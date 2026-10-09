// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the asset assistant commands: /asset-list, /asset-preview,
 * /asset-search.
 *
 * These are tool-calling handlers, so the load-bearing contract is the
 * RESPONSE SHAPE plus the safe-failure paths: a handler invoked without a DB
 * must answer with a message rather than throw (an exception here would
 * escape into the LLM turn), and a caller without world/asset access must be
 * denied before any rows are read.
 *
 * Two behaviours worth calling out because they look like bugs but are the
 * code's real contract:
 *   - /asset-preview's "Asset not found" branch only fires for an admin-role
 *     caller. `canAccessAsset` returns false for a missing id BEFORE the
 *     lookup, so a normal member sees the DENIED message instead — the
 *     not-found string is deliberately not a membership oracle.
 *   - /asset-list counts the owner's own private assets too: `listAssets`
 *     filters by visibility OR ownership, so an owner sees all three.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { AssetLinkEntity, AssetType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertAssetLinks, insertAssets, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import type { CommandContext, CommandHandler, } from "./registry";
import { getCommand, } from "./registry";

// Side-effect import: the asset handlers register themselves on module load.
import "./assets";

function mustGet(name: string,): CommandHandler {
  const handler = getCommand(name,);
  if (!handler) { throw new Error(`command not registered: ${name}`,); }
  return handler;
}

const assetList = mustGet("asset-list",);
const assetPreview = mustGet("asset-preview",);
const assetSearch = mustGet("asset-search",);

describe("asset commands", () => {
  let db: Kysely<DB>;
  let ownerId: string;
  let otherId: string;
  let worldId: string;
  let privateWorldId: string;
  let imageId: string;
  let audioId: string;
  let spacedAssetId: string;
  let privateAssetId: string;

  const ownerCtx = (overrides?: Partial<CommandContext>,): CommandContext => ({
    chatId: "chat-1",
    db,
    userId: ownerId,
    activeChat: { id: "chat-1", worldId, },
    ...overrides,
  });

  beforeAll(async () => {
    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  beforeEach(async () => {
    for (const table of ["asset_links", "assets", "worlds", "users",] as const) {
      await db.deleteFrom(table,).execute();
    }

    ownerId = `user-${crypto.randomUUID()}`;
    otherId = `user-${crypto.randomUUID()}`;
    await insertUsers(db, `owner-${ownerId}`, "Owner", { id: ownerId, },);
    await insertUsers(db, `other-${otherId}`, "Other", { id: otherId, },);

    worldId = `world-${crypto.randomUUID()}`;
    await insertWorlds(db, ownerId, "Owner World", { id: worldId, },);
    privateWorldId = `world-${crypto.randomUUID()}`;
    await insertWorlds(db, ownerId, "Private World", { id: privateWorldId, visibility: "private", },);

    imageId = await insertAssets(db, ownerId, "castle.png", "image/png", AssetType.Image, 1024, "/tmp/castle.png", {
      visibility: "public",
      alt_text: "A ruined castle",
    },);

    audioId = await insertAssets(db, ownerId, "sword.mp3", "audio/mpeg", AssetType.Audio, 2048, "/tmp/sword.mp3", {
      visibility: "public",
    },);

    spacedAssetId = await insertAssets(
      db,
      ownerId,
      "ruined keep.png",
      "image/png",
      AssetType.Image,
      5,
      "/tmp/keep.png",
      {
        visibility: "public",
      },
    );

    // Owner-private, so `otherId` must not be able to preview it.
    privateAssetId = await insertAssets(
      db,
      ownerId,
      "secret.png",
      "image/png",
      AssetType.Image,
      10,
      "/tmp/secret.png",
      {
        visibility: "private",
      },
    );

    await insertAssetLinks(db, imageId, AssetLinkEntity.Character, "char-1", { label: "avatar", },);
  },);

  // ── registration ──────────────────────────────────────────

  test("all three commands are registered", () => {
    for (const name of ["asset-list", "asset-preview", "asset-search",]) {
      expect(getCommand(name,),).toBeDefined();
    }
  });

  // ── missing-DB safe failure ───────────────────────────────

  test("every command answers instead of throwing when ctx has no db", async () => {
    const noDb: CommandContext = { chatId: "chat-1", userId: ownerId, };
    const cases: Array<[string, CommandHandler, string[],]> = [
      ["asset-list", assetList, [],],
      ["asset-preview", assetPreview, [imageId,],],
      ["asset-search", assetSearch, ["castle",],],
    ];

    for (const [name, handler, args,] of cases) {
      const result = await handler(args, noDb,);
      expect(result.handled, `${name} must handle the command`,).toBe(true,);
      expect(result.systemMessage,).toContain("unavailable",);
      expect(result.systemMessage,).toContain("missing database",);
    }
  });

  // ── /asset-list ───────────────────────────────────────────

  test("asset-list renders every asset the owner may see, with ids", async () => {
    const result = await assetList([], ownerCtx(),);
    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("asset-list",);
    expect(result.systemMessage,).toContain("**castle.png**",);
    expect(result.systemMessage,).toContain(imageId,);
    // owner sees their own private asset too — visibility OR ownership
    expect(result.systemMessage,).toContain("**secret.png**",);
    expect(result.systemMessage,).toContain("**Assets (4/4):**",);
    const payload = result.actionPayload!.assets as Array<{ id: string }>;
    const expected = [audioId, imageId, spacedAssetId, privateAssetId,].sort();
    expect(payload.map((a,) => a.id).sort(),).toEqual(expected,);
  });

  test("asset-list filters by kind", async () => {
    const result = await assetList([AssetType.Audio,], ownerCtx(),);
    expect(result.systemMessage,).toContain("sword.mp3",);
    expect(result.systemMessage,).not.toContain("castle.png",);
    expect(result.systemMessage,).toContain("**Assets (1/",);
  });

  test("asset-list reports an empty result for a kind with no assets", async () => {
    const result = await assetList([AssetType.Video,], ownerCtx(),);
    expect(result.systemMessage,).toBe("No assets found.",);
    expect(result.action,).toBeUndefined();
  });

  test("asset-list rejects an unknown kind and names the valid ones", async () => {
    const result = await assetList(["hologram",], ownerCtx(),);
    expect(result.systemMessage,).toContain("Invalid kind",);
    for (const kind of Object.values(AssetType,)) {
      expect(result.systemMessage,).toContain(kind,);
    }
  });

  test("asset-list denies a caller who cannot access the world", async () => {
    const result = await assetList([], ownerCtx({ userId: otherId, activeChat: { id: "chat-1", worldId, }, },),);
    expect(result.systemMessage,).toContain("**Access denied:**",);
    expect(result.actionPayload,).toBeUndefined();
  });

  test("asset-list denies when the world does not exist at all", async () => {
    const result = await assetList([], ownerCtx({ activeChat: { id: "chat-1", worldId: "no-such-world", }, },),);
    expect(result.systemMessage,).toContain("**Access denied:**",);
  });

  test("asset-list skips the world check entirely when the chat has no world", async () => {
    const result = await assetList([], ownerCtx({ activeChat: undefined, },),);
    expect(result.systemMessage,).toContain("**Assets (",);
  });

  // ── /asset-preview ────────────────────────────────────────

  test("asset-preview shows metadata, alt text and links", async () => {
    const result = await assetPreview([imageId,], ownerCtx(),);
    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("asset-preview",);
    expect(result.systemMessage,).toContain("**Asset:** castle.png",);
    expect(result.systemMessage,).toContain("**Type:** image (image/png)",);
    expect(result.systemMessage,).toContain("**Size:** 1024 bytes",);
    expect(result.systemMessage,).toContain("**Alt:** A ruined castle",);
    expect(result.systemMessage,).toContain("**Links:** character:char-1 (avatar)",);
    const payload = result.actionPayload!;
    expect((payload.asset as { id: string }).id,).toBe(imageId,);
    expect(payload.links,).toHaveLength(1,);
  });

  test("asset-preview shows usage with no args", async () => {
    const result = await assetPreview([], ownerCtx(),);
    expect(result.systemMessage,).toBe("Usage: /asset-preview <asset-id>",);
  });

  test("asset-preview denies a non-owner on a private asset", async () => {
    const result = await assetPreview([privateAssetId,], ownerCtx({ userId: otherId, },),);
    expect(result.systemMessage,).toBe("**Access denied:** cannot preview this asset.",);
    expect(result.actionPayload,).toBeUndefined();
  });

  test("asset-preview denies a missing id rather than confirming it does not exist", async () => {
    // `canAccessAsset` answers false for an unknown id before the fetch runs,
    // so a member gets the denial and the id is not an existence oracle.
    const result = await assetPreview(["ghost-asset",], ownerCtx(),);
    expect(result.systemMessage,).toBe("**Access denied:** cannot preview this asset.",);
  });

  test("asset-preview omits the Alt and Links lines when absent", async () => {
    const result = await assetPreview([audioId,], ownerCtx(),);
    expect(result.systemMessage,).not.toContain("**Alt:**",);
    expect(result.systemMessage,).not.toContain("**Links:**",);
  });

  // ── /asset-search ─────────────────────────────────────────

  test("asset-search returns ranked hits for a matching query", async () => {
    const result = await assetSearch(["castle",], ownerCtx(),);
    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("asset-search",);
    expect(result.systemMessage,).toContain("**Asset Results (",);
    expect(result.systemMessage,).toContain("castle.png",);
    expect(result.actionPayload!.hits,).toBeDefined();
  });

  test("asset-search reports no hits for a non-matching query", async () => {
    const result = await assetSearch(["zzzznothing",], ownerCtx(),);
    expect(result.systemMessage,).toBe('No assets found for "zzzznothing".',);
    expect(result.action,).toBeUndefined();
  });

  test("asset-search shows usage with an empty query", async () => {
    expect((await assetSearch(["  ",], ownerCtx(),)).systemMessage,).toBe("Usage: /asset-search <query>",);
  });

  test("asset-search joins multi-word args into one query", async () => {
    // Args are joined with a space, so ["ruined","keep"] must match the
    // "ruined keep.png" filename — proving the join, not just the first arg.
    const result = await assetSearch(["ruined", "keep",], ownerCtx(),);
    expect(result.systemMessage,).toContain("ruined keep.png",);
  });

  test("asset-search denies a caller who cannot access the world", async () => {
    const result = await assetSearch(
      ["castle",],
      ownerCtx({ userId: otherId, activeChat: { id: "chat-1", worldId: privateWorldId, }, },),
    );

    expect(result.systemMessage,).toContain("**Access denied:** cannot search assets in this world.",);
  });

  test("asset-search skips the world check when the chat has no world", async () => {
    const result = await assetSearch(["castle",], ownerCtx({ activeChat: undefined, },),);
    expect(result.systemMessage,).toContain("castle.png",);
  });

  test("asset-search hides another user's private assets", async () => {
    const result = await assetSearch(["secret",], ownerCtx({ userId: otherId, activeChat: undefined, },),);
    expect(result.systemMessage,).toBe('No assets found for "secret".',);
  });
});

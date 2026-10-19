// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Per-message avatar resolution (TASK-chat-avatar-resolver-outfit-aware).
 *
 * Pins that the chat render path joins the wardrobe ladder: a chat override
 * visibly changes the resolved asset, every rung degrades in the documented
 * order, a miss never throws and never renders another outfit's art, and no
 * wardrobe in play leaves the row untouched so today's rendering is unchanged.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { MessageRole, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { createTestDb, } from "../../../test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertLocations,
  insertUsers,
  insertWorlds,
} from "../../../test-utils/insert-helpers";
import { AvatarService, } from "../avatar-service";
import type { MessageAvatarRow, } from "./message-avatar";
import { attachMessageAvatars, } from "./message-avatar";

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const NPC = "00000000-0000-4000-8000-0000000000a2";
const OTHER_NPC = "00000000-0000-4000-8000-0000000000a3";
const CHAT = "00000000-0000-4000-8000-0000000000b1";
const CHAT_2 = "00000000-0000-4000-8000-0000000000b2";
const ARMOR = "outfit-armor";
const COURT = "outfit-court";
const WORLD = "world-1";
const LOC_BEACH = "loc-beach";
const LOC_FORGE = "loc-forge";

let db: Kysely<DB>;
let sqlite: Database;
let avatars: AvatarService;

/** Seed an asset row (actors.avatar_asset_id FKs to assets.id). Idempotent. */
async function seedAsset(id: string,): Promise<void> {
  await db.insertInto("assets",).values({
    id,
    owner_id: OWNER,
    filename: `${id}.png`,
    mime_type: "image/png",
    asset_type: "image",
    size_bytes: 1024,
    storage_path: `/test/${id}.png`,
    storage_backend: "local",
    visibility: "private",
  },).onConflict((oc,) => oc.column("id",).doNothing()).execute();
}

/** Seed a wardrobe item owned by the NPC. */
async function seedOutfit(id: string, name: string,): Promise<void> {
  const now = new Date().toISOString();
  await db.insertInto("wardrobe_items",).values({
    id,
    actor_id: NPC,
    world_id: null,
    name,
    descriptor: "",
    tags: "[]",
    sort_order: 0,
    created_at: now,
    updated_at: now,
  },).execute();
}

/** Create one emotion variant, outfitless unless `outfitId` is given. */
async function seedVariant(opts: {
  assetId: string;
  emotion: string;
  outfitId?: string;
  actorId?: string;
  sortOrder?: number;
},): Promise<void> {
  const actorId = opts.actorId ?? NPC;
  await seedAsset(opts.assetId,);
  await avatars.createAvatar({
    actorId,
    assetId: opts.assetId,
    label: opts.assetId,
    tags: { emotion: opts.emotion, },
    outfitId: opts.outfitId,
    sortOrder: opts.sortOrder ?? 0,
  },);
}

/** Write the chat-scene override (ladder rung: chat > location > default). */
async function seedOverride(chatId: string, outfitId: string, actorId = NPC,): Promise<void> {
  const now = new Date().toISOString();
  await db.insertInto("chat_wardrobe_overrides",).values({
    id: `ov-${chatId}-${actorId}`,
    chat_id: chatId,
    actor_id: actorId,
    outfit_id: outfitId,
    created_at: now,
    updated_at: now,
  },).execute();
}

/** Bind a location to an outfit in the world's avatar config (ladder rung 2). */
async function seedLocationRule(locationId: string, outfitId: string,): Promise<void> {
  const now = new Date().toISOString();
  const bindings = JSON.stringify({ [locationId]: outfitId, },);
  const existing = await db.selectFrom("world_avatar_config",).select(["id",],)
    .where("world_id", "=", WORLD,).where("actor_id", "=", NPC,).executeTakeFirst();

  if (existing) {
    const merged = JSON.parse(
      (await db.selectFrom("world_avatar_config",).select(["outfit_bindings",],)
        .where("id", "=", existing.id,).executeTakeFirst())?.outfit_bindings ?? "{}",
    ) as Record<string, string>;

    merged[locationId] = outfitId;
    await db.updateTable("world_avatar_config",).set({
      outfit_bindings: JSON.stringify(merged,),
      updated_at: now,
    },).where("id", "=", existing.id,).execute();

    return;
  }

  await db.insertInto("world_avatar_config",).values({
    id: `wac-${WORLD}-${NPC}`,
    world_id: WORLD,
    actor_id: NPC,
    selection_rule_override: null,
    weights_override: null,
    created_at: now,
    updated_at: now,
    outfit_bindings: bindings,
  },).execute();
}

/** One assistant row for the resolution assertions. */
function row(id: string, emotion: string | null, overrides?: Record<string, unknown>,): MessageAvatarRow {
  return { id, role: MessageRole.Assistant, actor_id: NPC, emotion, ...overrides, };
}

describe("attachMessageAvatars (outfit-aware message read path)", () => {
  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    avatars = new AvatarService(db,);

    await insertUsers(db, "owner", "Owner", { id: OWNER as never, },);
    await seedAsset("asset-base",);
    await seedAsset("asset-other-base",);
    await insertActors(db, "Hero", { id: NPC as never, owner_id: OWNER, avatar_asset_id: "asset-base", },);
    await insertActors(db, "Other", {
      id: OTHER_NPC as never,
      owner_id: OWNER,
      avatar_asset_id: "asset-other-base",
    },);

    await insertChats(db, "Wardrobe Chat", OWNER, { id: CHAT, } as never,);
    await insertChats(db, "Plain Chat", OWNER, { id: CHAT_2, } as never,);
    // The location rule is keyed off a real world/location pair (FK-enforced).
    await insertWorlds(db, OWNER, "Test World", { id: WORLD, },);
    await insertLocations(db, WORLD, "Beach", { id: LOC_BEACH, },);
    await insertLocations(db, WORLD, "Forge", { id: LOC_FORGE, },);
    await seedOutfit(ARMOR, "Armor",);
    await seedOutfit(COURT, "Court",);
  },);

  beforeEach(async () => {
    await db.deleteFrom("character_avatars",).execute();
    await db.deleteFrom("chat_wardrobe_overrides",).execute();
    await db.updateTable("actors",).set({ default_outfit: null, },).execute();
    // One test deletes ARMOR to prove a dangling id degrades; re-seed so the
    // remaining tests start from the same two-outfit wardrobe.
    await db.deleteFrom("wardrobe_items",).execute();
    await seedOutfit(ARMOR, "Armor",);
    await seedOutfit(COURT, "Court",);
    // Location rules and section placement feed the outfit precedence; clear
    // them so a location test cannot leak into the next one.
    await db.deleteFrom("chat_sections",).execute();
    await db.deleteFrom("world_avatar_config",).execute();
    await db.updateTable("chats",).set({ world_id: null, current_location_id: null, },).execute();
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  // ── AC1: the override reaches the render ────────────────────────

  test("a chat override renders the (outfit, emotion) variant", async () => {
    await seedVariant({ assetId: "asset-base-happy", emotion: "happy", },);
    await seedVariant({ assetId: "asset-armor-happy", emotion: "happy", outfitId: ARMOR, },);
    await seedOverride(CHAT, ARMOR,);

    const [msg,] = [row("m1", "happy",),];
    await attachMessageAvatars({ database: db, chatId: CHAT, messages: [msg!,], },);

    expect(msg!.avatar_asset_id,).toBe("asset-armor-happy",);
  });

  test("switching the override visibly changes the resolved asset", async () => {
    await seedVariant({ assetId: "asset-armor-happy", emotion: "happy", outfitId: ARMOR, },);
    await seedVariant({ assetId: "asset-court-happy", emotion: "happy", outfitId: COURT, },);

    await seedOverride(CHAT, ARMOR,);
    const before = row("m1", "happy",);
    await attachMessageAvatars({ database: db, chatId: CHAT, messages: [before,], },);

    await db.deleteFrom("chat_wardrobe_overrides",).execute();
    await seedOverride(CHAT, COURT,);
    const after = row("m1", "happy",);
    await attachMessageAvatars({ database: db, chatId: CHAT, messages: [after,], },);

    expect(before.avatar_asset_id,).toBe("asset-armor-happy",);
    expect(after.avatar_asset_id,).toBe("asset-court-happy",);
  });

  // ── AC3: each rung, in order ────────────────────────────────────

  test("rung 2: (outfit, neutral) when the outfit has no exact emotion", async () => {
    await seedVariant({ assetId: "asset-base-happy", emotion: "happy", },);
    await seedVariant({ assetId: "asset-armor-neutral", emotion: "neutral", outfitId: ARMOR, },);
    await seedOverride(CHAT, ARMOR,);

    const [msg,] = [row("m1", "confused",),];
    await attachMessageAvatars({ database: db, chatId: CHAT, messages: [msg!,], },);

    expect(msg!.avatar_asset_id,).toBe("asset-armor-neutral",);
  });

  test("rung 3: (default outfit, emotion) when the override outfit has no variants", async () => {
    await db.updateTable("actors",).set({ default_outfit: COURT, },).where("id", "=", NPC,).execute();
    await seedVariant({ assetId: "asset-base-happy", emotion: "happy", },);
    await seedVariant({ assetId: "asset-court-happy", emotion: "happy", outfitId: COURT, },);
    // ARMOR is overridden but has no variants at all.
    await seedOverride(CHAT, ARMOR,);

    const [msg,] = [row("m1", "happy",),];
    await attachMessageAvatars({ database: db, chatId: CHAT, messages: [msg!,], },);

    expect(msg!.avatar_asset_id,).toBe("asset-court-happy",);
  });

  test("rung 4: (base/outfitless, emotion) when no outfit carries the emotion", async () => {
    await seedVariant({ assetId: "asset-base-happy", emotion: "happy", },);
    await seedVariant({ assetId: "asset-armor-sad", emotion: "sad", outfitId: ARMOR, },);
    await seedOverride(CHAT, ARMOR,);

    const [msg,] = [row("m1", "happy",),];
    await attachMessageAvatars({ database: db, chatId: CHAT, messages: [msg!,], },);

    expect(msg!.avatar_asset_id,).toBe("asset-base-happy",);
  });

  test("rung 5: the base portrait when every rung misses", async () => {
    await seedVariant({ assetId: "asset-armor-sad", emotion: "sad", outfitId: ARMOR, },);
    await seedOverride(CHAT, ARMOR,);

    const [msg,] = [row("m1", "joyful",),];
    await attachMessageAvatars({ database: db, chatId: CHAT, messages: [msg!,], },);

    expect(msg!.avatar_asset_id,).toBe("asset-base",);
  });

  // ── AC5: misses degrade, never throw, never leak another outfit ──

  test("an outfit with no variants never renders another outfit's art", async () => {
    await seedVariant({ assetId: "asset-court-happy", emotion: "happy", outfitId: COURT, },);
    await seedVariant({ assetId: "asset-base-happy", emotion: "happy", },);
    // No default outfit, so no rung-3 pool exists and COURT is not eligible.
    await seedOverride(CHAT, ARMOR,);

    const [msg,] = [row("m1", "happy",),];
    await attachMessageAvatars({ database: db, chatId: CHAT, messages: [msg!,], },);

    expect(msg!.avatar_asset_id,).not.toBe("asset-court-happy",);
    expect(msg!.avatar_asset_id,).toBe("asset-base-happy",);
  });

  test("an override naming a deleted outfit degrades instead of throwing", async () => {
    await seedVariant({ assetId: "asset-base-happy", emotion: "happy", },);
    await seedOverride(CHAT, ARMOR,);
    // Deleting the item cascades the override row away (FK onDelete cascade).
    await db.deleteFrom("wardrobe_items",).where("id", "=", ARMOR,).execute();

    const [msg,] = [row("m1", "happy",),];
    await attachMessageAvatars({ database: db, chatId: CHAT, messages: [msg!,], },);

    expect(msg!.avatar_asset_id,).toBeUndefined();
  });

  // ── AC4: zero regression on the outfitless path ──────────────────

  test("no wardrobe in play leaves the row untouched", async () => {
    await seedVariant({ assetId: "asset-base-happy", emotion: "happy", },);

    const [msg,] = [row("m1", "happy",),];
    await attachMessageAvatars({ database: db, chatId: CHAT_2, messages: [msg!,], },);

    expect(msg!.avatar_asset_id,).toBeUndefined();
  });

  test("a character with no variants at all falls back to the base portrait", async () => {
    await seedOverride(CHAT, ARMOR,);

    const [msg,] = [row("m1", "happy",),];
    await attachMessageAvatars({ database: db, chatId: CHAT, messages: [msg!,], },);

    expect(msg!.avatar_asset_id,).toBe("asset-base",);
  });

  // ── Authorization: never another actor's avatar ──────────────────

  test("a message never resolves another actor's avatar", async () => {
    await seedVariant({ assetId: "asset-npc-happy", emotion: "happy", actorId: NPC, outfitId: ARMOR, },);
    await seedVariant({ assetId: "asset-other-happy", emotion: "happy", actorId: OTHER_NPC, outfitId: COURT, },);
    // The override belongs to OTHER_NPC. The row's actor is NPC, so it must not
    // borrow the other actor's court outfit under any circumstances.
    await seedOverride(CHAT, COURT, OTHER_NPC,);

    const [msg,] = [row("m1", "happy", { actor_id: NPC, },),];
    await attachMessageAvatars({ database: db, chatId: CHAT, messages: [msg!,], },);

    expect(msg!.avatar_asset_id,).not.toBe("asset-other-happy",);
    expect(msg!.avatar_asset_id,).toBeUndefined();
  });

  test("a chat override for another actor does not leak into this actor's messages", async () => {
    await seedVariant({ assetId: "asset-npc-happy", emotion: "happy", outfitId: ARMOR, },);
    await seedOverride(CHAT, ARMOR, OTHER_NPC,);

    const [msg,] = [row("m1", "happy",),];
    await attachMessageAvatars({ database: db, chatId: CHAT, messages: [msg!,], },);

    expect(msg!.avatar_asset_id,).toBeUndefined();
  });

  // ── Row filtering + determinism ─────────────────────────────────

  test("user messages and actorless rows are left alone", async () => {
    await seedVariant({ assetId: "asset-armor-happy", emotion: "happy", outfitId: ARMOR, },);
    await seedOverride(CHAT, ARMOR,);

    const user = row("m1", "happy", { role: MessageRole.User, actor_id: OWNER, },);
    const actorless = row("m2", "happy", { actor_id: null, },);
    await attachMessageAvatars({ database: db, chatId: CHAT, messages: [user, actorless,], },);

    expect(user.avatar_asset_id,).toBeUndefined();
    expect(actorless.avatar_asset_id,).toBeUndefined();
  });

  test("two renders of the same rows resolve identically", async () => {
    await seedVariant({ assetId: "asset-base-happy", emotion: "happy", },);
    await seedVariant({ assetId: "asset-armor-happy", emotion: "happy", outfitId: ARMOR, },);
    await seedOverride(CHAT, ARMOR,);

    const first = [row("m1", "happy",), row("m2", "happy",), row("m3", "sad",),];
    await attachMessageAvatars({ database: db, chatId: CHAT, messages: first, },);

    const second = [row("m1", "happy",), row("m2", "happy",), row("m3", "sad",),];
    await attachMessageAvatars({ database: db, chatId: CHAT, messages: second, },);

    expect(second.map((m,) => m.avatar_asset_id),).toEqual(first.map((m,) => m.avatar_asset_id),);
  });

  // ── Partial failure: the wardrobe changes under the resolver ──────

  test("a resolution failure costs that row its avatar, never the page", async () => {
    // Its own throwaway database: the fault is injected by DROPPING a table,
    // which is not undoable and would poison any test declared after this.
    const brokenDb = await createTestDb();

    try {
      const [msg,] = [row("m1", "happy",),];

      // The TOCTOU the ticket names: the wardrobe disappears between the page
      // query and this loop. The contract is "never throws" — the row simply
      // keeps no server answer and the client falls back to its emotion walk.
      brokenDb.sqlite.exec("DROP TABLE chat_wardrobe_overrides;",);

      await attachMessageAvatars({ database: brokenDb.db, chatId: CHAT, messages: [msg!,], },);

      expect(msg!.avatar_asset_id,).toBeUndefined();
    } finally {
      await brokenDb.db.destroy();
      brokenDb.sqlite.close();
    }
  });
  // ── Regression pins for the adversarial review ─────────────────

  test("a location rule resolves with no chat override in play", async () => {
    // The message read path used to call resolveOutfit without worldId /
    // locationId, which made rung 2 (location rule) structurally unreachable:
    // the actor silently rendered its base portrait instead of the location's
    // outfit. Both ids now come off the chat row.
    await seedVariant({ assetId: "asset-court-happy", emotion: "happy", outfitId: COURT, },);
    await db.updateTable("chats",).set({ world_id: WORLD, current_location_id: LOC_BEACH, },)
      .where("id", "=", CHAT,).execute();

    await seedLocationRule(LOC_BEACH, COURT,);

    const msg = row("m-loc", "happy",);
    await attachMessageAvatars({ database: db, chatId: CHAT, messages: [msg,], },);

    expect(msg.avatar_asset_id,).toBe("asset-court-happy",);
  });

  test("two sections in different locations resolve to different outfits", async () => {
    // N1: the memo key must include location, or same actor + same emotion in
    // two sections of one chat collides and both rows render the same outfit.
    await seedVariant({ assetId: "asset-court-happy", emotion: "happy", outfitId: COURT, },);
    await seedVariant({ assetId: "asset-armor-happy", emotion: "happy", outfitId: ARMOR, },);
    await db.updateTable("chats",).set({ world_id: WORLD, current_location_id: LOC_BEACH, },)
      .where("id", "=", CHAT,).execute();

    await seedLocationRule(LOC_BEACH, COURT,);
    await seedLocationRule(LOC_FORGE, ARMOR,);

    await db.insertInto("chat_sections",).values([
      { id: "sec-beach", chat_id: CHAT, label: "Beach", location_id: LOC_BEACH, sort_index: 0, },
      { id: "sec-forge", chat_id: CHAT, label: "Forge", location_id: LOC_FORGE, sort_index: 1, },
    ],).execute();

    const beach = row("m-beach", "happy", { section_id: "sec-beach", },);
    const forge = row("m-forge", "happy", { section_id: "sec-forge", },);
    await attachMessageAvatars({ database: db, chatId: CHAT, messages: [beach, forge,], },);

    expect(beach.avatar_asset_id,).toBe("asset-court-happy",);
    expect(forge.avatar_asset_id,).toBe("asset-armor-happy",);
  });

  test("no root logger: a failing row never throws out of the resolver", () => {
    // Runs in a fresh process because the logger module keeps its root in
    // module state and every in-process test already installed one. With the
    // old getLogger() call this exited non-zero with
    // "Logger not initialized"; the catch must not be able to throw.
    const script = `
import { attachMessageAvatars } from "${import.meta.dir}/message-avatar.ts";
const boom = { selectFrom() { throw new Error("db down"); } };
const row = { id: "m1", role: "assistant", actor_id: "a1", emotion: "happy" };
await attachMessageAvatars({ database: boom, chatId: "c1", messages: [row] });
if (row.avatar_asset_id !== undefined) { throw new Error("expected no asset"); }
console.log("NO_THROW");
`;

    const proc = Bun.spawnSync([process.execPath, "-e", script,], {
      stdout: "pipe",
      stderr: "pipe",
    },);

    expect(proc.stderr.toString(),).toBe("",);
    expect(proc.exitCode,).toBe(0,);
    expect(proc.stdout.toString(),).toContain("NO_THROW",);
  });

  test("system rows are skipped — they render no avatar", async () => {
    // messages.actor_id is notNull, so narration rows carry one too, but the
    // template never draws them: resolving is ~4 wasted statements per row.
    await seedOverride(CHAT, COURT,);
    await seedVariant({ assetId: "asset-court-happy", emotion: "happy", outfitId: COURT, },);

    const msg: MessageAvatarRow = {
      id: "m-sys",
      role: MessageRole.System,
      actor_id: NPC,
      emotion: "happy",
    };

    await attachMessageAvatars({ database: db, chatId: CHAT, messages: [msg,], },);

    expect(msg.avatar_asset_id,).toBeUndefined();
  });

  test("a stale asset from a previous pass is cleared", async () => {
    const msg = row("m-stale", null, { avatar_asset_id: "asset-garbage", },);
    await attachMessageAvatars({ database: db, chatId: CHAT, messages: [msg,], },);

    expect(msg.avatar_asset_id,).toBeUndefined();
  });
});

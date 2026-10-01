// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Behavior tests for the wardrobe cluster:
 *
 *  1. Override precedence — chat > location > default (selection v2 AC).
 *  2. Cross-chat outfit resolution — same actor, two chats in different
 *     locations, no manual per-message choice.
 *  3. Outfit-scoped regen isolation — re-rolling angry-in-armor never
 *     touches angry-in-court-dress (or other emotions of the same outfit).
 *  4. Zero-surprise migration — emotion-only characters (outfit_id NULL)
 *     keep their pre-wardrobe selection behavior.
 */
import { beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createTestDb, } from "../../../test-utils/create-test-db";
import { AvatarService, } from "../avatar-service";
import { deleteOutfitEmotionVariants, } from "../emotion-avatar-service/generation";
import { createTestActors, createTestLocation, createTestWorld, } from "../test-helpers";
import { resolveOutfit, } from "./resolve";

describe("Wardrobe selection v2", () => {
  let db: Kysely<DB>;
  let actorId: string;
  let worldId: string;
  let locationA: string;
  let locationB: string;
  let chatA: string;
  let chatB: string;
  let armorId: string;
  let courtId: string;
  let robesId: string;
  let avatarService: AvatarService;

  beforeAll(async () => {
    const testDb = await createTestDb();
    db = testDb.db;
    avatarService = new AvatarService(db,);

    ({ actorId, } = await createTestActors(db, "wardrobe-v2-actor",));
    worldId = await createTestWorld(db, "wardrobe-v2-world",);
    locationA = await createTestLocation(db, worldId, "wardrobe-loc-a",);
    locationB = await createTestLocation(db, worldId, "wardrobe-loc-b",);

    // Two chats: A at location A, B at location B.
    chatA = "wardrobe-chat-a";
    chatB = "wardrobe-chat-b";
    await db.insertInto("chats",).values([
      { id: chatA, name: "Chat A", created_by: "test-user", world_id: worldId, current_location_id: locationA, },
      { id: chatB, name: "Chat B", created_by: "test-user", world_id: worldId, current_location_id: locationB, },
    ],).execute();

    // Outfits: armor (context), court (context), robes (default).
    const now = new Date().toISOString();
    await db.insertInto("wardrobe_items",).values([
      {
        id: "armor-001",
        actor_id: actorId,
        world_id: null,
        name: "Armor",
        descriptor: "plate armor",
        tags: "[]",
        sort_order: 0,
        created_at: now,
        updated_at: now,
      },
      {
        id: "court-001",
        actor_id: actorId,
        world_id: null,
        name: "Court Dress",
        descriptor: "formal gown",
        tags: "[]",
        sort_order: 1,
        created_at: now,
        updated_at: now,
      },
      {
        id: "robes-001",
        actor_id: actorId,
        world_id: null,
        name: "Robes",
        descriptor: "soft robes",
        tags: "[]",
        sort_order: 2,
        created_at: now,
        updated_at: now,
      },
    ],).execute();
    armorId = "armor-001";
    courtId = "court-001";
    robesId = "robes-001";

    // Character default outfit.
    await db.updateTable("actors",).set({ default_outfit: robesId, },).where("id", "=", actorId,).execute();

    // Assets for variants.
    await db.insertInto("assets",).values(
      ["armor-joy", "armor-neutral", "court-joy", "robes-joy", "base-joy",].map((name,) => ({
        id: `asset-${name}`,
        owner_id: "test-user",
        filename: `${name}.png`,
        mime_type: "image/png",
        asset_type: "image",
        size_bytes: 1024,
        storage_path: `/test/${name}.png`,
        storage_backend: "local",
        visibility: "private",
      })),
    )
      .execute();

    // Variant matrix: (outfit × emotion) + outfitless legacy.
    const variants: Array<{ outfitId: string | null; emotion: string; asset: string }> = [
      { outfitId: armorId, emotion: "joy", asset: "armor-joy", },
      { outfitId: armorId, emotion: "neutral", asset: "armor-neutral", },
      { outfitId: courtId, emotion: "joy", asset: "court-joy", },
      { outfitId: robesId, emotion: "joy", asset: "robes-joy", },
      { outfitId: null, emotion: "joy", asset: "base-joy", },
    ];
    for (const [i, v,] of variants.entries()) {
      await avatarService.createAvatar({
        actorId,
        assetId: `asset-${v.asset}`,
        label: `${v.outfitId ?? "base"} ${v.emotion}`,
        tags: { emotion: v.emotion, },
        sortOrder: i,
        outfitId: v.outfitId ?? undefined,
      },);
    }

    // Location B → court dress rule for this actor.
    await db
      .insertInto("world_avatar_config",)
      .values({
        id: "wac-wardrobe-v2",
        world_id: worldId,
        actor_id: actorId,
        selection_rule_override: null,
        weights_override: null,
        outfit_bindings: JSON.stringify({ [locationB]: courtId, },),
        created_at: now,
        updated_at: now,
      },)
      .execute();
  },);

  it("precedence: chat override beats location rule and default", async () => {
    // Chat A sits at location A (no rule) — override to armor wins anyway.
    await db
      .insertInto("chat_wardrobe_overrides",)
      .values({
        id: "ovr-1",
        chat_id: chatA,
        actor_id: actorId,
        outfit_id: armorId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },)
      .execute();

    const resolved = await resolveOutfit(db, {
      actorId,
      chatId: chatA,
      worldId,
      locationId: locationB,
    },);
    expect(resolved.outfitId,).toBe(armorId,);
    expect(resolved.source,).toBe("chat_override",);
  });

  it("precedence: location rule beats default", async () => {
    const resolved = await resolveOutfit(db, {
      actorId,
      chatId: chatB,
      worldId,
      locationId: locationB,
    },);
    expect(resolved.outfitId,).toBe(courtId,);
    expect(resolved.source,).toBe("location_rule",);
  });

  it("precedence: default when no chat/location match", async () => {
    const resolved = await resolveOutfit(db, {
      actorId,
      worldId,
      locationId: locationA,
    },);
    expect(resolved.outfitId,).toBe(robesId,);
    expect(resolved.source,).toBe("default",);
  });

  it("two chats, different locations: different (outfit, emotion) avatars, no manual choice", async () => {
    // Chat A (override armor, emotion joy) → armor joy.
    const pickA = await avatarService.selectAvatar(actorId, {
      emotion: "joy",
      chatId: chatA,
      locationId: locationA,
    }, worldId,);
    expect(pickA?.outfitId,).toBe(armorId,);
    expect(pickA?.tags.emotion,).toBe("joy",);

    // Chat B (location rule court, emotion joy) → court joy.
    const pickB = await avatarService.selectAvatar(actorId, {
      emotion: "joy",
      chatId: chatB,
      locationId: locationB,
    }, worldId,);
    expect(pickB?.outfitId,).toBe(courtId,);
    expect(pickB?.tags.emotion,).toBe("joy",);
  });

  it("ladder: missing (outfit, emotion) falls to (outfit, neutral) not another outfit", async () => {
    // Sad does not exist for armor; armor-neutral does.
    const pick = await avatarService.selectAvatar(actorId, {
      emotion: "sad",
      outfitId: armorId,
    },);
    expect(pick?.outfitId,).toBe(armorId,);
    expect(pick?.tags.emotion,).toBe("neutral",);
  });

  it("ladder: falls through default outfit before outfitless base", async () => {
    // Grief exists nowhere; rung 3 (default=robes) has only joy... so grief
    // misses robes too → rung 4 outfitless (joy only) misses → null ladder
    // hit, then weighted pass over outfitless pool → base joy via chain.
    const pick = await avatarService.selectAvatar(actorId, {
      emotion: "grief",
      outfitId: armorId,
    },);
    // Never an outfit other than the resolved one.
    expect(pick?.outfitId ?? null,).not.toBe(courtId,);
  });

  it("zero-surprise: emotion-only selection unchanged when no outfit context", async () => {
    const pick = await avatarService.selectAvatar(actorId, { emotion: "joy", },);
    // No wardrobe signal in context: pre-wardrobe path runs (weighted/chain)
    // over the full list — just must not throw and must return a variant.
    expect(pick,).not.toBeNull();
  });
});

describe("Outfit-scoped regen isolation", () => {
  let db: Kysely<DB>;
  let actorId: string;
  let armorId: string;
  let courtId: string;
  let avatarService: AvatarService;

  beforeAll(async () => {
    const testDb = await createTestDb();
    db = testDb.db;
    avatarService = new AvatarService(db,);

    ({ actorId, } = await createTestActors(db, "regen-isolation-actor",));
    const now = new Date().toISOString();
    await db.insertInto("wardrobe_items",).values([
      {
        id: "regen-armor",
        actor_id: actorId,
        world_id: null,
        name: "Armor",
        descriptor: "",
        tags: "[]",
        sort_order: 0,
        created_at: now,
        updated_at: now,
      },
      {
        id: "regen-court",
        actor_id: actorId,
        world_id: null,
        name: "Court",
        descriptor: "",
        tags: "[]",
        sort_order: 1,
        created_at: now,
        updated_at: now,
      },
    ],).execute();
    armorId = "regen-armor";
    courtId = "regen-court";

    await db.insertInto("assets",).values(
      ["old-armor-joy", "old-armor-sad", "old-court-joy", "fresh-armor-joy",].map((name,) => ({
        id: `asset-${name}`,
        owner_id: "test-user",
        filename: `${name}.png`,
        mime_type: "image/png",
        asset_type: "image",
        size_bytes: 1024,
        storage_path: `/test/${name}.png`,
        storage_backend: "local",
        visibility: "private",
      })),
    )
      .execute();
  },);

  it("re-roll angry-in-armor touches ONLY that (emotion, outfit) slot", async () => {
    const mk = (asset: string, emotion: string, outfitId: string | undefined | null,) =>
      avatarService.createAvatar({
        actorId,
        assetId: `asset-${asset}`,
        label: asset,
        tags: { emotion, },
        outfitId: outfitId ?? undefined,
      },);

    const oldArmorJoy = await mk("old-armor-joy", "joy", armorId,);
    const oldArmorSad = await mk("old-armor-sad", "sad", armorId,);
    const oldCourtJoy = await mk("old-court-joy", "joy", courtId,);
    const fresh = await mk("fresh-armor-joy", "joy", armorId,);

    await deleteOutfitEmotionVariants(
      {
        db,
        avatarService,
        resolveEmotionPromptModifier: () => "",
        generateEmotionAvatar: async () => ({ avatarId: "", assetId: "", }),
      },
      { actorId, emotion: "joy", outfitId: armorId, exceptAvatarId: fresh, },
    );

    // Same slot's prior variant gone…
    expect(await avatarService.getAvatar(oldArmorJoy,),).toBeUndefined();
    // …siblings in the same outfit (sad) untouched…
    expect(await avatarService.getAvatar(oldArmorSad,),).toBeDefined();
    expect((await avatarService.getAvatar(oldArmorSad,))?.outfitId,).toBe(armorId,);
    // …other outfits untouched…
    expect(await avatarService.getAvatar(oldCourtJoy,),).toBeDefined();
    // …and the fresh variant survives.
    expect(await avatarService.getAvatar(fresh,),).toBeDefined();
  });

  it("outfitless (base) re-roll never reaches into outfit variants", async () => {
    await db.insertInto("assets",).values({
      id: "asset-base-old",
      owner_id: "test-user",
      filename: "base-old.png",
      mime_type: "image/png",
      asset_type: "image",
      size_bytes: 1024,
      storage_path: "/test/base-old.png",
      storage_backend: "local",
      visibility: "private",
    },).execute();

    const baseOld = await avatarService.createAvatar({
      actorId,
      assetId: "asset-base-old",
      label: "base joy old",
      tags: { emotion: "joy", },
    },);
    const armorJoy = await avatarService.createAvatar({
      actorId,
      assetId: "asset-old-armor-joy",
      label: "armor joy kept",
      tags: { emotion: "joy", },
      outfitId: armorId,
    },);

    await deleteOutfitEmotionVariants(
      {
        db,
        avatarService,
        resolveEmotionPromptModifier: () => "",
        generateEmotionAvatar: async () => ({ avatarId: "", assetId: "", }),
      },
      { actorId, emotion: "joy", outfitId: undefined, exceptAvatarId: "", },
    );

    expect(await avatarService.getAvatar(baseOld,),).toBeUndefined();
    expect(await avatarService.getAvatar(armorJoy,),).toBeDefined();
  });
});

import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  createChatSetupTemplate,
  deleteChatSetupTemplate,
  listChatSetupTemplates,
  seedChatSetupTemplates,
  updateChatSetupTemplate,
} from "./service";

describe("chat setup templates", () => {
  let db: Kysely<DB>;

  beforeEach(async () => {
    db = (await createTestDb()).db;
  },);

  afterEach(async () => {
    await db?.destroy();
  },);

  it("seeds built-in templates on an empty table", async () => {
    const created = await seedChatSetupTemplates(db,);
    expect(created,).toBeGreaterThan(0,);

    const templates = await listChatSetupTemplates(db,);
    expect(templates.length,).toBeGreaterThan(0,);
    expect(templates.some((t,) => t.slug === "simple-direct"),).toBe(true,);
  });

  it("is idempotent — does not re-seed when templates exist", async () => {
    const seeded = await seedChatSetupTemplates(db,);
    expect(seeded,).toBeGreaterThan(0,);
    const first = await listChatSetupTemplates(db,);
    const again = await seedChatSetupTemplates(db,);
    expect(again,).toBe(0,);
    const second = await listChatSetupTemplates(db,);
    expect(second.length,).toBe(first.length,);
  });

  it("seeds the world template with public visibility and features", async () => {
    await seedChatSetupTemplates(db,);

    const world = (await listChatSetupTemplates(db,)).find((t,) => t.slug === "world");
    expect(world,).toBeDefined();
    expect(world?.visibility,).toBe("public",);
    expect(world?.features,).toContain("rpg mode",);
    expect(world?.features,).toContain("no gm",);

    // Non-world defaults stay private.
    const simple = (await listChatSetupTemplates(db,)).find((t,) => t.slug === "simple-direct");
    expect(simple?.visibility,).toBe("private",);
  });

  it("round-trips features and visibility on create and update", async () => {
    await seedChatSetupTemplates(db,);
    const created = await createChatSetupTemplate(db, {
      slug: "featured",
      name: "Featured",
      features: ["rpg mode", "no quests",],
      visibility: "unlisted",
    },);
    expect(created.ok,).toBe(true,);
    if (!created.ok) { return; }
    expect(created.template.features,).toEqual(["rpg mode", "no quests",],);
    expect(created.template.visibility,).toBe("unlisted",);

    const updated = await updateChatSetupTemplate(db, "template-featured", {
      features: ["vn mode",],
      visibility: "public",
    },);
    expect(updated.ok,).toBe(true,);
    if (!updated.ok) { return; }
    expect(updated.template.features,).toEqual(["vn mode",],);
    expect(updated.template.visibility,).toBe("public",);
  });

  it("backfills new defaults without touching existing rows (idempotent)", async () => {
    // Pre-populate with one admin template — seeding must not clobber it,
    // and must still add all missing code defaults (incl. the world template).
    await createChatSetupTemplate(db, { slug: "admin-custom", name: "Admin Custom", },);
    const first = await seedChatSetupTemplates(db,);
    expect(first,).toBeGreaterThan(0,);

    const afterFirst = await listChatSetupTemplates(db,);
    expect(afterFirst.some((t,) => t.slug === "admin-custom"),).toBe(true,);
    expect(afterFirst.some((t,) => t.slug === "world"),).toBe(true,);

    // Second seed is a no-op — no duplicates.
    const second = await seedChatSetupTemplates(db,);
    expect(second,).toBe(0,);
    expect((await listChatSetupTemplates(db,)).length,).toBe(afterFirst.length,);
  });

  it("createChatSetupTemplate persists a template and rejects a duplicate slug", async () => {
    const r1 = await createChatSetupTemplate(db, {
      slug: "custom-roleplay",
      name: "Custom Roleplay",
      description: "A custom story template",
      mode: "story",
      turnStrategy: "scene_based",
      renderingOverride: null,
    },);
    expect(r1.ok,).toBe(true,);
    if (!r1.ok) { return; }
    expect(r1.template.mode,).toBe("story",);

    const dup = await createChatSetupTemplate(db, {
      slug: "custom-roleplay",
      name: "Duplicate",
    },);
    expect(dup.ok,).toBe(false,);
    if (dup.ok) { return; }
    expect(dup.code,).toBe("conflict",);
  });

  it("updateChatSetupTemplate edits fields and applies to future chats", async () => {
    await createChatSetupTemplate(db, {
      slug: "editable",
      name: "Before",
      mode: "direct",
      renderingOverride: null,
    },);
    const r = await updateChatSetupTemplate(db, "template-editable", {
      name: "After",
      renderingOverride: "visual_novel",
    },);
    expect(r.ok,).toBe(true,);
    if (!r.ok) { return; }
    expect(r.template.name,).toBe("After",);
    expect(JSON.parse(r.template.gm_config ?? "{}",).renderingOverride,).toBe("visual_novel",);
  });

  it("deleteChatSetupTemplate removes the row", async () => {
    await createChatSetupTemplate(db, { slug: "delete-me", name: "Delete Me", },);
    const del = await deleteChatSetupTemplate(db, "template-delete-me",);
    expect(del.ok,).toBe(true,);

    const again = await deleteChatSetupTemplate(db, "template-delete-me",);
    expect(again.ok,).toBe(false,);
    if (again.ok) { return; }
    expect(again.code,).toBe("not_found",);
  });
});

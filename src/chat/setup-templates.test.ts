import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertChats, insertUsers, } from "../test-utils/insert-helpers";
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

  it("template edits do not retroactively change bound chats (snapshot semantics)", async () => {
    // Ponytail: this is the one missing explicit regression. Chat rows
    // value-copy mode/turn_strategy/gm_config at create time, and the
    // template_id FK is just a lineage pointer — so editing or deleting
    // the template MUST leave bound chats untouched.
    await createChatSetupTemplate(db, {
      slug: "snap",
      name: "Snapshot",
      mode: "direct",
      turnStrategy: "round_robin",
      renderingOverride: null,
    },);
    const ownerId = crypto.randomUUID();
    await insertUsers(db, "snap-user", "Snap User", { id: ownerId, },);
    const chatId = crypto.randomUUID();
    await insertChats(db, "Bound Chat", ownerId, {
      id: chatId,
      type: "direct" as never,
      mode: "direct" as never,
      turn_strategy: "round_robin" as never,
      gm_config: JSON.stringify({ renderingOverride: null, },),
    },);
    // Bind the chat to the template via the FK lineage pointer.
    const tpl = await db.selectFrom("chat_setup_templates",).select("id",).where("slug", "=", "snap",)
      .executeTakeFirst();
    expect(tpl,).not.toBeUndefined();
    await db.updateTable("chats",).set({ template_id: tpl!.id, },).where("id", "=", chatId,).execute();

    const before = await db.selectFrom("chats",).selectAll().where("id", "=", chatId,).executeTakeFirst();
    expect(before?.mode,).toBe("direct",);

    // Edit the template
    const upd = await updateChatSetupTemplate(db, tpl!.id, {
      mode: "story",
      turnStrategy: "scene_based",
    },);
    expect(upd.ok,).toBe(true,);

    const after = await db.selectFrom("chats",).selectAll().where("id", "=", chatId,).executeTakeFirst();
    expect(after?.mode,).toBe("direct",);
    expect(after?.turn_strategy,).toBe("round_robin",);
    expect(after?.template_id,).toBe(tpl!.id,);

    // Delete the template — chat survives, template_id is nulled via FK onDelete set null
    const del = await deleteChatSetupTemplate(db, tpl!.id,);
    expect(del.ok,).toBe(true,);
    const surviving = await db.selectFrom("chats",).selectAll().where("id", "=", chatId,).executeTakeFirst();
    expect(surviving,).not.toBeUndefined();
    expect(surviving?.template_id,).toBeNull();
    expect(surviving?.mode,).toBe("direct",);
  });
});

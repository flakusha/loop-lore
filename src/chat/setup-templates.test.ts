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

  it("createChatSetupTemplate persists a template and rejects a duplicate slug", async () => {
    const r1 = await createChatSetupTemplate(db, {
      slug: "custom-roleplay",
      name: "Custom Roleplay",
      description: "A custom story template",
      mode: "story",
      turnStrategy: "scene_based",
      visualNovel: false,
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
      visualNovel: false,
    },);
    const r = await updateChatSetupTemplate(db, "template-editable", {
      name: "After",
      visualNovel: true,
    },);
    expect(r.ok,).toBe(true,);
    if (!r.ok) { return; }
    expect(r.template.name,).toBe("After",);
    expect(r.template.visual_novel,).toBe(1,);
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

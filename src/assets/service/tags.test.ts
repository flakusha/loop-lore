// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the asset tag service (gallery tagging G7): normalization,
 * scope isolation, global curation ownership, rename propagation, autocomplete
 * vocabulary, and the metadata proposition feed with dismissal persistence.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { AssetType, AssetVisibility, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertAssets, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import {
  dismissProposition,
  proposeTags,
  staticTagPropositionSource,
} from "./tag-propositions";
import {
  addAssetTag,
  deleteAssetTags,
  listAssetTags,
  normalizeTag,
  removeAssetTag,
  renameAssetTag,
  tagVocabulary,
} from "./tags";

let db: Kysely<DB>;
let sqlite: Database;
let ownerId: string;
let viewerId: string;

/** Insert a public image asset owned by `ownerId` and return its id. */
async function seedAsset(opts: { filename?: string; alt_text?: string } = {},): Promise<string> {
  const assetId = uid();
  await insertAssets(db, ownerId, opts.filename ?? "cat.png", "image/png", AssetType.Image, 1024, "/cat.png", {
    id: assetId,
    visibility: AssetVisibility.Public,
    alt_text: opts.alt_text ?? null,
  },);
  return assetId;
}

beforeAll(async () => {
  ({ db, sqlite, } = await createTestDb());
  ownerId = uid();
  viewerId = uid();
  await insertUsers(db, "tag-owner", "Owner", { id: ownerId, } as never,);
  await insertUsers(db, "tag-viewer", "Viewer", { id: viewerId, } as never,);
},);

afterAll(async () => {
  await db.destroy();
  sqlite.close();
},);

beforeEach(async () => {
  // Vocabulary is asset-agnostic; clear both tag tables for determinism.
  await db.deleteFrom("asset_tags",).execute();
  await db.deleteFrom("asset_tag_dismissals",).execute();
},);

describe("normalizeTag", () => {
  test("trims, lowercases, and collapses internal whitespace", () => {
    expect(normalizeTag("  Cozy  Tavern  ",),).toBe("cozy tavern",);
    expect(normalizeTag("ALREADY-LOWERCASE",),).toBe("already-lowercase",);
    expect(normalizeTag("a\tb\n c",),).toBe("a b c",);
  });
});

describe("staticTagPropositionSource", () => {
  test("tokenizes alt_text and extension-stripped filename, deduplicated", () => {
    const tokens = staticTagPropositionSource.propose({
      filename: "cozy tavern.png",
      alt_text: "a warm tavern hall",
    },);
    expect(tokens,).toEqual(["warm", "tavern", "hall", "cozy",],); // single-char "a" dropped
  });
  test("drops single-char tokens", () => {
    const tokens = staticTagPropositionSource.propose({ filename: "a b.png", alt_text: null, },);
    expect(tokens,).toEqual([],);
  });
});

describe("add + list + remove (scope isolation)", () => {
  test("user scope tags are per-owner; global tags visible to all viewers", async () => {
    const assetId = await seedAsset();
    await addAssetTag({ database: db, assetId, tag: "mine", scope: "user", ownerId: viewerId, },);
    await addAssetTag({ database: db, assetId, tag: "shared", scope: "global", ownerId: null, },);

    const ownerTags = await listAssetTags(db, assetId, ownerId,);
    const viewerTags = await listAssetTags(db, assetId, viewerId,);

    expect(ownerTags.map((t,) => t.tag),).toEqual(["shared",],);
    expect(viewerTags.map((t,) => t.tag).sort(),).toEqual(["mine", "shared",],);
  });

  test("dedupes same tag in a scope; remove deletes only matching scope", async () => {
    const assetId = await seedAsset();
    const first = await addAssetTag({ database: db, assetId, tag: "Dup", scope: "user", ownerId: viewerId, },);
    const second = await addAssetTag({ database: db, assetId, tag: "dup", scope: "user", ownerId: viewerId, },);
    expect(second.id,).toBe(first.id,);

    await removeAssetTag(db, assetId, "dup", "user", viewerId,);
    expect(await listAssetTags(db, assetId, viewerId,),).toEqual([],);
  });
});

describe("renameAssetTag", () => {
  test("renames in place when target absent", async () => {
    const assetId = await seedAsset();
    await addAssetTag({ database: db, assetId, tag: "old", scope: "user", ownerId: viewerId, },);
    const renamed = await renameAssetTag({
      database: db,
      assetId,
      oldTag: "old",
      newTag: "new",
      scope: "user",
      ownerId: viewerId,
    },);
    expect(renamed?.tag,).toBe("new",);
    expect((await listAssetTags(db, assetId, viewerId,)).map((t,) => t.tag),).toEqual(["new",],);
  });

  test("returns null for identical old/new", async () => {
    const assetId = await seedAsset();
    await addAssetTag({ database: db, assetId, tag: "same", scope: "user", ownerId: viewerId, },);
    expect(
      await renameAssetTag({
        database: db,
        assetId,
        oldTag: "same",
        newTag: "SAME",
        scope: "user",
        ownerId: viewerId,
      },),
    ).toBeNull();
  });
});

describe("tagVocabulary", () => {
  test("distinct visible tags, constructible and prefix-filtered", async () => {
    const assetId = await seedAsset();
    await addAssetTag({ database: db, assetId, tag: "tavern", scope: "global", ownerId: null, },);
    await addAssetTag({ database: db, assetId, tag: "cellar", scope: "user", ownerId: viewerId, },);
    await addAssetTag({ database: db, assetId, tag: "secret", scope: "user", ownerId: ownerId, },);

    const vocab = await tagVocabulary(db, viewerId,);
    expect(vocab,).toEqual(["cellar", "tavern",],); // owner's user tag excluded
    expect(await tagVocabulary(db, viewerId, "t",),).toEqual(["tavern",],);
  });
});

describe("proposeTags + dismissProposition", () => {
  test("proposes metadata tokens not yet applied; skips applied and dismissed", async () => {
    const assetId = await seedAsset({ filename: "cozy tavern.png", alt_text: "a cozy tavern hall", },);

    // All multi-char tokens; shared tokens tagged with alt_text provenance.
    const initial = await proposeTags(db, assetId, viewerId,);
    expect(initial.map((p,) => p.tag),).toEqual(["cozy", "tavern", "hall",],);
    expect(initial.find((p,) => p.tag === "cozy")?.provenance,).toBe("alt_text",);
    expect(initial.find((p,) => p.tag === "hall")?.provenance,).toBe("alt_text",);

    // Apply "tavern" as a user tag → excluded from next proposal.
    await addAssetTag({ database: db, assetId, tag: "tavern", scope: "user", ownerId: viewerId, },);
    const afterApply = await proposeTags(db, assetId, viewerId,);
    expect(afterApply.map((p,) => p.tag),).toEqual(["cozy", "hall",],);

    // Dismiss "cozy" → excluded thereafter.
    await dismissProposition(db, assetId, "Cozy", viewerId,);
    const afterDismiss = await proposeTags(db, assetId, viewerId,);
    expect(afterDismiss.map((p,) => p.tag),).toEqual(["hall",],);
  });

  test("returns empty for missing asset", async () => {
    expect(await proposeTags(db, uid(), viewerId,),).toEqual([],);
  });
});

describe("deleteAssetTags", () => {
  test("removes tags and dismissals for an asset", async () => {
    const assetId = await seedAsset(); // filename "cat.png" → candidate "cat"
    await addAssetTag({ database: db, assetId, tag: "x", scope: "global", ownerId: null, },);
    await dismissProposition(db, assetId, "cat", viewerId,);
    expect((await proposeTags(db, assetId, viewerId,)).map((p,) => p.tag),).toEqual([],); // cat dismissed

    await deleteAssetTags(db, assetId,);
    expect(await listAssetTags(db, assetId, viewerId,),).toEqual([],); // tags gone
    expect((await proposeTags(db, assetId, viewerId,)).map((p,) => p.tag),).toEqual(["cat",],); // dismissal gone
  });
});

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertPromptTemplates, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import {
  createChain,
  deleteChain,
  getChain,
  listChains,
  updateChain,
} from "./chain-store";
import type { ChainStep, } from "./chain-types";

const STEPS: ChainStep[] = [
  { id: "s1", templateId: "txt2img", params: { steps: 20, }, },
  { id: "s2", templateId: "upscale", params: { factor: 2, }, },
];

describe("chain-store", () => {
  let db: Kysely<DB>;
  const ownerId = uid();
  const otherId = uid();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await insertUsers(db, `user-${ownerId}`, "Owner", { id: ownerId, } as never,);
    await insertUsers(db, `user-${otherId}`, "Other", { id: otherId, } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("create → get round-trips through prompt_templates", async () => {
    const created = await createChain(db, ownerId, {
      name: "Portrait chain",
      description: "txt2img then upscale",
      steps: STEPS,
    },);
    expect(created.id.length,).toBeGreaterThan(0,);
    expect(created.steps,).toHaveLength(2,);
    expect(created.steps[0]!.params.steps,).toBe(20,);

    const fetched = await getChain(db, created.id, ownerId,);
    expect(fetched,).not.toBeNull();
    expect(fetched!.name,).toBe("Portrait chain",);
    expect(fetched!.steps.map((step,) => step.id),).toEqual(["s1", "s2",],);

    // Persisted under the workflow modality, not a new table.
    const row = await db.selectFrom("prompt_templates",)
      .select(["modality", "payload",],)
      .where("id", "=", created.id,)
      .executeTakeFirstOrThrow();
    expect(row.modality,).toBe("workflow",);
    expect(JSON.parse(row.payload,) as { kind: string; steps: ChainStep[] },).toEqual({
      kind: "chain",
      steps: STEPS,
    },);
  });

  test("listChains returns only chains, only for the owner", async () => {
    const created = await createChain(db, ownerId, { name: "Listed", steps: STEPS, },);
    // A workflow-graph row must never show up as a chain.
    await insertPromptTemplates(db, ownerId, "Graph row", {
      modality: "workflow",
      payload: JSON.stringify({
        body: { "1": { class_type: "SaveImage", inputs: {}, }, },
        category: "txt2img",
        parameters: [],
        requiredNodes: ["SaveImage",],
      },),
    } as never,);

    const mine = await listChains(db, ownerId,);
    expect(mine.some((chain,) => chain.id === created.id),).toBe(true,);
    expect(mine.every((chain,) => chain.name !== "Graph row"),).toBe(true,);

    const theirs = await listChains(db, otherId,);
    expect(theirs.some((chain,) => chain.id === created.id),).toBe(false,);
  });

  test("getChain is owner-scoped", async () => {
    const created = await createChain(db, ownerId, { name: "Private", steps: STEPS, },);
    expect(await getChain(db, created.id, otherId,),).toBeNull();
    expect(await getChain(db, "does-not-exist", ownerId,),).toBeNull();
  });

  test("updateChain patches name and steps", async () => {
    const created = await createChain(db, ownerId, { name: "Before", steps: STEPS, },);
    const updated = await updateChain(db, created.id, ownerId, {
      name: "After",
      steps: [STEPS[0]!,],
    },);
    expect(updated,).not.toBeNull();
    expect(updated!.name,).toBe("After",);
    expect(updated!.steps,).toHaveLength(1,);

    const foreign = await updateChain(db, created.id, otherId, { name: "Hijacked", },);
    expect(foreign,).toBeNull();
  });

  test("updateChain refuses to convert a graph row into a chain", async () => {
    const graphId = uid();
    await insertPromptTemplates(db, ownerId, "Plain graph", {
      modality: "workflow",
      payload: JSON.stringify({
        body: { "1": { class_type: "SaveImage", inputs: {}, }, },
        category: "txt2img",
        parameters: [],
        requiredNodes: [],
      },),
      id: graphId,
    } as never,);

    const result = await updateChain(db, graphId, ownerId, { steps: STEPS, },);
    expect(result,).toBeNull();
  });

  test("updateChain rejects an invalid step list", async () => {
    const created = await createChain(db, ownerId, { name: "Validated", steps: STEPS, },);
    await expect(updateChain(db, created.id, ownerId, {
      steps: [
        { id: "dup", templateId: "t", params: {}, },
        { id: "dup", templateId: "t", params: {}, },
      ],
    },),).rejects.toThrow(/duplicate step id/,);
  });

  test("createChain rejects invalid payloads", async () => {
    await expect(createChain(db, ownerId, {
      name: "Bad",
      steps: [{ id: "", templateId: "t", params: {}, },],
    },),).rejects.toThrow(/non-empty id/,);
  });

  test("deleteChain is owner-scoped and idempotent-false", async () => {
    const created = await createChain(db, ownerId, { name: "Doomed", steps: STEPS, },);
    expect(await deleteChain(db, created.id, otherId,),).toBe(false,);
    expect(await getChain(db, created.id, ownerId,),).not.toBeNull();

    expect(await deleteChain(db, created.id, ownerId,),).toBe(true,);
    expect(await getChain(db, created.id, ownerId,),).toBeNull();
    expect(await deleteChain(db, created.id, ownerId,),).toBe(false,);
  });
});

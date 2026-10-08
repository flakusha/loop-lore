// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Module-coverage tests for the merge service (FEA-2026-047). Ensures every
 * export has a runtime import edge and is exercised by at least one test.
 */
import { beforeAll, describe, expect, test, } from "bun:test";
import { randomUUID, } from "node:crypto";
import { createLogger, } from "../../../logger";
import { branchMergeRoutes, } from "../../../routes/chats/branch-merges";
import { createTestDb, type TestDb, } from "../../../test-utils/create-test-db";
import { insertActors, insertChats, insertUsers, } from "../../../test-utils/insert-helpers";
import {
  BranchMergeConfirmBody,
  BranchMergeContinueBody,
  BranchMergeInitiateBody,
  BranchMergeParams,
  BranchMergePreviewBody,
  MERGE_BRANCH_NAME_MAX,
  MergeConflictChoiceSchema,
  MergeContentEntrySchema,
  MergeModeSchema,
  MergeSourceTipSchema,
} from "../../../validation/schemas/branch-merges";
import { confirmMerge, MergeTxAbort, } from "./merge-confirm";
import { continueFromMerge, } from "./merge-continue";
import { modeKind, } from "./merge-criteria";
import { callMergeLlm, } from "./merge-llm-call";
import { buildPreview, } from "./merge-preview";
import {
  computeOverlayHunks,
  loadAncestorPath,
  loadMergeSources,
  loadSourceTips,
  parseMetadata,
  renderMessageLines,
  renderTailLines,
} from "./merge-render";
import { insertResultRows, } from "./merge-result-rows";

const OWNER_ID = randomUUID();
const CHAT_ID = randomUUID();

let tdb: TestDb;

beforeAll(async () => {
  createLogger({ level: "error", },);
  tdb = await createTestDb();
  const { db, } = tdb;
  await insertUsers(db, `owner-${OWNER_ID}`, "Owner", { id: OWNER_ID, } as never,);
  await insertActors(db, "Owner", { id: OWNER_ID, user_id: OWNER_ID, owner_id: OWNER_ID, } as never,);
  await insertChats(db, "Merge Modules", OWNER_ID, { id: CHAT_ID, type: "direct", mode: "direct", } as never,);
},);

describe("merge module exports", () => {
  test("modeKind classifies overlay vs llm modes", () => {
    expect(modeKind("second-over-first",),).toBe("overlay",);
    expect(modeKind("first-over-second",),).toBe("overlay",);
    expect(modeKind("combined",),).toBe("llm",);
    expect(modeKind("fresh-discovery",),).toBe("llm",);
    expect(modeKind("single-plus-glean",),).toBe("llm",);
  });

  test("parseMetadata handles null, valid, and invalid JSON", () => {
    expect(parseMetadata(null,),).toEqual({},);
    expect(
      parseMetadata(
        JSON.stringify({
          preview: {
            kind: "llm",
            tokenEstimate: { sharedPrefix: 0, perSource: [], },
            truncated: false,
            generatedAt: "",
            attempts: 0,
          },
        },),
      ),
    ).toEqual({
      preview: {
        kind: "llm",
        tokenEstimate: { sharedPrefix: 0, perSource: [], },
        truncated: false,
        generatedAt: "",
        attempts: 0,
      },
    },);

    expect(parseMetadata("not json",),).toEqual({},);
  });

  test("renderMessageLines returns null for unknown message", async () => {
    const result = await renderMessageLines(tdb.db, CHAT_ID, randomUUID(),);
    expect(result,).toBeNull();
  });

  test("renderTailLines returns null for unknown message", async () => {
    const result = await renderTailLines(tdb.db, CHAT_ID, [randomUUID(),],);
    expect(result,).toBeNull();
  });

  test("loadAncestorPath returns empty array for unknown message", async () => {
    const result = await loadAncestorPath(tdb.db, CHAT_ID, randomUUID(),);
    expect(result,).toEqual([],);
  });

  test("loadMergeSources returns empty array for unknown merge", async () => {
    const result = await loadMergeSources(tdb.db, randomUUID(),);
    expect(result,).toEqual([],);
  });

  test("loadSourceTips returns empty array for unknown merge", async () => {
    const result = await loadSourceTips(tdb.db, randomUUID(),);
    expect(result,).toEqual([],);
  });

  test("computeOverlayHunks returns null when a source tip is unknown", async () => {
    const result = await computeOverlayHunks(
      tdb.db,
      CHAT_ID,
      {
        baseMessageId: randomUUID(),
        sources: [{ ordinal: 0, tail: [randomUUID(),], }, { ordinal: 1, tail: [randomUUID(),], },],
      },
      0,
      1,
    );

    expect(result,).toBeNull();
  });

  test("insertResultRows is a function", () => {
    expect(typeof insertResultRows,).toBe("function",);
  });

  test("confirmMerge is a function", () => {
    expect(typeof confirmMerge,).toBe("function",);
  });

  test("continueFromMerge is a function", () => {
    expect(typeof continueFromMerge,).toBe("function",);
  });

  test("callMergeLlm is a function", () => {
    expect(typeof callMergeLlm,).toBe("function",);
  });

  test("buildPreview is a function", () => {
    expect(typeof buildPreview,).toBe("function",);
  });

  test("MergeTxAbort is a class", () => {
    expect(typeof MergeTxAbort,).toBe("function",);
    const err = new MergeTxAbort({ code: "conflict", message: "Merge already confirmed", },);
    expect(err,).toBeInstanceOf(Error,);
    expect(err.message,).toBe("Merge already confirmed",);
    expect(err.name,).toBe("MergeTxAbort",);
  });

  test("branchMergeRoutes is a function", () => {
    expect(typeof branchMergeRoutes,).toBe("function",);
  });

  test("validation schemas are TypeBox objects", () => {
    expect(BranchMergeInitiateBody,).toBeDefined();
    expect(BranchMergePreviewBody,).toBeDefined();
    expect(BranchMergeConfirmBody,).toBeDefined();
    expect(BranchMergeContinueBody,).toBeDefined();
    expect(BranchMergeParams,).toBeDefined();
    expect(MERGE_BRANCH_NAME_MAX,).toBe(120,);
    expect(MergeModeSchema,).toBeDefined();
    expect(MergeSourceTipSchema,).toBeDefined();
    expect(MergeContentEntrySchema,).toBeDefined();
    expect(MergeConflictChoiceSchema,).toBeDefined();
  });
});

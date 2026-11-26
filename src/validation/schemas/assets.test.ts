// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset batch schema tests: the batch-download/batch-delete body and the
 * batch-delete response contract (ids-only reporting, no existence oracle).
 */

import { describe, expect, test, } from "bun:test";
import { Value, } from "@sinclair/typebox/value";
import {
  AssetBatchDeleteResponse,
  AssetBatchIdsBody,
  AssetDownloadAllBody,
  AssetPreferencesBody,
  AssetPreferencesResponse,
} from "./assets";

const UUID_A = "550e8400-e29b-41d4-a716-446655440000";

describe("AssetBatchIdsBody", () => {
  test("accepts a non-empty id list", () => {
    expect(Value.Check(AssetBatchIdsBody, { ids: [UUID_A], },),).toBe(true,);
  });

  test("rejects an empty selection", () => {
    expect(Value.Check(AssetBatchIdsBody, { ids: [], },),).toBe(false,);
  });

  test("rejects more than 200 ids", () => {
    const ids = Array.from({ length: 201, }, () => UUID_A,);
    expect(Value.Check(AssetBatchIdsBody, { ids, },),).toBe(false,);
    expect(Value.Check(AssetBatchIdsBody, { ids: ids.slice(0, 200,), },),).toBe(true,);
  });

  test("rejects non-string ids", () => {
    expect(Value.Check(AssetBatchIdsBody, { ids: [42], },),).toBe(false,);
  });
});

describe("AssetDownloadAllBody", () => {
  test("accepts an empty filter set", () => {
    expect(Value.Check(AssetDownloadAllBody, {},),).toBe(true,);
  });

  test("accepts filters with chat context and a naming override", () => {
    expect(Value.Check(AssetDownloadAllBody, {
      q: "sunset",
      type: "image",
      entityType: "chat",
      entityId: UUID_A,
      tag: "cover",
      chatId: UUID_A,
      naming: "datetime-hash",
    },),).toBe(true,);
  });

  test("rejects an unknown naming mode", () => {
    expect(Value.Check(AssetDownloadAllBody, { naming: "fancy" },),).toBe(false,);
  });
});

describe("AssetPreferencesBody", () => {
  test("accepts every naming mode and null (clear)", () => {
    for (const downloadNaming of ["raw", "datetime", "hash", "datetime-hash", null]) {
      expect(Value.Check(AssetPreferencesBody, { downloadNaming },),).toBe(true,);
    }
  });

  test("rejects an unknown mode and a missing key", () => {
    expect(Value.Check(AssetPreferencesBody, { downloadNaming: "fancy" },),).toBe(false,);
    expect(Value.Check(AssetPreferencesBody, {},),).toBe(false,);
  });
});

describe("AssetPreferencesResponse", () => {
  test("accepts ok plus a mode or null", () => {
    expect(
      Value.Check(AssetPreferencesResponse, { ok: true, downloadNaming: "hash" }),
    ).toBe(true,);

    expect(
      Value.Check(AssetPreferencesResponse, { ok: true, downloadNaming: null }),
    ).toBe(true,);
  });

  test("rejects a missing ok", () => {
    expect(Value.Check(AssetPreferencesResponse, { downloadNaming: "raw" },),).toBe(false,);
  });
});

describe("AssetBatchDeleteResponse", () => {
  test("accepts ok plus the deleted id list", () => {
    expect(
      Value.Check(AssetBatchDeleteResponse, { ok: true, deleted: [UUID_A], },),
    ).toBe(true,);
  });

  test("rejects a missing or non-boolean ok", () => {
    expect(Value.Check(AssetBatchDeleteResponse, { deleted: [], },),).toBe(false,);
    expect(Value.Check(AssetBatchDeleteResponse, { ok: "yes", deleted: [], },),).toBe(false,);
  });

  test("rejects non-array deleted", () => {
    expect(Value.Check(AssetBatchDeleteResponse, { ok: true, deleted: "a1", },),).toBe(false,);
  });
});

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the admin classifier-vocabulary card slice: config-row
 * parsing, client-side validation mirroring, and the add/rename/remove
 * mutation flows against a stubbed apiFetch.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import {
  MAX_TAG_LENGTH,
  MAX_VOCABULARY_TAGS,
} from "../../aux-pipeline/class-tag-vocab";
import { CLASSIFIER_TAG_VOCABULARY_KEY, } from "../../aux-pipeline/class-template-resolver";
import {
  adminClassifierVocab,
  classifierVocabFromConfig,
  classifierVocabValidationError,
} from "./admin-classifier-vocab";

// ── Network stub (admin-classifier-vocab imports apiFetch from ./htmx) ──
let fetchCalls: { url: string; opts: RequestInit }[] = [];
let fetchHandler: (() => Response) | null = null;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  fetchCalls = [];
  fetchHandler = null;
  globalThis.fetch = (async (url: string | URL | Request, opts?: RequestInit,) => {
    fetchCalls.push({ url: String(url,), opts: opts ?? {}, },);
    return fetchHandler ? fetchHandler() : Response.json({ ok: true, },);
  }) as typeof fetch;
},);

afterEach(() => {
  globalThis.fetch = originalFetch;
},);

describe("classifierVocabFromConfig", () => {
  test("parses the vocabulary key out of the config rows", () => {
    expect(classifierVocabFromConfig([
      { key: "other.key", value: "x", },
      { key: CLASSIFIER_TAG_VOCABULARY_KEY, value: JSON.stringify(["a", "b",],), },
    ],),).toEqual(["a", "b",],);
  });

  test("returns [] when unset or malformed", () => {
    expect(classifierVocabFromConfig([],),).toEqual([],);
    expect(classifierVocabFromConfig([
      { key: CLASSIFIER_TAG_VOCABULARY_KEY, value: "{not json", },
    ],),).toEqual([],);
  });
});

describe("classifierVocabValidationError", () => {
  test("accepts a clean list", () => {
    expect(classifierVocabValidationError(["a", "b",],),).toBe("",);
  });

  test("rejects empty, duplicate and over-length entries", () => {
    expect(classifierVocabValidationError(["",],).length,).toBeGreaterThan(0,);
    expect(classifierVocabValidationError(["a", "a",],).length,).toBeGreaterThan(0,);
    expect(classifierVocabValidationError(["x".repeat(MAX_TAG_LENGTH + 1,),],).length,).toBeGreaterThan(0,);
  });

  test("rejects lists above the count cap", () => {
    const many = Array.from({ length: MAX_VOCABULARY_TAGS + 1, }, (_, i,) => `t${i}`,);
    expect(classifierVocabValidationError(many,).length,).toBeGreaterThan(0,);
  });
});

function freshSlice() {
  return {
    ...adminClassifierVocab,
    classifierVocab: [] as string[],
    classifierVocabInput: "",
    classifierVocabBusy: false,
    classifierVocabError: "",
    classifierVocabEditIdx: -1,
    classifierVocabEditValue: "",
  };
}

describe("adminClassifierVocab flows", () => {
  test("addClassifierTag validates then PATCHes the vocabulary", async () => {
    const slice = freshSlice();
    slice.classifierVocab = ["tavern",];
    slice.classifierVocabInput = "  dungeon  ";
    await adminClassifierVocab.addClassifierTag.call(slice,);
    expect(slice.classifierVocabError,).toBe("",);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/admin/system-config",);
    expect(fetchCalls[0]?.opts.method,).toBe("PATCH",);
    const body = JSON.parse(String(fetchCalls[0]?.opts.body,),) as { key: string; value: string };
    expect(body.key,).toBe(CLASSIFIER_TAG_VOCABULARY_KEY,);
    expect(JSON.parse(body.value,),).toEqual(["tavern", "dungeon",],);
    expect(slice.classifierVocabInput,).toBe("",);
  });

  test("addClassifierTag blocks duplicates without a request", async () => {
    const slice = freshSlice();
    slice.classifierVocab = ["tavern",];
    slice.classifierVocabInput = "tavern";
    await adminClassifierVocab.addClassifierTag.call(slice,);
    expect(fetchCalls,).toEqual([],);
    expect(slice.classifierVocabError,).not.toBe("",);
  });

  test("removeClassifierTag persists the shortened list", async () => {
    const slice = freshSlice();
    slice.classifierVocab = ["a", "b",];
    await adminClassifierVocab.removeClassifierTag.call(slice, 0,);
    const body = JSON.parse(String(fetchCalls[0]?.opts.body,),) as { value: string };
    expect(JSON.parse(body.value,),).toEqual(["b",],);
  });

  test("rename flow validates and persists the edited tag", async () => {
    const slice = freshSlice();
    slice.classifierVocab = ["a", "b",];
    adminClassifierVocab.startRenameClassifierTag.call(slice, 1,);
    expect(slice.classifierVocabEditValue,).toBe("b",);
    slice.classifierVocabEditValue = "c";
    await adminClassifierVocab.commitRenameClassifierTag.call(slice,);
    const body = JSON.parse(String(fetchCalls[0]?.opts.body,),) as { value: string };
    expect(JSON.parse(body.value,),).toEqual(["a", "c",],);

    // Duplicate rename is blocked.
    adminClassifierVocab.startRenameClassifierTag.call(slice, 1,);
    slice.classifierVocabEditValue = "a";
    await adminClassifierVocab.commitRenameClassifierTag.call(slice,);
    expect(slice.classifierVocabError,).not.toBe("",);
    adminClassifierVocab.cancelRenameClassifierTag.call(slice,);
    expect(slice.classifierVocabEditIdx,).toBe(-1,);
  });

  test("loadClassifierVocab awaits the system config load then parses", async () => {
    const slice = freshSlice();
    let loaded = false;
    const host = Object.assign(slice, {
      async loadSystemConfig() {
        loaded = true;
      },
      systemConfig: [{ key: CLASSIFIER_TAG_VOCABULARY_KEY, value: JSON.stringify(["z",],), },],
    },);

    await adminClassifierVocab.loadClassifierVocab.call(host,);
    expect(loaded,).toBe(true,);
    expect(host.classifierVocab,).toEqual(["z",],);
  });
});

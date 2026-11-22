// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for pinned `/object_info` identity and live compatibility.
 * Inline snapshots only — no network, DB or fixture files.
 */
import { describe, expect, it, } from "bun:test";
import { createHash, } from "node:crypto";
import type { ComfyUINodeInfo, } from "../providers/comfyui";
import {
  compareLiveNodeInfo,
  loadPinnedObjectInfo,
  objectInfoCanonicalJson,
  objectInfoSha256,
  PINNED_OBJECT_INFO_SHA256,
  verifyObjectInfoPin,
  verifyPinnedObjectInfoSha256,
} from "./schema-authority";
import type { ObjectInfoSnapshot, } from "./types";

const PINNED: ObjectInfoSnapshot = {
  ZLoader: {
    input: { required: { ckpt_name: ["COMBO",], }, },
    output: ["MODEL",],
  },
  ASampler: {
    input: {
      required: { steps: ["INT",], },
      optional: { seed: ["INT",], },
    },
    input_order: { required: ["steps",], },
  },
};

/** Byte-exact canonical form of PINNED, written out independently. */
const EXPECTED_JSON =
  '{"ASampler":{"input":{"optional":{"seed":["INT"]},"required":{"steps":["INT"]}},"input_order":{"required":["steps"]}},"ZLoader":{"input":{"required":{"ckpt_name":["COMBO"]}},"output":["MODEL"]}}';

function digestOf(text: string,): string {
  return createHash("sha256",).update(text, "utf8",).digest("hex",);
}

function liveInfo(input: ComfyUINodeInfo["input"],): Record<string, ComfyUINodeInfo> {
  return {
    ASampler: {
      name: "ASampler",
      display_name: "Sampler",
      category: "sampling",
      input,
      output: [],
      output_name: [],
    },
  };
}

describe("objectInfoCanonicalJson", () => {
  it("sorts keys recursively and preserves array order", () => {
    expect(objectInfoCanonicalJson(PINNED,),).toBe(EXPECTED_JSON,);
    expect(objectInfoCanonicalJson({ Node: { output: ["b", "a",], }, },),).toBe('{"Node":{"output":["b","a"]}}',);
  });

  it("hashes identically regardless of key insertion order", () => {
    const reordered: ObjectInfoSnapshot = {
      ZLoader: {
        output: ["MODEL",],
        input: { required: { ckpt_name: ["COMBO",], }, },
      },
      ASampler: {
        input_order: { required: ["steps",], },
        input: {
          optional: { seed: ["INT",], },
          required: { steps: ["INT",], },
        },
      },
    };

    expect(objectInfoCanonicalJson(reordered,),).toBe(EXPECTED_JSON,);
    expect(objectInfoSha256(reordered,),).toBe(objectInfoSha256(PINNED,),);
  });

  it("is the sha256 of the canonical text", () => {
    const expected = digestOf(EXPECTED_JSON,);
    expect(objectInfoSha256(PINNED,),).toBe(expected,);
    expect(expected,).toMatch(/^[0-9a-f]{64}$/,);
  });
});

describe("checked-in schema pin", () => {
  it("matches the pinned fixture digest", async () => {
    const fixture = await loadPinnedObjectInfo();
    expect(objectInfoSha256(fixture,),).toBe(PINNED_OBJECT_INFO_SHA256,);
  });
});

describe("verifyPinnedObjectInfoSha256", () => {
  it("accepts the bundled digest in every supported form", () => {
    for (
      const candidate of [
        PINNED_OBJECT_INFO_SHA256,
        `sha256:${PINNED_OBJECT_INFO_SHA256}`,
        PINNED_OBJECT_INFO_SHA256.toUpperCase(),
      ]
    ) {
      expect(verifyPinnedObjectInfoSha256(candidate,),).toEqual({ ok: true, sha256: PINNED_OBJECT_INFO_SHA256, },);
    }
  });

  it("rejects a stale or malformed digest", () => {
    expect(verifyPinnedObjectInfoSha256("f".repeat(64,),),).toMatchObject({
      ok: false,
      error: expect.stringContaining("mismatch",),
    },);

    expect(verifyPinnedObjectInfoSha256("short",),).toMatchObject({
      ok: false,
      error: expect.stringContaining("Invalid schema pin",),
    },);
  });
});

describe("verifyObjectInfoPin", () => {
  const digest = digestOf(EXPECTED_JSON,);

  it("accepts bare, prefixed, padded and upper-case digests", () => {
    for (const candidate of [digest, `sha256:${digest}`, `  ${digest}  `, digest.toUpperCase(),]) {
      expect(verifyObjectInfoPin(PINNED, candidate,),).toEqual({ ok: true, sha256: digest, },);
    }
  });

  it("rejects malformed digests without throwing", () => {
    for (const bad of ["", "short", "sha256:", "z".repeat(64,), "a".repeat(63,),]) {
      expect(verifyObjectInfoPin(PINNED, bad,),).toMatchObject({
        ok: false,
        error: expect.stringContaining("Invalid schema pin",),
      },);
    }
  });

  it("reports a mismatch descriptively", () => {
    const wrong = "f".repeat(64,);
    expect(verifyObjectInfoPin(PINNED, wrong,),).toMatchObject({
      ok: false,
      error: expect.stringContaining("mismatch",),
    },);

    expect(verifyObjectInfoPin(PINNED, `sha256:${wrong}`,),).toMatchObject({
      ok: false,
      error: expect.stringContaining("mismatch",),
    },);
  });

  it("never throws on a non-string pin", () => {
    expect(verifyObjectInfoPin(PINNED, null as unknown as string,),).toMatchObject({
      ok: false,
      error: expect.stringContaining("verification failed",),
    },);
  });
});

describe("compareLiveNodeInfo", () => {
  const requiredNodes = ["ASampler",];

  it("accepts compatible live info with extra classes and inputs", () => {
    const live = liveInfo({ required: { steps: ["INT",], seed: ["INT",], extra: ["STRING",], }, },);
    live.ZExtra = { name: "ZExtra", display_name: "Extra", category: "misc", input: {}, output: [], output_name: [], };
    expect(compareLiveNodeInfo(PINNED, live, { requiredNodes, },),).toEqual({ ok: true, },);
  });

  it("reports a missing required class", () => {
    expect(compareLiveNodeInfo(PINNED, {}, { requiredNodes, },),).toMatchObject({
      ok: false,
      errors: [expect.stringContaining("ASampler",),],
    },);
  });

  it("reports a changed required input", () => {
    const live = liveInfo({ optional: { seed: ["INT",], }, },);
    expect(compareLiveNodeInfo(PINNED, live, { requiredNodes, },),).toMatchObject({
      ok: false,
      errors: [expect.stringContaining("steps",),],
    },);
  });
});

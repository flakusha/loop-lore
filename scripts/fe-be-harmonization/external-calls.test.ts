// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the external/non-htmx client pass of the FE-BE harmonization
 * gate: manifest-driven call extraction + validation against a published
 * OpenAPI document (injected inline — no spec regeneration in tests).
 */

import { describe, expect, test, } from "bun:test";
import {
  externalFindings,
  MANIFEST_REL,
  normCallPath,
  normSpecPath,
  type PublishedSpec,
  readExternalManifest,
  scanExternalCalls,
} from "./external-calls";

const FIXTURE = "scripts/fe-be-harmonization/testdata/fixture-external-client.ts";

/** Published-document stub covering the fixture's matching paths. */
function specWith(paths: Record<string, string[]>,): PublishedSpec {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [p, methods,] of Object.entries(paths,)) {
    out[p] = Object.fromEntries(methods.map((m,) => [m.toLowerCase(), {},]),);
  }
  return { paths: out, };
}

const GOOD_SPEC = specWith({
  "/api/v1/chats/{chatId}/messages": ["get", "post",],
  "/api/v1/chats/{chatId}/branch-merges": ["get",],
  "/api/v1/actors/import": ["post",],
},);

const EMPTY_MANIFEST = { clients: [FIXTURE,], allowlist: [], };

describe("normCallPath / normSpecPath", () => {
  test("keeps the /api root and converts interpolations to :param", () => {
    expect(normCallPath(`${"${BASE}"}/api/v1/chats/${"${id}"}/messages?x=1`,),)
      .toBe("/api/v1/chats/:param/messages",);
  });

  test("converts OpenAPI templates to :param form", () => {
    expect(normSpecPath("/api/v1/chats/{chatId}/messages",),)
      .toBe("/api/v1/chats/:chatId/messages",);
  });
});

describe("scanExternalCalls", () => {
  test("flags a manifest entry pointing at a nonexistent file", () => {
    const res = scanExternalCalls(["src/nope/ghost.ts",],);
    expect(res.missing,).toEqual(["src/nope/ghost.ts",],);
    expect(res.calls,).toEqual([],);
  });

  test("extracts calls with inferred methods from the fixture", () => {
    const { calls, missing, } = scanExternalCalls([FIXTURE,],);
    expect(missing,).toEqual([],);
    const byMethod = Object.fromEntries(calls.map((c,) => [c.method, c.path,]),);
    expect(byMethod["POST"],).toBe("/api/v1/definitely/not/a/route",);
    expect(byMethod["GET"],).toBeDefined();
    expect(calls.every((c,) => c.file === FIXTURE && c.line > 0),).toBe(true,);
  });
});

describe("externalFindings", () => {
  test("a call missing from the published document is blocking with file:line", () => {
    const scan = scanExternalCalls([FIXTURE,],);
    const blocking = externalFindings(EMPTY_MANIFEST, scan, GOOD_SPEC,);
    const bad = blocking.filter((b,) => b.includes("external-no-contract",));
    expect(bad.length,).toBe(1,);
    expect(bad[0],).toContain(`${FIXTURE}:`,);
    expect(bad[0],).toMatch(/:\d+ \[blocking\]/,);
    expect(bad[0],).toContain("POST /api/v1/definitely/not/a/route",);
  });

  test("a matching call produces no finding", () => {
    const scan = {
      calls: [{
        method: "GET",
        path: "/api/v1/chats/:chatId/messages",
        raw: "/api/v1/chats/1/messages",
        file: FIXTURE,
        line: 12,
      },],
      missing: [],
    };
    expect(externalFindings(EMPTY_MANIFEST, scan, GOOD_SPEC,),).toEqual([],);
  });

  test("path params normalize before template comparison", () => {
    const scan = {
      calls: [{
        method: "GET",
        path: "/api/v1/chats/:param/branch-merges",
        raw: "/api/v1/chats/9/branch-merges",
        file: FIXTURE,
        line: 3,
      },],
      missing: [],
    };
    expect(externalFindings(EMPTY_MANIFEST, scan, GOOD_SPEC,),).toEqual([],);
  });

  test("path hit with an unpublished method is a blocking method mismatch", () => {
    const scan = {
      calls: [{
        method: "DELETE",
        path: "/api/v1/chats/:chatId/messages",
        raw: "/api/v1/chats/1/messages",
        file: FIXTURE,
        line: 7,
      },],
      missing: [],
    };
    const blocking = externalFindings(EMPTY_MANIFEST, scan, GOOD_SPEC,);
    expect(blocking.length,).toBe(1,);
    expect(blocking[0],).toContain("external-method-mismatch",);
    expect(blocking[0],).toContain("GET/POST",);
  });

  test("allowlisted exceptions are skipped", () => {
    const scan = {
      calls: [{ method: "POST", path: "/api/v1/assets", raw: "/api/v1/assets", file: FIXTURE, line: 2, },],
      missing: [],
    };
    const manifest = {
      clients: [FIXTURE,],
      allowlist: [{ method: "POST", path: "/api/v1/assets", reason: "documented exception", },],
    };
    expect(externalFindings(manifest, scan, specWith({ "/api/v1/assets": ["get",], },),),).toEqual([],);
  });

  test("stale manifest entries are blocking findings", () => {
    const scan = scanExternalCalls([FIXTURE, "src/ghost.ts",],);
    const blocking = externalFindings(EMPTY_MANIFEST, scan, GOOD_SPEC,);
    expect(blocking.some((b,) => b.includes("stale manifest",) && b.includes("src/ghost.ts",)),).toBe(true,);
  });
});

describe("readExternalManifest", () => {
  test("reads the checked-in manifest with its client list and allowlist", () => {
    const { manifest, errors, } = readExternalManifest(MANIFEST_REL,);
    expect(errors,).toEqual([],);
    expect(manifest.clients,).toContain("src/cli/headless.ts",);
    expect(manifest.allowlist.length,).toBeGreaterThan(0,);
    expect(manifest.allowlist.every((a,) => a.reason.length > 0),).toBe(true,);
  });

  test("manifests without a clients array surface as errors instead of throwing", () => {
    // package.json is valid JSON but not a manifest shape.
    const { errors, } = readExternalManifest("package.json",);
    expect(errors.length,).toBeGreaterThan(0,);
    expect(errors[0],).toContain("clients",);
  });
});

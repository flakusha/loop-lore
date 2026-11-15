// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Named policy resolution — known names resolve, unknown/undefined fall back to default. */

import { describe, expect, test, } from "bun:test";
import { authPolicy, chatPolicy, defaultPolicy, generationPolicy, resolvePolicy, } from "./policies";

describe("resolvePolicy", () => {
  test("registered names resolve to their policy", () => {
    expect(resolvePolicy("auth",),).toBe(authPolicy,);
    expect(resolvePolicy("chat",),).toBe(chatPolicy,);
    expect(resolvePolicy("generation",),).toBe(generationPolicy,);
  });

  test("unknown and missing names fall back to default", () => {
    expect(resolvePolicy("repo-access-typo",),).toBe(defaultPolicy,);
    expect(resolvePolicy("",),).toBe(defaultPolicy,);
    expect(resolvePolicy(undefined,),).toBe(defaultPolicy,);
  });
});

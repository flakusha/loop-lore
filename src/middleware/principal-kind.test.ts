// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the PrincipalKind vocabulary (src/middleware/principal-kind.ts)
 * and the fail-closed rules it carries (epic-principal-scoped-credentials
 * tasks 1 + 3):
 *  - the vocabulary is exactly the epic's four kinds;
 *  - every kind resolves; unknown kind-shaped strings fail closed to null;
 *  - the actors-row mapping is total and never guesses a kind;
 *  - a RequestContext cannot be built without naming its kind (the silent
 *    `?? "user"` default-principal fallback is gone — compile-enforced);
 *  - token-principal consistency: a resolved integration token mints an
 *    external-agent principal bound to its credential.
 *
 * Resource contract (parallel-safe): no database, no ports, no env — the
 * vocabulary module and `integrationTokenContext` are pure.
 */
import { describe, expect, test, } from "bun:test";
import { IntegrationTokenScope, } from "../db/enums-core/integration-tokens";
import { integrationTokenContext, } from "./auth/integration-token";
import {
  PRINCIPAL_KINDS,
  type PrincipalKind,
  principalKind,
  principalKindForActor,
  toPrincipalKind,
} from "./principal-kind";
import { createRequestContext, } from "./types";

describe("PrincipalKind vocabulary", () => {
  test("the vocabulary is exactly the epic's four kinds", () => {
    expect([...PRINCIPAL_KINDS,],).toEqual([
      "user",
      "user-worktree",
      "internal-service",
      "external-agent",
    ],);
  });

  test("every vocabulary kind resolves through the fail-closed narrow", () => {
    for (const kind of PRINCIPAL_KINDS) {
      expect(toPrincipalKind(kind,),).toBe(principalKind(kind,),);
    }
  });

  test("unknown kind-shaped strings fail closed to null — no default kind", () => {
    // Near-misses, wrong casing, and caller-flavored names ("agent",
    // "operator") are all OUTSIDE the vocabulary: a principal kind is
    // minted server-side, never accepted as a claim.
    for (
      const raw of [
        "agent",
        "operator",
        "admin",
        "service",
        "anonymous",
        "User",
        "AGENT",
        "user-worktree ",
        "llri_user",
        "",
      ]
    ) {
      expect(toPrincipalKind(raw,),).toBeNull();
    }
  });

  test("principalKind minting is identity over the closed set", () => {
    const kinds: PrincipalKind[] = PRINCIPAL_KINDS.map((k,) => principalKind(k,));
    expect(kinds,).toHaveLength(PRINCIPAL_KINDS.length,);
  });
});

describe("principalKindForActor — the actors-row mapping", () => {
  test("a system actors row resolves internal-service", () => {
    expect(principalKindForActor("system",),).toBe(principalKind("internal-service",),);
  });

  test("every non-system actors evidence resolves the user kind", () => {
    for (const actorType of ["user", "character", "narrator",]) {
      expect(principalKindForActor(actorType,),).toBe(principalKind("user",),);
    }
  });

  test("no actors row is not internal-service — plain user principal", () => {
    expect(principalKindForActor(undefined,),).toBe(principalKind("user",),);
    expect(principalKindForActor(null,),).toBe(principalKind("user",),);
  });
});

describe("createRequestContext — the kind is required, never defaulted", () => {
  test("a context carries exactly the kind it was minted with", () => {
    const rc = createRequestContext({
      userId: "u-1",
      userRole: "user",
      sessionId: null,
      principalKind: principalKind("external-agent",),
    },);

    expect(rc.principalKind,).toBe(principalKind("external-agent",),);
  });

  test("omitting the kind is a compile error — the silent user default is gone", () => {
    // @ts-expect-error — principalKind is REQUIRED (fail-closed seam): the
    // old `?? "user"` default-principal fallback must not come back.
    const rc = createRequestContext({ userId: "u-1", userRole: "user", sessionId: null, },);

    expect(rc.principalKind,).toBeUndefined();
  });
});

describe("token-principal consistency (integration-token seam)", () => {
  test("a resolved token row mints an external-agent principal bound to its credential", () => {
    const rc = integrationTokenContext({
      id: "tok-1",
      name: "CI token",
      scopes: IntegrationTokenScope.ChatWrite,
      issuerAdminUserId: "admin-1",
    },);

    // Server-side resolution: the token row IS the external-agent evidence.
    expect(rc.principalKind,).toBe(principalKind("external-agent",),);
    // Subject binding: the ISSUING admin's id — never a synthetic user row.
    expect(rc.userId,).toBe("admin-1",);
    // A scoped credential, not the admin's session: no RBAC inheritance.
    expect(rc.userRole,).toBeNull();
    expect(rc.sessionId,).toBeNull();
    // The credential attribution the audit row + budget bucket key on.
    expect(rc.credentialId,).toBe("tok-1",);
    expect(rc.credentialName,).toBe("CI token",);
    expect(rc.credentialScope,).toBe(IntegrationTokenScope.ChatWrite,);
  });
});

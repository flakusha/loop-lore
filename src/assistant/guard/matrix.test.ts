// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Layer 1 — the capability matrix.
 *
 * The matrix is the deterministic gate: declared tags plus the caller's roles
 * decide allow, review, or deny. Two invariants carry the security weight:
 * an undeclared command is denied, and the most restrictive tag wins.
 */
import { describe, expect, it, } from "bun:test";
import { ChatParticipantRole, } from "../../db/enums";
import { CAPABILITY_POLICY, DEFAULT_LIMITS, } from "../capabilities";
import type { CapabilityTag, } from "../capabilities";
import { evaluateCapabilities, } from "./matrix";

describe("evaluateCapabilities — fail closed", () => {
  it("denies a command that declares no capabilities", () => {
    const decision = evaluateCapabilities({
      tool: "undeclared",
      tags: undefined,
      roleInChat: ChatParticipantRole.Owner,
      userRole: "admin",
    },);

    expect(decision.allowed,).toBe(false,);
    expect(decision.requiresReview,).toBe(false,);
    expect(decision.reason,).toContain("declares no capabilities",);
  });

  it("denies a command whose capability list is empty", () => {
    const decision = evaluateCapabilities({
      tool: "empty",
      tags: [],
      roleInChat: ChatParticipantRole.Owner,
      userRole: "admin",
    },);

    expect(decision.allowed,).toBe(false,);
    expect(decision.reason,).toContain("declares no capabilities",);
  });

  it("denies an unrecognized capability tag (default-deny)", () => {
    const decision = evaluateCapabilities({
      tool: "bogus",
      tags: ["bogus-tag" as unknown as CapabilityTag,],
      roleInChat: ChatParticipantRole.Owner,
      userRole: "admin",
    },);

    expect(decision.allowed,).toBe(false,);
    expect(decision.reason,).toContain("elevated privileges",);
  });
});

describe("evaluateCapabilities — policy tiers", () => {
  it("allows a read-only capability without review", () => {
    const decision = evaluateCapabilities({
      tool: "read-chat",
      tags: ["read-chat",],
      roleInChat: ChatParticipantRole.Member,
    },);

    expect(decision.allowed,).toBe(true,);
    expect(decision.requiresReview,).toBe(false,);
  });

  it("routes a write capability to the judge", () => {
    const decision = evaluateCapabilities({
      tool: "write-chat",
      tags: ["write-chat",],
      roleInChat: ChatParticipantRole.Member,
    },);

    expect(decision.allowed,).toBe(true,);
    expect(decision.requiresReview,).toBe(true,);
    expect(decision.tags,).toEqual(["write-chat",],);
  });

  it("routes network and irreversible capabilities to the judge", () => {
    const decision = evaluateCapabilities({
      tool: "fetch",
      tags: ["network", "irreversible",],
      roleInChat: ChatParticipantRole.Member,
    },);

    expect(decision.allowed,).toBe(true,);
    expect(decision.requiresReview,).toBe(true,);
  });
});

describe("evaluateCapabilities — deny tier", () => {
  it("denies admin-only to a plain member", () => {
    const decision = evaluateCapabilities({
      tool: "admin-tool",
      tags: ["admin-only",],
      roleInChat: ChatParticipantRole.Member,
      userRole: "creator",
    },);

    expect(decision.allowed,).toBe(false,);
    expect(decision.reason,).toContain("administrator",);
  });

  it("allows admin-only to a site administrator", () => {
    const decision = evaluateCapabilities({
      tool: "admin-tool",
      tags: ["admin-only",],
      roleInChat: ChatParticipantRole.Member,
      userRole: "admin",
    },);

    expect(decision.allowed,).toBe(true,);
    expect(decision.requiresReview,).toBe(false,);
  });

  it("denies moderator-only to a plain member", () => {
    const decision = evaluateCapabilities({
      tool: "mod-tool",
      tags: ["moderator-only",],
      roleInChat: ChatParticipantRole.Member,
      userRole: "creator",
    },);

    expect(decision.allowed,).toBe(false,);
    expect(decision.reason,).toContain("moderator",);
  });

  it("allows moderator-only to a site moderator", () => {
    const decision = evaluateCapabilities({
      tool: "mod-tool",
      tags: ["moderator-only",],
      roleInChat: ChatParticipantRole.Member,
      userRole: "moderator",
    },);

    expect(decision.allowed,).toBe(true,);
  });

  it("allows moderator-only to the chat owner", () => {
    const decision = evaluateCapabilities({
      tool: "mod-tool",
      tags: ["moderator-only",],
      roleInChat: ChatParticipantRole.Owner,
      userRole: null,
    },);

    expect(decision.allowed,).toBe(true,);
  });

  it("takes the most restrictive tag when tags disagree", () => {
    const decision = evaluateCapabilities({
      tool: "mixed",
      tags: ["read-chat", "admin-only",],
      roleInChat: ChatParticipantRole.Member,
      userRole: "creator",
    },);

    expect(decision.allowed,).toBe(false,);
  });

  it("still demands review when a review tag rides along an allow tag", () => {
    const decision = evaluateCapabilities({
      tool: "mixed",
      tags: ["read-chat", "cross-user",],
      roleInChat: ChatParticipantRole.Member,
    },);

    expect(decision.allowed,).toBe(true,);
    expect(decision.requiresReview,).toBe(true,);
  });
});

describe("capability policy — the shared vocabulary", () => {
  it("maps every capability tag to exactly one policy", () => {
    expect(CAPABILITY_POLICY["read-chat"],).toBe("allow",);
    expect(CAPABILITY_POLICY["write-chat"],).toBe("review",);
    expect(CAPABILITY_POLICY["destructive"],).toBe("deny",);
    expect(CAPABILITY_POLICY["admin-only"],).toBe("deny",);
    expect(CAPABILITY_POLICY["moderator-only"],).toBe("deny",);

    for (const policy of Object.values(CAPABILITY_POLICY,)) {
      expect(["allow", "review", "deny",],).toContain(policy,);
    }
  });

  it("routes a tag by the policy the matrix declares for it", () => {
    const decision = evaluateCapabilities({
      tool: "write-asset",
      tags: ["write-asset",],
      roleInChat: ChatParticipantRole.Member,
    },);

    expect(decision.requiresReview,).toBe(CAPABILITY_POLICY["write-asset"] === "review",);
    expect(decision.allowed,).toBe(CAPABILITY_POLICY["write-asset"] !== "deny",);
  });
});

describe("default limits — the shared ceiling", () => {
  it("bounds a call that declares no limits of its own", () => {
    expect(DEFAULT_LIMITS.timeoutMs,).toBeGreaterThan(0,);
    expect(DEFAULT_LIMITS.memoryMb,).toBeGreaterThan(0,);
    expect(DEFAULT_LIMITS.networkBytes,).toBeUndefined();
  });
});

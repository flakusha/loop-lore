// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Policy registry + route-prefix resolution tests. */
import { describe, expect, test, } from "bun:test";
import {
  authPolicy,
  chatPolicy,
  defaultPolicy,
  generationPolicy,
  policies,
  policyForRoute,
  routePolicies,
} from "./policies";

describe("policy registry", () => {
  test("chat policy is sized for real UI volume, not generation volume", () => {
    expect(chatPolicy.name,).toBe("chat",);
    expect(chatPolicy.windowMs,).toBe(60_000,);
    expect(chatPolicy.max,).toBe(300,);
    expect(chatPolicy.burst,).toBe(50,);
    expect(policies["chat"],).toBe(chatPolicy,);
  });

  test("every routePolicies entry is registered by name", () => {
    for (const [, policy,] of routePolicies) {
      expect(policies[policy.name],).toBe(policy,);
    }
  });
});

describe("policyForRoute", () => {
  test("chats prefix resolves the chat policy (BUG-rate-limit-policies-starve-normal-chat-traffic)", () => {
    expect(policyForRoute("/api/v1/chats",),).toBe(chatPolicy,);
    expect(policyForRoute("/api/v1/chats/abc-123",),).toBe(chatPolicy,);
    expect(policyForRoute("/api/v1/chats/abc-123/messages",),).toBe(chatPolicy,);
  });

  test("generation prefix still resolves the generation policy", () => {
    expect(policyForRoute("/api/v1/generation/images",),).toBe(generationPolicy,);
  });

  test("auth prefix resolves the auth policy", () => {
    expect(policyForRoute("/api/v1/auth/login",),).toBe(authPolicy,);
  });

  test("seen-poller volume routes to the chat policy, not the shared default", () => {
    // Real call pattern: loadAllSeen N-GETs every message id every 5s —
    // a 26-message chat sustains 312 req/min, above the default 300 cap.
    expect(policyForRoute("/api/v1/messages/m1/seen",),).toBe(chatPolicy,);
    expect(policyForRoute("/api/v1/messages",),).toBe(chatPolicy,);
  });

  test("unmatched paths get the default policy", () => {
    expect(policyForRoute("/api/v1/actors",),).toBe(defaultPolicy,);
  });
});

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

  test("emotion-avatar batch generation resolves the generation policy (BUG-emotion-avatar-emotions-array-uncapped-x-default-rate-policy)", () => {
    // POST /api/v1/actors/:actorId/emotion-avatars is nested under an id, so no
    // prefix rule reaches it; the suffix rule moves its per-entry image-gen
    // fan-out out of the shared 300/min default bucket.
    expect(policyForRoute("/api/v1/actors/a1/emotion-avatars",),).toBe(generationPolicy,);
    expect(policyForRoute("/api/v1/actors/a1/wardrobe/o1/emotion-avatars",),).toBe(generationPolicy,);
    // Job list/status polling + cancel must NOT starve in the 20/min bucket.
    expect(policyForRoute("/api/v1/actors/a1/emotion-avatars/jobs",),).toBe(defaultPolicy,);
    expect(policyForRoute("/api/v1/actors/a1/emotion-avatars/jobs/j9",),).toBe(defaultPolicy,);
    expect(policyForRoute("/api/v1/actors/a1/emotion-avatars/jobs/j9/cancel",),).toBe(defaultPolicy,);
  });

  test("emotion-avatar single generation resolves the generation policy (BUG-rate-limit-misses-post-emotion-avatars-single)", () => {
    // POST /api/v1/actors/:actorId/wardrobe/:itemId/emotion-avatars/single
    // ends with /single, so the /emotion-avatars suffix rule misses it.
    expect(policyForRoute("/api/v1/actors/a1/wardrobe/o1/emotion-avatars/single",),).toBe(generationPolicy,);
    // Batch path still resolves generationPolicy.
    expect(policyForRoute("/api/v1/actors/a1/emotion-avatars",),).toBe(generationPolicy,);
    // Job list/status/cancel paths stay unmatched.
    expect(policyForRoute("/api/v1/actors/a1/emotion-avatars/jobs",),).toBe(defaultPolicy,);
    expect(policyForRoute("/api/v1/actors/a1/emotion-avatars/jobs/j9",),).toBe(defaultPolicy,);
    expect(policyForRoute("/api/v1/actors/a1/emotion-avatars/jobs/j9/cancel",),).toBe(defaultPolicy,);
  });

  test("remaining generation endpoints resolve the generation policy (BUG-rate-limit-misses-generation-endpoints)", () => {
    // These generation POSTs are nested under id-bearing paths, so no prefix
    // rule reaches them; the suffix rules move them out of the shared 300/min
    // default bucket.
    expect(policyForRoute("/api/v1/image-edit/run",),).toBe(generationPolicy,);
    expect(policyForRoute("/api/v1/comfyui-builder/runs",),).toBe(generationPolicy,);
    expect(policyForRoute("/api/chats/abc/story/step",),).toBe(generationPolicy,);
    expect(policyForRoute("/api/chats/abc/story/resume",),).toBe(generationPolicy,);
    expect(policyForRoute("/api/proactive-messaging/send",),).toBe(generationPolicy,);
    expect(policyForRoute("/api/chats/abc/vn/generate-story",),).toBe(generationPolicy,);
    expect(policyForRoute("/api/chats/abc/vn/generate-choices",),).toBe(generationPolicy,);
    // Sibling read/list/status paths must NOT starve in the 20/min bucket.
    expect(policyForRoute("/api/v1/comfyui-builder/runs/j9",),).toBe(defaultPolicy,);
    expect(policyForRoute("/api/chats/abc/story/state",),).toBe(defaultPolicy,);
    expect(policyForRoute("/api/proactive-messaging/config",),).toBe(defaultPolicy,);
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

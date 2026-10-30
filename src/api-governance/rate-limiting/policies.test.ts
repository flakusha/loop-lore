// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Policy registry + route-prefix resolution tests. */
import { describe, expect, test, } from "bun:test";
import {
  authPolicy,
  chatPolicy,
  defaultPolicy,
  generationPolicy,
  outboundFetchPolicy,
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

  test("chat SSE stream resolves the chat policy (BUG-chat-sse-shares-generation-rate-bucket)", () => {
    // GET /api/v1/generation/stream/:chatId is an SSE read, not a billable
    // call — the suffix rule keeps it out of the 20/min generation bucket.
    expect(policyForRoute("/api/v1/generation/stream/abc-123",),).toBe(chatPolicy,);
    // Other generation traffic stays on the generation policy.
    expect(policyForRoute("/api/v1/generation/image",),).toBe(generationPolicy,);
    expect(policyForRoute("/api/v1/generation/stream",),).toBe(chatPolicy,);
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

  test("auth/me identity probe resolves the chat policy, not the login bucket (BUG-e2e-browser-authme-429)", () => {
    // GET /api/v1/auth/me is a per-page probe, not token minting: it must
    // not share the 10/min auth budget. First-match-wins makes this order
    // load-bearing — the /auth/me rule MUST stay above the /auth prefix.
    expect(policyForRoute("/api/v1/auth/me",),).toBe(chatPolicy,);
    // Login/register stay on the tight budget.
    expect(policyForRoute("/api/v1/auth/login",),).toBe(authPolicy,);
    expect(policyForRoute("/api/v1/auth/register",),).toBe(authPolicy,);
  });

  test("ai-action resolves the generation policy, not the chat bucket (S-5)", () => {
    // The path STARTS WITH /api/v1/chats, so first-match-wins makes rule
    // order load-bearing: before the reorder this resolved chatPolicy
    // (300/min) despite the suffix rule existing further down the table.
    expect(policyForRoute("/api/v1/chats/c1/messages/m1/ai-action",),).toBe(generationPolicy,);
  });

  test("link-preview resolves the dedicated outbound-fetch policy (S-12)", () => {
    // Each cache miss is a server-side fetch of a caller-chosen URL — its
    // own budget, not the 300/min chat read bucket.
    expect(policyForRoute("/api/v1/chats/c1/link-preview",),).toBe(outboundFetchPolicy,);
    // Nearby chat reads stay on the chat policy.
    expect(policyForRoute("/api/v1/chats/c1",),).toBe(chatPolicy,);
  });

  test("story LLM suffix rules fire on the versioned mount (S-6)", () => {
    // Since the versioned remount the story routes serve at
    // /api/v1/chats/:id/story/* — UNDER the chats prefix, so the suffix
    // rules must outrank it (they used to sit below it and never fired).
    expect(policyForRoute("/api/v1/chats/c1/story/step",),).toBe(generationPolicy,);
    expect(policyForRoute("/api/v1/chats/c1/story/resume",),).toBe(generationPolicy,);
    // The unversioned shape keeps resolving too.
    expect(policyForRoute("/api/chats/abc/story/step",),).toBe(generationPolicy,);
    expect(policyForRoute("/api/chats/abc/story/resume",),).toBe(generationPolicy,);
  });

  test("chat-nested suffix rules precede the chats prefix rule (dead-rule guard)", () => {
    // The exact regression S-6 exposed: a suffix rule below /api/v1/chats
    // can never fire, because the prefix claims the path first.
    const chatsIdx = routePolicies.findIndex(([pattern,],) => pattern === "/api/v1/chats");
    expect(chatsIdx,).toBeGreaterThan(-1,);
    for (
      const pattern of [
        "/ai-action",
        "/link-preview",
        "/story/step",
        "/story/resume",
        "/vn/generate-story",
        "/vn/generate-choices",
      ]
    ) {
      const idx = routePolicies.findIndex(([p,],) => p === pattern);
      expect(idx, `${pattern} must exist`,).toBeGreaterThan(-1,);
      expect(idx, `${pattern} must precede /api/v1/chats or it is dead code`,).toBeLessThan(chatsIdx,);
    }
  });

  test("prefix rules match on segment boundaries, not raw startsWith", () => {
    // /api/v1/authx is not an auth route — a raw startsWith match let
    // non-auth paths eat into the tight 10/min auth budget.
    expect(policyForRoute("/api/v1/authx",),).toBe(defaultPolicy,);
    expect(policyForRoute("/api/v1/authentication-bypass",),).toBe(defaultPolicy,);
    expect(policyForRoute("/api/v1/chats-legacy",),).toBe(defaultPolicy,);
    // The exact path and true segment children still match.
    expect(policyForRoute("/api/v1/auth",),).toBe(authPolicy,);
    expect(policyForRoute("/api/v1/auth/login",),).toBe(authPolicy,);
    expect(policyForRoute("/api/v1/chats",),).toBe(chatPolicy,);
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

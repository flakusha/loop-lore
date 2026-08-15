/**
 * Unit tests for src/schemas/consent.ts — Unified Consent Schema.
 *
 * Covers factory defaults, audit-trail recording for all four consent
 * actions (given/revoked/modified/overridden), and scope checks.
 */
import { describe, expect, test, } from "bun:test";
import {
  createConsentState,
  isActionConsented,
  recordConsentAction,
} from "./consent";

describe("createConsentState", () => {
  test("defaults to not-given, required, revocable, empty audit", () => {
    const state = createConsentState();
    expect(state.consent_required).toBe(true);
    expect(state.consent_given).toBe(false);
    expect(state.consent_aware).toBe(false);
    expect(state.consent_revocable).toBe(true);
    expect(state.consent_scope).toEqual([]);
    expect(state.audit_trail).toEqual([]);
  });

  test("accepts initial scope", () => {
    const state = createConsentState(["nsfw_encounter", "nsfw_dialogue",]);
    expect(state.consent_scope).toEqual(["nsfw_encounter", "nsfw_dialogue",]);
  });
});

describe("recordConsentAction", () => {
  test("given marks consent_given + consent_aware and appends audit entry", () => {
    const state = createConsentState(["nsfw_encounter",]);
    const result = recordConsentAction(state, "given", {
      actor: "user-1",
      reason: "explicit consent",
    });

    expect(result.consent_given).toBe(true);
    expect(result.consent_aware).toBe(true);
    expect(result.audit_trail).toHaveLength(1);
    expect(result.audit_trail[0]).toMatchObject({
      actor: "user-1",
      action: "given",
      reason: "explicit consent",
    });
  });

  test("revoked clears consent_given but keeps awareness", () => {
    const state = createConsentState(["nsfw_encounter",]);
    recordConsentAction(state, "given", { actor: "user-1", },);
    recordConsentAction(state, "revoked", { actor: "user-1", reason: "user revoked", },);

    expect(state.consent_given).toBe(false);
    expect(state.consent_aware).toBe(true);
    expect(state.audit_trail).toHaveLength(2);
    expect(state.audit_trail[1]).toMatchObject({ action: "revoked", });
  });

  test("modified updates consent scope", () => {
    const state = createConsentState(["nsfw_encounter",]);
    recordConsentAction(state, "modified", {
      actor: "user-1",
      scope: ["nsfw_encounter", "nsfw_dialogue", "nsfw_chat",],
    },);

    expect(state.consent_scope).toEqual(["nsfw_encounter", "nsfw_dialogue", "nsfw_chat",]);
    expect(state.audit_trail).toHaveLength(1);
    expect(state.audit_trail[0]).toMatchObject({ action: "modified", });
  });

  test("overridden grants consent and records moderator", () => {
    const state = createConsentState(["nsfw_encounter",]);
    recordConsentAction(state, "overridden", {
      actor: "system",
      moderator: "admin-9",
      reason: "moderation override",
    },);

    expect(state.consent_given).toBe(true);
    expect(state.audit_trail[0]).toMatchObject({
      action: "overridden",
      moderator: "admin-9",
    });
  });

  test("records context when provided", () => {
    const state = createConsentState(["nsfw_encounter",]);
    recordConsentAction(state, "given", {
      actor: "user-1",
      context: { chat_id: "chat-42", encounter_id: "enc-7", },
    },);

    expect(state.audit_trail[0]!.context).toEqual({
      chat_id: "chat-42",
      encounter_id: "enc-7",
    });
  });
});

describe("isActionConsented", () => {
  test("false when consent not given", () => {
    const state = createConsentState(["nsfw_encounter",]);
    expect(isActionConsented(state, "nsfw_encounter",)).toBe(false);
  });

  test("true when consent given and action in scope", () => {
    const state = createConsentState(["nsfw_encounter", "nsfw_dialogue",]);
    recordConsentAction(state, "given", { actor: "user-1", },);
    expect(isActionConsented(state, "nsfw_encounter",)).toBe(true);
    expect(isActionConsented(state, "nsfw_dialogue",)).toBe(true);
  });

  test("false for actions outside consent scope", () => {
    const state = createConsentState(["nsfw_encounter",]);
    recordConsentAction(state, "given", { actor: "user-1", },);
    expect(isActionConsented(state, "nsfw_chat",)).toBe(false);
    expect(isActionConsented(state, "nsfw_dialogue",)).toBe(false);
  });

  test("false for empty scope even when given", () => {
    const state = createConsentState();
    recordConsentAction(state, "given", { actor: "user-1", },);
    expect(isActionConsented(state, "nsfw_encounter",)).toBe(false);
  });
});

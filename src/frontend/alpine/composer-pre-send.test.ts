// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the composer pre-send helpers
 * (TASK-chat-feature-entry-field-pre-send).
 *
 * Coverage targets the four public surfaces:
 *  - draft persistence (round-trip, expiry, multi-chat)
 *  - send gate (every blocking rule + allow paths)
 *  - validator (mentions, [PASS], initiative prefix, asset refs)
 *  - decodeStoredDraft malformed-input handling
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { TurnStrategy, } from "../../db/enums-core/users";
import { createLogger, } from "../../logger";
import {
  attachValidateDraft,
  computeSendBlocked,
  createComposerPreSend,
  decodeStoredDraft,
  DRAFT_STORAGE_KEY,
  DRAFT_TTL_MS,
  sendBlockedReasonText,
  validatePreSend,
} from "./composer-pre-send";

/** Build an in-memory Storage shim that satisfies the Storage interface. */
function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key,) {
      return map.has(key,) ? map.get(key,) ?? null : null;
    },
    key(index,) {
      return [...map.keys(),][index] ?? null;
    },
    removeItem(key,) {
      map.delete(key,);
    },
    setItem(key, value,) {
      map.set(key, value,);
    },
  };
}

describe("decodeStoredDraft", () => {
  test("returns null for empty input", () => {
    expect(decodeStoredDraft(null,),).toBeNull();
    expect(decodeStoredDraft("",),).toBeNull();
  });
  test("returns null for malformed JSON", () => {
    expect(decodeStoredDraft("not-json",),).toBeNull();
  });
  test("returns null when fields have wrong types", () => {
    expect(decodeStoredDraft(JSON.stringify({ chatId: 1, text: "x", savedAt: 0, },),),).toBeNull();
  });
  test("returns null when the draft has expired", () => {
    const old = { chatId: "c", text: "hi", savedAt: Date.now() - DRAFT_TTL_MS - 1, };
    expect(decodeStoredDraft(JSON.stringify(old,),),).toBeNull();
  });
  test("returns the parsed entry for a fresh, well-formed payload", () => {
    const now = Date.now();
    const raw = JSON.stringify({ chatId: "c", text: "hi", savedAt: now, },);
    const out = decodeStoredDraft(raw,);
    expect(out,).not.toBeNull();
    expect(out,).toEqual({ chatId: "c", text: "hi", savedAt: now, },);
  });
});

describe("createComposerPreSend - draft persistence", () => {
  let storage: Storage;
  let clockNow: number;
  beforeEach(() => {
    storage = makeStorage();
    clockNow = 1_700_000_000_000;
  },);
  afterEach(() => {
    storage.clear();
  },);
  test("persistDraft writes a typed entry under the storage key", () => {
    const composer = createComposerPreSend({ storage, now: () => clockNow, },);
    composer.persistDraft("chat-A", "hello",);
    const raw = storage.getItem(DRAFT_STORAGE_KEY,);
    expect(raw,).not.toBeNull();
    const map = JSON.parse(raw ?? "{}",) as Record<string, { chatId: string; text: string; savedAt: number }>;
    expect(map["chat-A"],).toEqual({ chatId: "chat-A", text: "hello", savedAt: clockNow, },);
  });
  test("persistDraft removes the entry when text is empty/whitespace", () => {
    const composer = createComposerPreSend({ storage, now: () => clockNow, },);
    composer.persistDraft("chat-A", "hello",);
    composer.persistDraft("chat-A", "   ",);
    const raw = storage.getItem(DRAFT_STORAGE_KEY,);
    const map = JSON.parse(raw ?? "{}",) as Record<string, unknown>;
    expect(map["chat-A"],).toBeUndefined();
  });
  test("restoreDraft returns the stored text for the active chat", () => {
    const composer = createComposerPreSend({ storage, now: () => clockNow, },);
    composer.persistDraft("chat-A", "draft one",);
    composer.persistDraft("chat-B", "draft two",);
    expect(composer.restoreDraft("chat-A",),).toBe("draft one",);
    expect(composer.restoreDraft("chat-B",),).toBe("draft two",);
  });
  test("restoreDraft returns null for an unknown chat id", () => {
    const composer = createComposerPreSend({ storage, now: () => clockNow, },);
    composer.persistDraft("chat-A", "x",);
    expect(composer.restoreDraft("chat-Z",),).toBeNull();
  });
  test("restoreDraft evicts a stale entry beyond the TTL", () => {
    const composer = createComposerPreSend({ storage, now: () => clockNow, },);
    composer.persistDraft("chat-A", "old",);
    // Advance the clock past the TTL.
    const stale = clockNow + DRAFT_TTL_MS + 10_000;
    const composerLater = createComposerPreSend({ storage, now: () => stale, },);
    expect(composerLater.restoreDraft("chat-A",),).toBeNull();
    // The stale entry is removed during eviction.
    const map = JSON.parse(storage.getItem(DRAFT_STORAGE_KEY,) ?? "{}",) as Record<string, unknown>;
    expect(map["chat-A"],).toBeUndefined();
  });
  test("restoreDraft returns null when storage is unavailable", () => {
    const composer = createComposerPreSend({ storage: null, now: () => clockNow, },);
    expect(composer.restoreDraft("chat-A",),).toBeNull();
    // persistDraft is a no-op without storage.
    composer.persistDraft("chat-A", "hi",);
    expect(storage.getItem(DRAFT_STORAGE_KEY,),).toBeNull();
  });
  test("restoreDraft returns null when storage holds malformed JSON", () => {
    storage.setItem(DRAFT_STORAGE_KEY, "not-json",);
    const composer = createComposerPreSend({ storage, now: () => clockNow, },);
    expect(composer.restoreDraft("chat-A",),).toBeNull();
  });
  test("restoreDraft evicts an entry whose payload has wrong field types", () => {
    // chatId field is a number — decodeStoredDraft rejects, restoreDraft
    // must clean the bad entry so it does not linger across reloads.
    const bad = JSON.stringify({ chatId: 1, text: "x", savedAt: clockNow, },);
    storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ "chat-A": JSON.parse(bad,), },),);
    const composer = createComposerPreSend({ storage, now: () => clockNow, },);
    expect(composer.restoreDraft("chat-A",),).toBeNull();
    const map = JSON.parse(storage.getItem(DRAFT_STORAGE_KEY,) ?? "{}",) as Record<string, unknown>;
    expect(map["chat-A"],).toBeUndefined();
  });
  test("persistDraft preserves existing drafts for other chats", () => {
    const composer = createComposerPreSend({ storage, now: () => clockNow, },);
    composer.persistDraft("chat-A", "a",);
    composer.persistDraft("chat-B", "b",);
    composer.persistDraft("chat-A", "a2",);
    expect(composer.restoreDraft("chat-A",),).toBe("a2",);
    expect(composer.restoreDraft("chat-B",),).toBe("b",);
  });
});

describe("computeSendBlocked", () => {
  const base = {
    activeChat: "chat-1",
    isPaused: false,
    currentActorId: "actor-1",
    impersonatingActorId: null as string | null,
    turnStrategy: TurnStrategy.RoundRobin,
    turnOrder: ["actor-1", "actor-2",],
    currentActorIdForTurn: "actor-1",
    userActorId: "actor-1",
  };
  test("blocks when no chat is active", () => {
    expect(computeSendBlocked({ ...base, activeChat: null, },),).toBe("no_active_chat",);
  });
  test("blocks when the chat is paused", () => {
    expect(computeSendBlocked({ ...base, isPaused: true, },),).toBe("chat_paused",);
  });
  test("blocks when neither impersonation nor user actor resolves", () => {
    expect(computeSendBlocked({
      ...base,
      userActorId: null,
    },),).toBe("no_actor_selected",);
  });
  test("blocks when the resolved actor is not the current speaker", () => {
    expect(computeSendBlocked({
      ...base,
      currentActorIdForTurn: "actor-2",
    },),).toBe("not_your_turn",);
  });
  test("blocks when the resolved actor is missing from the turn order", () => {
    expect(computeSendBlocked({
      ...base,
      userActorId: "actor-3",
      currentActorIdForTurn: "actor-3",
    },),).toBe("not_your_turn",);
  });
  test("allows when the resolved actor is the current speaker in round_robin", () => {
    expect(computeSendBlocked(base,),).toBeNull();
  });
  test("allows under scene_based when it is the current speaker's turn", () => {
    expect(computeSendBlocked({
      ...base,
      turnStrategy: TurnStrategy.SceneBased,
    },),).toBeNull();
  });
  test("does NOT block for freeform strategies (initiative / hybrid)", () => {
    for (const strategy of [TurnStrategy.Initiative, TurnStrategy.QuestDriven, TurnStrategy.Hybrid,]) {
      expect(computeSendBlocked({
        ...base,
        turnStrategy: strategy,
        // Even a non-current speaker is allowed client-side.
        currentActorIdForTurn: "actor-2",
      },),).toBeNull();
    }
  });
  test("does NOT block when turnStrategy is null (direct chat / unset)", () => {
    expect(computeSendBlocked({
      ...base,
      turnStrategy: null,
      currentActorIdForTurn: "actor-2",
    },),).toBeNull();
  });
  test("treats impersonatingActorId as the resolved actor", () => {
    expect(computeSendBlocked({
      ...base,
      userActorId: "actor-1",
      impersonatingActorId: "actor-2",
      currentActorIdForTurn: "actor-2",
      turnOrder: ["actor-2", "actor-1",],
    },),).toBeNull();
    // Impersonated actor that is not the current speaker → blocked.
    expect(computeSendBlocked({
      ...base,
      userActorId: "actor-1",
      impersonatingActorId: "actor-2",
      currentActorIdForTurn: "actor-1",
      turnOrder: ["actor-2", "actor-1",],
    },),).toBe("not_your_turn",);
  });
  test("treats an empty turn order as 'order not yet computed' → allow", () => {
    expect(computeSendBlocked({
      ...base,
      turnOrder: [],
      currentActorIdForTurn: null,
    },),).toBeNull();
  });
});

describe("sendBlockedReasonText", () => {
  test("returns a non-empty string for every reason", () => {
    for (const reason of ["no_active_chat", "chat_paused", "no_actor_selected", "not_your_turn",] as const) {
      expect(sendBlockedReasonText(reason,).length,).toBeGreaterThan(0,);
    }
  });
});

describe("validatePreSend", () => {
  beforeEach(() => {
    createLogger({ level: "error", },);
  },);
  const participants = [
    { actorId: "a1", displayName: "Alice", },
    { actorId: "a2", displayName: "Bob", },
  ];
  test("flags an empty draft as not ok", () => {
    const out = validatePreSend("", participants, [],);
    expect(out.ok,).toBe(false,);
    expect(out.mentionedActorIds,).toEqual([],);
  });
  test("resolves @-mentions against the participant set", () => {
    const out = validatePreSend("hello @Alice and @Bob!", participants, [],);
    expect(out.ok,).toBe(true,);
    expect(out.mentionedActorIds,).toEqual(["a1", "a2",],);
    expect(out.unresolvedMentions,).toEqual([],);
  });
  test("flags unresolved mentions", () => {
    const out = validatePreSend("@Carol @Alice", participants, [],);
    expect(out.unresolvedMentions,).toEqual(["Carol",],);
    expect(out.mentionedActorIds,).toEqual(["a1",],);
  });
  test("detects the [PASS] opt-out token", () => {
    expect(validatePreSend("I'm done here [PASS]", participants, [],).isPassToken,).toBe(true,);
    expect(validatePreSend("just chatting", participants, [],).isPassToken,).toBe(false,);
  });
  test("detects the initiative `>>` prefix", () => {
    expect(validatePreSend(">> acting first", participants, [],).isInitiativeClaim,).toBe(true,);
    expect(validatePreSend("no prefix here", participants, [],).isInitiativeClaim,).toBe(false,);
  });
  test("flags unknown asset: refs against pendingAssetIds", () => {
    const out = validatePreSend(
      "see asset:uploaded and asset:ghost",
      participants,
      ["uploaded",],
    );
    expect(out.unknownAssetRefs,).toEqual(["ghost",],);
  });
  test("treats all-known asset refs as unknown-free", () => {
    const out = validatePreSend(
      "see asset:a1 and asset:a2",
      participants,
      ["a1", "a2",],
    );
    expect(out.unknownAssetRefs,).toEqual([],);
  });
  test("deduplicates repeated unresolved mentions", () => {
    const out = validatePreSend("@Carol @Carol @Carol", participants, [],);
    expect(out.unresolvedMentions,).toEqual(["Carol",],);
  });
});

describe("attachValidateDraft", () => {
  test("exposes validateDraft wired to validatePreSend", () => {
    const base = createComposerPreSend({ storage: makeStorage(), },);
    const composed = attachValidateDraft(base,);
    const result = composed.validateDraft("hi @Alice", [{ actorId: "a1", displayName: "Alice", },], [],);
    expect(result.ok,).toBe(true,);
    expect(result.mentionedActorIds,).toEqual(["a1",],);
  });
  test("preserves the underlying factory fields", () => {
    const base = createComposerPreSend({ storage: makeStorage(), },);
    const composed = attachValidateDraft(base,);
    expect(composed._draftStorageKey,).toBe(DRAFT_STORAGE_KEY,);
    expect(composed._draftTtlMs,).toBe(DRAFT_TTL_MS,);
  });
});

describe("isSendBlocked side-effects", () => {
  test("updates _sendBlockedReason + _sendBlockedHint on the host object", () => {
    const host = attachValidateDraft(createComposerPreSend({ storage: makeStorage(), },),) as {
      isSendBlocked: ReturnType<typeof createComposerPreSend>["isSendBlocked"];
      _sendBlockedReason: string | null;
      _sendBlockedHint: string;
    };
    const reason = host.isSendBlocked({
      activeChat: null,
      isPaused: false,
      currentActorId: null,
      impersonatingActorId: null,
      turnStrategy: null,
      turnOrder: [],
      currentActorIdForTurn: null,
      userActorId: null,
    },);
    expect(reason,).toBe("no_active_chat",);
    expect(host._sendBlockedReason,).toBe("no_active_chat",);
    expect(host._sendBlockedHint.length,).toBeGreaterThan(0,);

    host.isSendBlocked({
      activeChat: "chat-1",
      isPaused: false,
      currentActorId: "actor-1",
      impersonatingActorId: null,
      turnStrategy: null,
      turnOrder: [],
      currentActorIdForTurn: null,
      userActorId: "actor-1",
    },);
    expect(host._sendBlockedReason,).toBeNull();
    expect(host._sendBlockedHint,).toBe("",);
  });
});

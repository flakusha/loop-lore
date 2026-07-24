import { describe, expect, it, } from "bun:test";
import {
  checkModerationPermission,
  createModerationAction,
  getShadowState,
  isBanned,
  isBlocked,
} from "./moderation";
import type { ModerationAction, } from "./types";

describe("createModerationAction", () => {
  it("creates a moderation action with defaults", () => {
    const action = createModerationAction({
      type: "ban",
      targetActorId: "user-1",
      scope: "global",
      actorId: "admin-1",
    },);

    expect(action.type,).toBe("ban",);
    expect(action.targetActorId,).toBe("user-1",);
    expect(action.scope,).toBe("global",);
    expect(action.actorId,).toBe("admin-1",);
    expect(action.internal,).toBe(true,);
  });

  it("respects custom internal flag", () => {
    const action = createModerationAction({
      type: "flag",
      targetActorId: "user-1",
      scope: "chat",
      actorId: "user-2",
      internal: false,
    },);

    expect(action.internal,).toBe(false,);
  });

  it("includes reason when provided", () => {
    const action = createModerationAction({
      type: "block",
      targetActorId: "user-1",
      scope: "chat",
      actorId: "user-2",
      reason: "Spam",
    },);

    expect(action.reason,).toBe("Spam",);
  });
});

describe("checkModerationPermission", () => {
  const banAction = createModerationAction({
    type: "ban",
    targetActorId: "user-1",
    scope: "global",
    actorId: "admin-1",
  },);

  const shadowAction = createModerationAction({
    type: "shadow",
    targetActorId: "user-1",
    scope: "chat",
    actorId: "owner-1",
  },);

  const blockAction = createModerationAction({
    type: "block",
    targetActorId: "user-1",
    scope: "chat",
    actorId: "user-2",
  },);

  const flagAction = createModerationAction({
    type: "flag",
    targetActorId: "user-1",
    scope: "chat",
    actorId: "user-2",
  },);

  it("rejects self-moderation", () => {
    const result = checkModerationPermission(banAction, "admin", true,);
    expect(result.allowed,).toBe(false,);
    expect(result.reason,).toContain("yourself",);
  });

  it("allows admin to ban", () => {
    const result = checkModerationPermission(banAction, "admin", false,);
    expect(result.allowed,).toBe(true,);
  });

  it("allows owner to ban", () => {
    const result = checkModerationPermission(banAction, "owner", false,);
    expect(result.allowed,).toBe(true,);
  });

  it("rejects regular user banning", () => {
    const result = checkModerationPermission(banAction, "user", false,);
    expect(result.allowed,).toBe(false,);
    expect(result.reason,).toContain("admin",);
  });

  it("allows owner to shadow in chat", () => {
    const result = checkModerationPermission(shadowAction, "owner", false,);
    expect(result.allowed,).toBe(true,);
  });

  it("allows admin to shadow in chat", () => {
    const adminShadow = createModerationAction({
      type: "shadow",
      targetActorId: "user-1",
      scope: "chat",
      actorId: "admin-1",
    },);
    const result = checkModerationPermission(adminShadow, "admin", false,);
    expect(result.allowed,).toBe(true,);
  });

  it("rejects regular user shadowing", () => {
    const result = checkModerationPermission(shadowAction, "user", false,);
    expect(result.allowed,).toBe(false,);
  });

  it("allows any user to block", () => {
    const result = checkModerationPermission(blockAction, "user", false,);
    expect(result.allowed,).toBe(true,);
  });

  it("allows any user to flag", () => {
    const result = checkModerationPermission(flagAction, "user", false,);
    expect(result.allowed,).toBe(true,);
  });
});

describe("isBlocked", () => {
  const blocks: ModerationAction[] = [
    createModerationAction({ type: "block", targetActorId: "user-1", scope: "chat", actorId: "user-2", },),
    createModerationAction({ type: "block", targetActorId: "user-1", scope: "global", actorId: "user-2", },),
  ];

  it("returns true for blocked user in chat scope", () => {
    expect(isBlocked(blocks, "user-1", "chat",),).toBe(true,);
  });

  it("returns true for blocked user via global scope", () => {
    expect(isBlocked(blocks, "user-1", "comment",),).toBe(true,); // global blocks all
  });

  it("returns false for unblocked user", () => {
    expect(isBlocked(blocks, "user-99", "chat",),).toBe(false,);
  });

  it("returns false for empty list", () => {
    expect(isBlocked([], "user-1", "chat",),).toBe(false,);
  });
});

describe("isBanned", () => {
  const bans: ModerationAction[] = [
    createModerationAction({ type: "ban", targetActorId: "bad-user", scope: "global", actorId: "admin", },),
  ];

  it("returns true for banned user", () => {
    expect(isBanned(bans, "bad-user",),).toBe(true,);
  });

  it("returns false for non-banned user", () => {
    expect(isBanned(bans, "good-user",),).toBe(false,);
  });

  it("returns false for empty list", () => {
    expect(isBanned([], "bad-user",),).toBe(false,);
  });
});

describe("getShadowState", () => {
  const actions: ModerationAction[] = [
    createModerationAction({ type: "shadow", targetActorId: "viewer-1", scope: "chat", actorId: "admin", },),
    createModerationAction({ type: "collapse", targetActorId: "viewer-2", scope: "chat", actorId: "admin", },),
  ];

  it("returns shadow for shadowed viewer", () => {
    expect(getShadowState(actions, "viewer-1",),).toBe("shadow",);
  });

  it("returns collapse for collapsed viewer", () => {
    expect(getShadowState(actions, "viewer-2",),).toBe("collapse",);
  });

  it("returns null for unaffected viewer", () => {
    expect(getShadowState(actions, "viewer-3",),).toBeNull();
  });

  it("returns null for empty list", () => {
    expect(getShadowState([], "viewer-1",),).toBeNull();
  });
});

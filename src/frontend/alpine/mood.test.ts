import { describe, expect, it, } from "bun:test";
import { moodState, } from "./mood";

/**
 * Minimal, concrete scope for exercising the pure `avatarForMessage` resolver.
 * `moodState` is `Partial<ChatState>`, so we extract the resolver as a
 * standalone function and bind it to a plain object with only the fields it
 * reads — avoiding ChatState shape requirements (e.g. currentCharacter.id).
 */
type AvatarVariant = { emotion: string; avatarId: string; assetId: string };
type ResolverScope = {
  _emotionAvatars: AvatarVariant[];
  _emotionAvatarsByActor: Record<string, AvatarVariant[]>;
  _actorBaseAvatars: Record<string, string>;
  currentCharacter: { avatar_asset_id?: string } | null;
  _currentEmotionAvatar?: string | null;
};

type MessageLike = { role?: string; emotion?: string | null; actor_id?: string | null };

// Narrow the resolver to a concrete function type (not undefined, not Partial).
const avatarForMessage = moodState.avatarForMessage as unknown as (
  this: ResolverScope,
  msg: MessageLike,
) => string | null;

describe("avatarForMessage (per-message emotion-avatar binding)", () => {
  /** Scope with the per-actor maps defaulted to empty (legacy direct-chat shape). */
  function legacyScope(
    overrides: Partial<ResolverScope> & Pick<ResolverScope, "_emotionAvatars" | "currentCharacter">,
  ): ResolverScope {
    return { _emotionAvatarsByActor: {}, _actorBaseAvatars: {}, ...overrides, };
  }

  it("returns null for user messages", () => {
    const scope = legacyScope({
      _emotionAvatars: [],
      currentCharacter: { avatar_asset_id: "base", },
    },);

    expect(avatarForMessage.call(scope, { role: "user", emotion: "happy", },),).toBeNull();
  });

  it("resolves the emotion-matching avatar variant for an assistant message", () => {
    const scope = legacyScope({
      _emotionAvatars: [
        { emotion: "happy", avatarId: "av-1", assetId: "asset-happy", },
        { emotion: "sad", avatarId: "av-2", assetId: "asset-sad", },
      ],
      currentCharacter: { avatar_asset_id: "base", },
    },);

    expect(avatarForMessage.call(scope, { role: "assistant", emotion: "happy", },),).toBe("asset-happy",);
  });

  it("falls back to the neutral variant when the emotion has no exact match", () => {
    const scope = legacyScope({
      _emotionAvatars: [
        { emotion: "neutral", avatarId: "av-n", assetId: "asset-neutral", },
        { emotion: "sad", avatarId: "av-2", assetId: "asset-sad", },
      ],
      currentCharacter: { avatar_asset_id: "base", },
    },);

    expect(avatarForMessage.call(scope, { role: "assistant", emotion: "confused", },),).toBe("asset-neutral",);
  });

  it("falls back to the character base avatar when the message has no emotion", () => {
    const scope = legacyScope({
      _emotionAvatars: [{ emotion: "happy", avatarId: "av-1", assetId: "asset-happy", },],
      currentCharacter: { avatar_asset_id: "base", },
    },);

    expect(avatarForMessage.call(scope, { role: "assistant", emotion: undefined, },),).toBe("base",);
  });

  it("is pure — does NOT mutate the global _currentEmotionAvatar", () => {
    const scope = legacyScope({
      _emotionAvatars: [
        { emotion: "happy", avatarId: "av-1", assetId: "asset-happy", },
        { emotion: "sad", avatarId: "av-2", assetId: "asset-sad", },
      ],
      currentCharacter: { avatar_asset_id: "base", },
      _currentEmotionAvatar: "asset-sad",
    },);

    expect(avatarForMessage.call(scope, { role: "assistant", emotion: "happy", },),).toBe("asset-happy",);
    // The global mood-driven selection stays untouched.
    expect(scope._currentEmotionAvatar,).toBe("asset-sad",);
  });

  it("resolves a group message against its author actor's variants, not the flat list", () => {
    const scope = legacyScope({
      _emotionAvatars: [{ emotion: "happy", avatarId: "av-flat", assetId: "asset-flat-happy", },],
      _emotionAvatarsByActor: {
        "actor-luna": [{ emotion: "happy", avatarId: "av-luna", assetId: "asset-luna-happy", },],
      },
      _actorBaseAvatars: { "actor-luna": "base-luna", },
      currentCharacter: { avatar_asset_id: "base", },
    },);

    expect(avatarForMessage.call(
      scope,
      { role: "assistant", emotion: "happy", actor_id: "actor-luna", },
    ),).toBe("asset-luna-happy",);
  });

  it("falls back to the author actor's base avatar when it has no variants", () => {
    const scope = legacyScope({
      _emotionAvatars: [{ emotion: "happy", avatarId: "av-flat", assetId: "asset-flat-happy", },],
      _emotionAvatarsByActor: { "actor-max": [], },
      _actorBaseAvatars: { "actor-max": "base-max", },
      currentCharacter: { avatar_asset_id: "base", },
    },);

    expect(avatarForMessage.call(
      scope,
      { role: "assistant", emotion: "happy", actor_id: "actor-max", },
    ),).toBe("base-max",);
  });

  it("keeps the legacy flat-list walk for messages with no known author", () => {
    const scope = legacyScope({
      _emotionAvatars: [{ emotion: "happy", avatarId: "av-flat", assetId: "asset-flat-happy", },],
      currentCharacter: { avatar_asset_id: "base", },
    },);

    expect(avatarForMessage.call(scope, { role: "assistant", emotion: "happy", },),).toBe("asset-flat-happy",);
    expect(avatarForMessage.call(
      scope,
      { role: "assistant", emotion: "happy", actor_id: "actor-unknown", },
    ),).toBe("asset-flat-happy",);
  });
});

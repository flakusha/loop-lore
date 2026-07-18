/**
 * Branded Types — Nominal typing for ID safety
 *
 * Prevents accidental mix-up of string IDs that represent different entities.
 * All IDs in the codebase are UUID strings, making them structurally identical.
 * Branded types add a compile-time tag that makes each ID type incompatible.
 *
 * Usage:
 *   import { type UserId, type ChatId } from "../utils/brands";
 *
 *   function getUser(id: UserId): Promise<User> { ... }
 *
 *   const userId = "usr_123" as UserId;
 *   const chatId = "chat_456" as ChatId;
 *   getUser(userId);  // ✅ ok
 *   getUser(chatId);  // ❌ compile error
 */

/** Generic brand type — intersects Base with a readonly tag */
export type Brand<Base, Tag extends string> = Base & { readonly __brand: Tag };

/** Create a branded value from a raw string */
export function brand<T extends string>(raw: string): Brand<string, T> {
  return raw as Brand<string, T>;
}

/** Extract the underlying string from a branded type */
export function unbrand<T extends string>(branded: Brand<string, T>): string {
  return branded;
}

// ── Entity ID Types ──────────────────────────────────────────

/** User account ID */
export type UserId = Brand<string, "UserId">;

/** Chat/conversation ID */
export type ChatId = Brand<string, "ChatId">;

/** Actor ID (unified participant: user, character, narrator, system) */
export type ActorId = Brand<string, "ActorId">;

/** Character card ID */
export type CharacterId = Brand<string, "CharacterId">;

/** Message ID */
export type MessageId = Brand<string, "MessageId">;

/** Asset ID */
export type AssetId = Brand<string, "AssetId">;

/** World ID */
export type WorldId = Brand<string, "WorldId">;

/** Quest ID */
export type QuestId = Brand<string, "QuestId">;

/** Generation attempt ID */
export type AttemptId = Brand<string, "AttemptId">;

/** Plugin name (string key, branded for safety) */
export type PluginName = Brand<string, "PluginName">;

/** Persona ID */
export type PersonaId = Brand<string, "PersonaId">;

/** Session ID */
export type SessionId = Brand<string, "SessionId">;

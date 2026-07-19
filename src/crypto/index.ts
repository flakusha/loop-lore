/**
 * Crypto Module — Server-Side Message Encryption
 *
 * Key hierarchy:
 *   SMK (env var) → actor_keys (SMK-encrypted) → chat key (HKDF-derived)
 *
 * Usage:
 *   1. loadSmk(config.encryption) on startup → smk: CryptoKey | null
 *   2. ensureActorKey(db, actorId, smk) when creating actors / logging in
 *   3. deriveChatKeyForChat(db, chatId, smk) on message write/read → chatKey
 *   4. compressThenEncrypt(plaintext, chatKey, keyId, config) → stored JSON
 *   5. decryptThenDecompress(storedJSON, chatKey) → plaintext
 */

export {
  ensureActorKey,
  generateActorKey,
  getActorKey,
  listActorKeys,
  loadActorKeys,
  revokeActorKey,
  rotateActorKey,
} from "./actor-keys";
export type { ActorKeyData, ActorKeyMeta, } from "./actor-keys";
export { decryptValue, encryptValue, } from "./byok";
export { deriveChatKey, deriveChatKeyForChat, getChatParticipantActorIds, } from "./chat-keys";
export type { ChatKey, } from "./chat-keys";
export { compressThenEncrypt, decryptThenDecompress, extractKeyIdFromPayload, isEncryptedPayload, } from "./pipeline";
export type { EncryptedPayload, PipelineConfig, } from "./pipeline";
export { getSmk, initSmk, isEncryptionEnabled, } from "./smk";

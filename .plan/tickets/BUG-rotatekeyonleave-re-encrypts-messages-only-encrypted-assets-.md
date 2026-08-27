# BUG: rotateKeyOnLeave re-encrypts messages only - encrypted assets become undecryptable

**Status:** 🔧 In Progress (worktree `fix-auth-security-bugs`)
**Priority:** high
**Effort:** Medium

## Summary

Location: src/crypto/key-distribution.ts rotateKeyOnLeave; src/crypto/key-rotation/re-encrypt.ts reEncryptChatAssets (zero production callers); src/routes/chats/participants.ts DELETE /chats/:id/participants/:actorId.

Symptom: leaving a standard-tier chat rotates the chat key (chat_keys row replaced). Asset blobs in that chat are encrypted with per-asset HKDF subkeys derived from the CURRENT chat key raw material (src/crypto/asset-encryption.ts deriveAssetSubkey). After rotation the stored subkey derivation input is gone: decryptAssetBlob derives from the NEW chat key, AES-GCM auth fails, asset raw/thumb endpoints error permanently. Data loss for all encrypted assets in the chat.

Root cause: rotateKeyOnLeave calls reEncryptWithKeys(messages) but never reEncryptChatAssets; grep confirms reEncryptChatAssets has no caller outside tests. Additionally reEncryptChatAssets as written decrypts with the CURRENT chat key, so it cannot repair post-rotation blobs either - it needs explicit old+new keys like the message path.

Fix: call an asset re-encryption step inside rotateKeyOnLeave BEFORE swapping chat_keys.id, using oldChatKey/newChatKey explicitly (mirror reEncryptWithKeys signature); surface asset failures into the same failures array that aborts rotation. Note encryptAssetBlob also base64-encodes binary before compressing (~33% pre-expansion) - optional follow-up, not required here.

Acceptance:
- [ ] integration test: standard chat + encrypted asset -> member leaves -> asset decrypts
- [ ] asset failures abort rotation like message failures do

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

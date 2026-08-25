# BUG: encrypted-payload sniffing misclassifies user JSON as pre-encrypted content

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

Location: src/crypto/pipeline.ts isEncryptedPayload; src/crypto/at-rest.ts isE2eOrEncrypted + encryptAtRest pre-check; src/routes/messages/post.ts prepareContentStorage; src/routes/messages/update.ts:106.

Symptom: any user-typed message whose text parses as JSON with {enc:string, nonce:string, algo:'aes-256-gcm', key_id:string} is treated as client-pre-encrypted: stored VERBATIM with the attacker-chosen key_id and never server-encrypted (verified: isEncryptedPayload(crafted)=true). On read, decryptAtRest attempts decryption with chat_keys[key_id] -> throws -> reader sees '[Encrypted - unable to decrypt]'. In group chats any participant can post such a message; it is also impossible to legitimately SEND text of that shape. isE2eOrEncrypted is looser still: any JSON object with a string 'enc' field counts.

Root cause: shape-sniffing stored content instead of tracking encryption state explicitly.

Fix (pick one):
a) validate strictly before trusting: require base64-decodable enc/nonce, nonce length 12, algo exact, AND key_id EXISTS in chat_keys before skipping encryption; otherwise treat as plaintext.
b) stop sniffing on write: add an explicit persisted flag/column (or reuse key_id NOT NULL as the sole signal) so classification never depends on content inspection. Read path can keep sniffing only as a migration fallback.
Note PATCH /api/messages/:id returns content=storedContent in its response - for encrypted chats this hands the raw ciphertext JSON back to the client as the edited message body; return decrypted-or-placeholder like the read routes do.

Acceptance:
- [ ] posting literal payload-shaped JSON stores it as normal encrypted/plain content
- [ ] read path no longer 500s/placeholders on legit JSON messages
- [ ] unit tests for isEncryptedPayload strictness + PATCH response shape

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

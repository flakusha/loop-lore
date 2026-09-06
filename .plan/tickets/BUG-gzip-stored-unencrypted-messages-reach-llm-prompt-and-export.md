# BUG: gzip-stored unencrypted messages reach LLM prompt and exports as base64

**Status:** ✅ Resolved
**Priority:** high
**Effort:** Small

## Summary

Location: src/assistant/prompt/sections/chat-history.ts:49-61; src/routes/export-shared/chats.ts:56-59; same pattern in src/routes/chat-export/export-route.ts.

Symptom: prepareContentStorage (src/routes/messages/post.ts) gzip+base64-encodes any plaintext over 10,240 chars with content_encoding='gzip' and key_id=null. Both consumers above only transform when 'smk && row.key_id'; unencrypted gzip rows are passed through raw. Result: the model receives base64 gzip soup as chat history (and token estimates inflate ~1.3-4x), and ZIP exports carry undecodable content with no encoding marker at all.

Fix: both paths should call decodeContent(row.content, row.content_encoding) when encoding != identity (mirroring resolveMessageContent in src/routes/messages/helpers.ts). Export JSON should include per-message encoding or export decoded plaintext only. Consider a shared helper to eliminate the three divergent copies of this logic.

Acceptance:
- [ ] prompt section test: >10KB message stored as gzip reaches the prompt as plaintext
- [ ] export test: gzip-stored message exports as plaintext
- [ ] no behavior change for identity rows

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Fixed on dev (verified against HEAD a263608e): all three consumers (`src/assistant/prompt/sections/chat-history.ts`, `src/routes/export-shared/chats.ts`, `src/routes/chat-export/export-route.ts`) now route through `resolveMessageContent` (`src/routes/messages/helpers.ts`), which decodes gzip/brotli/zstd rows (encoding ≠ identity) and decrypts `key_id` rows; identity rows pass through unchanged. Zero remaining inline `smk && row.key_id`-style transforms.

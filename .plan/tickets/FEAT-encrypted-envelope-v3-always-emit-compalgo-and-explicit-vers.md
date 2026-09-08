# FEAT: encrypted envelope v3 - always emit compAlgo and explicit version field

**Status:** ✅ Done
**Priority:** low
**Effort:** Small

## Summary

Location: src/crypto/pipeline.ts EncryptedPayload / compressThenEncrypt / decryptThenDecompress; docs/frontend/encryption.md Compress-Encrypt Pipeline.

Motivation: today compAlgo is optional; a missing field on comp=true triggers a blind gzip guess whose failure silently displays raw base64 (spec'd fallback but lossy). There is also no envelope version marker, so future format changes cannot be detected before attempting decrypt.

Scope:
- always set compAlgo when comp=true (drop the ?? 'gzip' guess path)
- add v: 1|2|3 (or reuse presence of a_id as v2 today) so readers can branch explicitly
- consider moving compression metadata out-of-band long-term (content_encoding column or a sidecar field) per BUG-encrypted-payload-sniffing-misclassifies-user-json-as-pre-en fix direction b
- document in docs/frontend/encryption.md Storage Format section

Acceptance:
- [x] new payloads always carry compAlgo when compressed
- [x] legacy payloads without compAlgo still read (back-compat path kept)
- [x] spec updated

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Verified against src/ in ticket-closeout-audit: pipeline.ts always emits compAlgo; legacy back-compat path.

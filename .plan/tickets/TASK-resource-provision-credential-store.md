<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Credential Store (Hash & Wrapped-Key References)

**Status:** ⬜ Open
**Priority:** high
**Effort:** medium
**Epic:** epic-resource-provision
**Issue:** TBD
**Related:**
- `TASK-resource-provision-schema`
- `epic-byok-api-keys.md` — existing BYOK key hashing pattern
- `src/crypto/byok.ts` — existing BYOK encryption primitive

## Summary

Implement a credential store that holds only verifiable references
(plain SHA-256 hashes or key-wrapped references) for external
inference and storage providers. Raw secrets never touch the server.

## Context

`epic-byok-api-keys.md` stores LLM API keys exclusively in browser
localStorage and sends only a SHA-256 hash to the server. Resource
provision extends that model to **storage-provider credentials** and to
**server-side verifiable references** that survive session boundaries.

The existing `src/crypto/byok.ts` already implements symmetric-key
wrapping; this ticket reuses that primitive for the credential-reference
path while keeping the hash-only path for simpler providers.

## Design

Two credential-reference strategies per resource type:

| Strategy | Use case | Server holds |
| --- | --- | --- |
| `hash` | Simple API keys, endpoint URLs | SHA-256 of raw credential |
| `wrapped` | Storage credentials, multi-use tokens | Key-wrapped reference via `src/crypto/byok.ts` |

```typescript
type CredentialRef =
  | { strategy: "hash"; digest: string }        // SHA-256( raw )
  | { strategy: "wrapped"; wrapped: string };   // byok.ts key-wrap( raw )
```

- `storeCredential(raw: string, strategy): CredentialRef` — computes
  the reference; returns it, never persists the raw value.
- `verifyCredential(ref: CredentialRef, raw: string): boolean` —
  recomputes and compares; used at routing time without exposing raw.
- Raw credentials remain in browser IndexedDB only (session-scoped,
  cleared on logout).

## Acceptance Criteria

- [ ] `src/resource/credential-store.ts` — `storeCredential`,
  `verifyCredential`, `clearCredential`
- [ ] Hash strategy: SHA-256 of the raw credential (no salt; high-entropy)
- [ ] Wrapped strategy: reuses `src/crypto/byok.ts` key-wrap primitive
- [ ] Raw credential never written to any server-side log, DB, or response
- [ ] Browser-side store backed by IndexedDB (not localStorage — larger
  payloads, structured access)
- [ ] `verifyCredential` returns `false` on tampered or unknown reference
- [ ] Unit tests: hash strategy, wrapped strategy, round-trip verify,
  raw-credential never leaves client
- [ ] `bun run check` green

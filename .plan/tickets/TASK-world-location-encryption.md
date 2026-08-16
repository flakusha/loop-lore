<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Encryption — World/Location Encryption

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Large
**Epic:** epic-crypto
**Parent:** TASK-epic17-encryption-e2e-expansion
**Blocked by:** TASK-encryption-wire-message-pipeline (done)

## Summary

Extend encryption to worlds and locations. Key derivation chain: world key → location key → chat key. Assets inherit encryption from parent entity.

## What Exists

- `src/crypto/chat-keys.ts` — chat key derivation
- `src/crypto/at-rest.ts` — tier-aware encrypt/decrypt
- `src/db/schema.ts` — `worlds`, `locations` tables (no encryption columns)

## Design

```
World Key (derived from owner's actor key)
  └─ Location Key (derived from world key)
       └─ Chat Key (existing, derived from participant keys)

Schema Changes:
  worlds.encryption_level: 'public' | 'standard'
  locations.encryption_level: 'public' | 'standard'

Key Derivation:
  worldKey = HKDF(ownerActorKey, "loop-lore-world-key-v1")
  locationKey = HKDF(worldKey, "loop-lore-location-key-v1")
  chatKey = existing (from participant actor keys)
```

## Tasks

- [ ] Design key derivation chain (world → location → chat)
- [ ] Add `encryption_level` column to `worlds` table
- [ ] Add `encryption_level` column to `locations` table
- [ ] Implement `deriveWorldKey(database, worldId, ownerActorKey)`
- [ ] Implement `deriveLocationKey(database, locationId, worldKey)`
- [ ] Wire into world/location CRUD routes
- [ ] Wire into asset storage (inherit from parent)
- [ ] Add tests: key derivation, tier enforcement, asset inheritance

## Files to Create

- `src/crypto/world-keys.ts` — world/location key derivation
- `src/crypto/world-keys.test.ts` — tests

## Files to Modify

- `src/db/schema.ts` — add encryption_level columns
- `src/db/migrations/` — migration
- `src/routes/worlds.ts` — tier enforcement
- `src/routes/locations.ts` — tier enforcement
- `src/assets/service.ts` — inherit encryption from parent

## Risk

Med — key derivation chain complexity, backward compatibility with existing worlds.

## Linked Epics

- `epic-crypto.md`
- `TASK-epic17-encryption-e2e-expansion.md`

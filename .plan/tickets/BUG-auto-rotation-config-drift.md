<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Auto key-rotation is effectively disabled by config drift (KEY_ROTATION_DAYS not wired)

**Status:** 🟢 Closed
**Severity:** Medium
**Priority:** Medium
**Epic:** epic-crypto
**Related:** TASK-encryption-auto-key-rotation

## Summary

`startAutoRotationTimer` no-ops when `rotationDays <= 0`. The live config gives
`rotationDays` as `config.encryption.keyRotationDays ?? 0`, but the active
schema-class config has no `keyRotationDays` field and the env map has no
`KEY_ROTATION_DAYS`. The `keyRotationDays: 90` default lives only in the legacy
`src/config/sections/encryption.ts`, which is not the loaded config system.

## Root Causes

1. `src/config/schema-class/encryption.ts` — live defaults are only
   `{ required, compressThreshold, compressAlgorithm }`; no `keyRotationDays`.
2. `src/config/schema-class/env-map.ts:144-147` — maps `SERVER_ENCRYPTION_KEY`,
   `ENCRYPTION_REQUIRED`, `COMPRESS_THRESHOLD`, `COMPRESS_ALGORITHM`; no
   `KEY_ROTATION_DAYS`.
3. `src/server/start.ts:84-86` — `startAutoRotationTimer(db, config.encryption.keyRotationDays ?? 0, ...)`.
4. `src/crypto/key-rotation/timer.ts:21-43` — returns null when `rotationDays <= 0`.

## Impact

Auto-rotation never runs in production. Manual
`POST /api/admin/rotate-expired-keys` still works but is also broken by
`BUG-key-rotation-noop-orphans-history`.

## Acceptance Criteria

- [x] `KEY_ROTATION_DAYS` (default 90) wired into schema-class config + env map.
- [x] Timer starts when `keyRotationDays > 0`; verified in an integration test.
- [x] Rotation path itself fixed per `BUG-key-rotation-noop-orphans-history`.

## Verification Notes

**Not a bug** — current wiring is correct:

1. `src/config/schema-class/encryption.ts:11` — `keyRotationDays: 90` is in `ENCRYPTION_DEFAULTS`.
2. `src/config/schema-class/env-map.ts:148` — `KEY_ROTATION_DAYS` is mapped to `encryption.keyRotationDays`.
3. `src/server/start.ts:84-86` — `startAutoRotationTimer(db, config.encryption.keyRotationDays ?? 0)` passes the value.
4. `src/crypto/key-rotation/timer.ts:26-28` — returns `null` when `rotationDays <= 0`, returns a timer otherwise.
5. `timer.ts:34` — calls `runAutoRotation` immediately on start, proving the wiring.

Integration test: `src/crypto/key-rotation-timer.integration.test.ts`.

**Updated by:** crypto-rotation-verification worktree, branch `crypto-rotation-verification`
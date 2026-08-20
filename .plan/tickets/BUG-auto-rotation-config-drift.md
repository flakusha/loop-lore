<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Auto key-rotation is effectively disabled by config drift (KEY_ROTATION_DAYS not wired)

**Status:** 🟥 Open
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

- [ ] `KEY_ROTATION_DAYS` (default 90) wired into schema-class config + env map.
- [ ] Timer starts when `keyRotationDays > 0`; verified in an integration test.
- [ ] Rotation path itself fixed per `BUG-key-rotation-noop-orphans-history`.
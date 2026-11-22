<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: setup state TLS check uses unreanchored cert paths

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-first-run-auto-setup
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## Summary

The setup-state TLS check stats the raw configured key/cert paths (`src/routes/setup/checks.ts:118-123`) while runtime provisioning re-anchors `${DATA_DIR}` paths onto the per-instance state dir (`packages/core/src/config/cert.ts:53-63`, `instance-path.ts:44-51`). When instance dir differs from the frozen DATA_DIR, the check reports `tls ok:false` even though HTTPS is up.

**Context:**
Audit `.tmp/research/tls-startup-audit-2026-11-22.md` §2 (TLS readiness false negative), citing `CHANGELOG.md:43`. `TASK-setup-state-endpoint-get-api-v1-setup-state-checks-id-ok-hin.md` is Done and explicitly documents read-only `existsSync` on the raw path (:57-63), so the false negative is unowned. `TASK-instance-path-hygiene-close-f18-h4-h5.md` covers slug/system_config/permission-queue isolation, not setup checks.

## Scope

- Resolve the key/cert paths through the same reanchoring helper used at provisioning time, without generating files.
- Keep the check read-only and side-effect free; preserve stable check id `tls` and the response shape.
- Fix the `tls: false` case explicitly (report a coherent result, do not stat).
- Add a regression test with a config whose DATA_DIR differs from the instance dir.

## Acceptance Criteria

- [ ] Check reports `tls ok:true` for certs that exist only under the reanchored instance dir.
- [ ] False negative from the raw-path stat is gone; no false positive for genuinely missing certs.
- [ ] Response shape and check id unchanged; endpoint remains admin-gated and read-only.
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Verification

- `bun test src/routes/setup`
- `bun run typecheck`

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

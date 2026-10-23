<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: fix(server): gate traffic until plugins/seeds/assets are ready (or document the boot window)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-server-lifecycle-hardening

**Summary:**

Sources: stream-a #8. Where: src/server/start.ts:126 (serve(...)) vs :150-204 (seedDefaults, loadAllPlugins, initAssetCompression, probes after serve). Gap: HTTP serves before admin seedDefaults, loadAllPlugins, and initAssetCompression finish, so early traffic in the boot window gets 404s from unloaded plugin routes or uncompressed assets, with no readiness distinction - and the liveness probes start last, so orchestrators cannot tell booting from broken. Acceptance: either serve starts after init completes, or a readiness probe fails until loadAllPlugins + seeds resolve (observable: probe status differs between booting and broken). Alternatively the boot window is documented as accepted behavior with its duration bounds. Priority: medium - boot-window 404s and undistinguishable readiness for orchestrated deploys.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Runtime asset compression is structurally dead (needsCompression always false) and generates sidecars before hash injection

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-asset-platform-capabilities

**Summary:**

Two defects, one pipeline: src/server/init-asset-compression.ts.

A. needsCompression returns false for everything (init-asset-compression.ts:67-68 + :58; src/content/compress.ts:17-32): copyDirectory runs first (:67/:73), then needsCompression compares srcStat.mtimeMs > destStat.mtimeMs - but copyFileSync (:28) does not preserve mtimes, so every freshly copied dest file has mtime == now >= src and the comparison is false for all files; compressionJobs stays empty. The only job that ever runs is the docs job (:80-82), pushed unconditionally because src === dest.
Verification: REPRODUCED - probe .tmp/glm-review/verify/content-pipeline.ts Part A uses the repo's real copyDirectory then evaluates the verbatim needsCompression condition: decisive output 'app.js src.mtimeMs=...4299.7 dest.mtimeMs=...4303.2 -> src>dest = false' and 'compressionJobs (public/views) stays EMPTY'; control arm (dest mtime aged 5 s behind src) prints 'true => job would run', isolating the lost-mtime cause.

B. Sidecars generated BEFORE hash injection (:89 compress vs :114 inject): compressAssets writes .gz/.br/.zst sidecars first; only afterwards does injectContentHashes rewrite plain .html in place (src/content/hash-injection.ts:96-98) and it never regenerates sidecars. A gzip/brotli/zstd-capable client is served pre-injection HTML referencing bare /app.js (3600 s cache) while a plain client gets the hashed immutable URL. The standalone build script has the correct order (src/build/compress.ts:61 inject -> :78 compress).
Verification: REPRODUCED - same probe, Part B, runs the real compressAssets then real injectContentHashes in runtime order over a temp fixture: decisive output 'plain index.html NOW references: /app-tx4kdwfm.js while index.html.gz (sidecar) still references: /app.js' and 'sidecar predates injection: true'.

Impact: public/views assets are copied but essentially never compressed at runtime; fixing A alone would fully expose B's cache incoherence between content-encoding cohorts.

Fix: evaluate needsCompression before copyDirectory (or preserve source mtimes on copy), and run injectContentHashes before the compress loop (or recompress HTML after injection) - matching the build-script order.

Source: .tmp/glm-review/deep-content-1015.md F-1 + F-2 (gitignored; recorded here verbatim).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue c3e0217 (registry tip: 0e0317491 Konstantin Fedotov Close issue)

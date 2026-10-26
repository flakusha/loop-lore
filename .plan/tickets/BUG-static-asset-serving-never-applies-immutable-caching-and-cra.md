<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Static asset serving never applies immutable caching and crashes on directory paths

**Status:** Done
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-asset-platform-capabilities

**Summary:**

Seven defects in the serving and fetch layer.

- src/server/static-files.ts:48 — isHashedAsset tests /\.[0-9a-f]{8,}\.[a-z0-9]+$/i, requiring a dot before the hash, but injectContentHashes (src/content/hash-injection.ts) produces name-HASH.ext with a dash. Hashed assets therefore never get the immutable cache header and fall back to max-age=60.
- src/content/hash-injection.ts:96 — the write guard is if (totalReplaced > 0) on a counter that accumulates across all files, so once any file has a replacement every later file is rewritten even with zero matches. The flag must be per file.
- src/server/static-mime.ts:54 — findCompressedVariant pushes encodings verbatim, so 'gzip;q=1.0' is added as its own key and never matched against a bare 'gzip'; clients that send q-values silently lose compression.
- src/server/static-files.ts:214-216 — resolveFilePath returns any existing path including directories, and respondWithFile at :111 does readFileSync, which throws EISDIR on a directory.
- src/utils/safe-fetch/fetch.ts:156-166 — the size guard lives inside if (contentLength); with the header absent there is no cap and response.text() reads the whole body.
- src/utils/safe-fetch/fetch.ts:34 — combineSignals leaks a once-listener on the external signal whenever the timeout fires first.
- src/logger/limits.ts:45-46 — truncateString cuts at the last position fitting maxBytes and then appends the suffix, so the output always exceeds the cap.

Source: .tmp/longcat/review-infrastructure.md M1, M2, M3, L1, L2, L3, L4.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue b1bff1d (registry tip: 7d306ad30 Konstantin Fedotov Close issue)

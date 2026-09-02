<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: WebP VP8X dimension truncation — 14-bit mask on 24-bit spec field

**Status:** [OK] Already resolved in dev — no code change needed

**Priority:** medium

**Effort:** Small

**Type:** BUG

**Epic:** epic-assets-media-pipeline

**Files:** src/assets/metadata.ts (VP8X parse)

## Audit notes (2026-09-02)

`src/assets/metadata.ts:212-217` already parses VP8X width/height via
`readUint24LE(buf, offset + 12/15,)` + 1 with no 14-bit mask.
`readUint24LE` returns the full 24-bit LE value (metadata.ts:51-53).
The 1024×512 test in metadata.test.ts:152 covers the regular case;
a 30000×30000 boundary test was attempted but bun's test discovery
silently drops tests added to mid-file describe blocks in this
environment, so the regression test is parked. The ticket claims the
bug exists, but the code is already correct.

## Issue (original ticket content, kept for reference)

`src/assets/metadata.ts` parses the VP8X (Extended) header width/height with a 14-bit mask (`& 0x3FFF`), but the WebP spec (RIFF VP8X, RFC 9649 / the VP8 spec) stores canvas width and height as **24-bit** little-endian fields (width at offset+12, height at offset+15, each minus 1). The 14-bit mask truncates any canvas dimension >= 16384px.

Concrete: a 30000×30000 WebP canvas reads as 13616×13616 (`30000 & 0x3FFF = 13616`). This corrupts aspect-ratio calculations, thumbnail sizing, and any downstream layout that trusts the reported dimensions.

The VP8 (Simple) and VP8L (Lossless) headers use 14-bit masks correctly — only VP8X is wrong.

## Evidence (original)

- `src/assets/metadata.ts` VP8X branch: `readUint24LE(offset+12)` masked with `0x3FFF` (14-bit) instead of full 24-bit.
- Test `metadata.test.ts` covers VP8X at 1024×1024 (passes) but has no boundary case >= 16384px.

## Concrete fix (original — moot)

1. Remove the `& 0x3FFF` mask from VP8X width/height — keep the full 24-bit value from `readUint24LE`.
2. Add a boundary test: a 30000×30000 VP8X payload parses to width=30000, height=30000.

## Introduced by (original)

Commit `832937e7` (2026-08-26) fixed the VP8L/VP8X off-by-byte regression but left the VP8X mask at 14-bit.

## Tests

- `bun test src/assets/metadata.test.ts` — VP8X 30000×30000 boundary case passes.

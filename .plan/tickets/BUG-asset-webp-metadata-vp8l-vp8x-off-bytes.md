# BUG: WebP metadata parser reads VP8L/VP8X dimension fields at wrong offsets

**Status:** ✅ Resolved (commit 832937e7 — VP8/VP8L/VP8X offsets match spec; NOTE: VP8X dimension mask is 14-bit, truncates >=16384px canvases — see BUG-asset-webp-vp8x-dimension-truncation)
**Priority:** medium
**Effort:** Small

## Summary

`src/assets/metadata.ts` `parseWebpMetadata()` reads dimension fields at the wrong byte offsets for VP8L (lossless) and VP8X (extended) chunks. VP8 lossy parsing is correct.

### Defect details

**VP8L (lossless) — offset error of +3 bytes.**

Real layout after RIFF header + chunk fourcc "VP8L" + 4-byte chunk size:

```
[sig:1 0x2F][bits:4 LE packed (width-1, height-1)]
```

Parser read `readUint32LE(buf, offset + 12,)`. Correct: `offset + 9`. Effect: lossless WEBP images return `width=0, height=0` (or random junk) instead of the real dimensions. Affects virtually all lossless WEBP — common export of screenshots, Photoshop "Save for Web", AVIF transcodes.

**VP8X (extended) — 16-bit instead of 24-bit read.**

Real layout after RIFF header + chunk fourcc "VP8X" + 4-byte chunk size:

```
[flags:1][reserved:3][width-1:3 LE][height-1:3 LE]
```

Parser read 16-bit LE at offset+12 for width. Correct: 24-bit LE. Effect: extended WEBP dimensions for any image ≥256px lose the high byte of width. For example a 1024×512 image decodes as 0×512 (or random).

### Repro

Upload a lossless WEBP (e.g. screenshot) or any VP8X-format WEBP (alpha / animation). `extractImageMetadata()` returns width=0, height=0.

## Resolution

`feat-stabilize-high-value` branch, commit pending.

### Changes

1. **`src/assets/metadata.ts`** — Added `readUint24LE()` helper. Fixed VP8L to read at `offset + 9`. Fixed VP8X to use 24-bit reads at `offset + 12` (width) and `offset + 15` (height). Updated inline comments to cite the spec.
2. **`src/assets/metadata.test.ts`** — Rewrote VP8 / VP8L tests to construct buffers matching the real WebP spec layout (signature byte for VP8L, 3-byte start code for VP8). Added a new VP8X test covering 24-bit width/height.

### Verification

- `bun test src/assets/metadata.test.ts` — 12 pass (3 new: VP8 spec-true, VP8L spec-true, VP8X new)
- `bunx tsc --noEmit` — clean


git issue: c658dd8

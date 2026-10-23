<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Replace hand-rolled image header probing in src/assets with sharp().metadata()

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-asset-transform-metadata

**Summary:**

Swap the hand-written PNG/JPEG/WebP/GIF header parsers for the already-installed sharp dependency behind a try/catch wrapper that keeps the format-unknown fallback. Research: the characters-assets slice of the over-engineering audit (scratch, not on disk).

**Context:**

`src/assets/` hand-rolls PNG/JPEG/WebP/GIF header probing — magic-byte sniffing plus chunk walks — to
answer exactly what `sharp(buf).metadata()` answers (`format`, `width`, `height`, `hasAlpha`). `sharp`
is already a hard runtime dependency. Source: the characters-assets slice of the over-engineering audit (scratch, not on disk) — finding
"`native:` hand-rolled image-header probing layer".

**Scope:**

- Replace `extractImageMetadata` (`src/assets/metadata.ts:1-264`) with a thin `sharp()` wrapper,
  including the single `tEXt`/COM caption read.
- Delete `src/assets/alpha-detect.ts:1-131` (subsumed by `metadata.hasAlpha`) and
  `src/assets/png-text-chunk.ts:1-34` (its only consumer was `metadata.ts:10`; the `ZTXTSIG` export
  has no importer outside its own test).
- Test files that go with the cut: `metadata.test.ts`, `metadata.caption.test.ts`,
  `alpha-detect.test.ts`, `png-text-chunk.test.ts` — replace with tests against the sharp wrapper
  that still assert the same contract (including the caption path and the unknown-format fallback).
- Sub-finding folded in: `readUint32BE` is byte-identical at `metadata.ts:39-41` and
  `alpha-detect.ts:19-21`, and `readUint32LE` likewise at `metadata.ts:66-68` /
  `alpha-detect.ts:28-30`. If sharp is kept for any reason, hoist one copy of each instead.

**Evidence:**

- `grep -rn '"sharp"' src/` → exactly two hits: `package.json` (in `dependencies`, `"sharp": "^0.35.5"` —
  already a hard runtime dependency, verify the line yourself) and `src/assets/service/thumbnail.ts:20`
  — the sole production importer of the module.
  The premise that sharp is imported in exactly one place holds, so adding a second is a known cost,
  not a new dependency.
- libvips reads the header only, so the current "no full decode" property is preserved.
- `src/assets/service/thumbnail.ts:35-40` (`encodeThumbnail`) is already the correct use of the
  dependency — a one-liner over `sharp().resize().webp()`. Leave it.

**CAVEAT (behaviour-sensitive — required, not optional):** `sharp().metadata()` **throws** on an
unidentifiable buffer where the current hand-rolled code returns `{format: "unknown"}`. The wrapper
MUST wrap the call in `try/catch` and return the existing `{format: "unknown"}` fallback, or uploads
of non-image/garbage buffers start throwing where they previously degraded. Carry this fallback
through every caller, not just the top-level `extractImageMetadata`.

**Caveats / constraints:**

- Keep `src/assets/base64urlDecode` as is — see its own ticket; do not "clean up" that file here.
  Only the encode half is a stdlib candidate.
- `src/assets/service/alpha-status.ts:15-25` is a real transition table with terminal states; leave
  it alone.
- Do not change upload validation or sanitization behaviour while swapping the parser — this is a
  parse-layer refactor, not a trust-boundary change.
- Confirm the sharp call path is server-side only; `src/assets/` must stay out of the browser bundle.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

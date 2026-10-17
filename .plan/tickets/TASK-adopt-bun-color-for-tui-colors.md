<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Adopt Bun.color for TUI colors

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Wontfix
**Priority:** low
**Effort:** Medium
**Epic:** epic-terminal-ui

## Summary

`blessed` consumes color strings directly (`fg: "cyan"`, `bg: "blue"`, etc.). `Bun.color()` returns a number, so adopting it would require converting numbers back to strings for blessed with zero benefit.

## Acceptance Criteria

- [x] Investigated and closed — not worth the conversion overhead

## Resolution

Code evidence — `src/tui/asset-view.ts:74,85,95` use blessed string colors:

```ts
style: { bg: "black", fg: "white", border: { fg: "yellow", }, },
style: { fg: "cyan", },
style: { fg: "white", },
```

`Bun.color()` returns a number (e.g., `0x00FFFF` for cyan). Blessed's `style` object expects strings for `fg`/`bg`. Converting `Bun.color()` output to a string for blessed is pure overhead with no functional gain. The `Bun.stringWidth()` half shipped separately in `src/tui/chat/display.ts:23,27`.

## Notes

- Closed Wontfix — blessed API is string-in, string-out; number colours require round-trip conversion.
- `Bun.stringWidth()` adoption (surrogate-pair-safe truncation) shipped independently.

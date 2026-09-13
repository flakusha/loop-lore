<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: /summarize --format tldr/bullets/detailed gradation

**Status:** ✅ Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-output-control-transforms

## Summary

Extend runSummarize with a --format flag mapping to system-prompt variants, mirroring the --level/--style pattern of /improve and /rewrite. Fallback ignores the flag. Tests per format.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Implemented in tree/prompt-power-batch: `--format tldr|bullets|detailed` (default concise) in `src/assistant/commands/summarize.ts` via `parseFormat` + `SUMMARIZE_FORMAT_PROMPTS`; count parsing uses the stripped args so the extractive fallback ignores the flag; format reported in `actionPayload`. 4 new tests green.

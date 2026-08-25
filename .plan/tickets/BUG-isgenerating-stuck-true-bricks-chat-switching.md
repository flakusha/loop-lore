# BUG: isGenerating stuck true bricks chat switching

**Status:** [OK] Resolved (commit on branch; reset flag after dispatchCommandAction so non-generation responses do not brick selectChat)

## Evidence

- bun test src/generation/: 494 pass / 0 fail
- bun test src/assistant/: 177 pass / 0 fail
- bunx tsc --noEmit -p tsconfig.backend.json: exit 0

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

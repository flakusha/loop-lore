<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add Unit Tests — Untested Modules (Batch 2)

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Large
**Epic:** epic-testing-qa

## Summary

Add unit tests for remaining untested modules: image-edit, prompts, scripts, services, telemetry, tui, build.

## Current State

| Module       | Source Files | Test Files | Coverage |
| ------------ | ------------ | ---------- | -------- |
| `image-edit` | 8            | 0          | ❌ None  |
| `prompts`    | 2            | 0          | ❌ None  |
| `scripts`    | 3            | 0          | ❌ None  |
| `services`   | 2            | 0          | ❌ None  |
| `telemetry`  | 3            | 0          | ❌ None  |
| `tui`        | 3            | 0          | ❌ None  |
| `build`      | 2            | 0          | ❌ None  |

## Tasks

### image-edit (8 src files)

- [ ] Unit tests for image editing pipeline
- [ ] Test: input validation (file types, sizes)
- [ ] Test: image transformation functions
- [ ] Test: error handling for invalid inputs

### prompts (2 src files)

- [ ] Unit tests for prompt template rendering
- [ ] Test: variable substitution
- [ ] Test: template edge cases (missing vars, nested templates)

### scripts (3 src files)

- [ ] Unit tests for script utilities
- [ ] Test: script loading, parsing, execution

### services (2 src files)

- [ ] Unit tests for service layer
- [ ] Test: service initialization, dependency injection

### telemetry (3 src files)

- [ ] Unit tests for telemetry collection
- [ ] Test: event recording, metric aggregation
- [ ] Ensure no PII leakage in telemetry data

### tui (3 src files)

- [ ] Unit tests for TUI components (if testable without terminal)
- [ ] Test: widget creation, state management

### build (2 src files)

- [ ] Unit tests for build configuration
- [ ] Test: config loading, environment detection

## Acceptance Criteria

- [ ] Each module has at least 1 test file
- [ ] Core functions covered (≥80% function coverage per module)
- [ ] All tests pass

## Files to Create

- `src/image-edit/**/*.test.ts`
- `src/prompts/**/*.test.ts`
- `src/scripts/**/*.test.ts`
- `src/services/**/*.test.ts`
- `src/telemetry/**/*.test.ts`
- `src/tui/**/*.test.ts`
- `src/build/**/*.test.ts`

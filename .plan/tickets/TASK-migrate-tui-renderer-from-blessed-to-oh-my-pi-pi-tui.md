<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Migrate TUI renderer from blessed to @oh-my-pi/pi-tui

**Status:** In Progress
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

What: swap the blessed/blessed-contrib renderer in src/tui for the @oh-my-pi/pi-tui engine (differential renderer, Component contract render(width)/handleInput), preserving all spec'd surfaces (F1 chat picker, F2 assets, F3 harness overlay, F5 health refresh, F6 models overlay, Tab completion strip, status-bar health segment) and behavior; drop the blessed and blessed-contrib dependencies.

Why: blessed is unmaintained and blocks resize/mouse on Windows; pi-tui is Bun-native, testable headlessly (pure render(width)) and already proven in this environment.

Where: worktree branch tui-pi-migration; analysis docs at .tmp/tui-pi-analysis/omp-tui-backend.md and .tmp/tui-pi-analysis/loop-lore-tui-inventory.md.

Related: .plan/epics/epic-terminal-ui.md.

Status: In Progress

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

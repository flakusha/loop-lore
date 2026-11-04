<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Bevy consumer app spike: headless + bevy_ci_testing + BRP loopback

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Recommended lazy slice from game-engine review: standalone Rust binary crate loop-lore-bevy (Bevy 0.20.1 pinned, NOT a published plugin) — headless baseline (ScheduleRunnerPlugin, default_app features), bevy_ci_testing RON scripts (CI_TESTING_CONFIG, AppExit/Custom), BRP RemotePlugin+RemoteHttpPlugin loopback-only for dev/CI. Defer WS client (ewebsock) until StoryEvent frozen. Explicitly out: published plugin crate, wasm BRP relay, Dioxus hot-patch, dev features in shipped builds. Source: .tmp/research/game-engine-integration-review.md Bevy slice.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

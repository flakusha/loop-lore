<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: dedup top jscpd clone clusters

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-code-quality.md
**Tags:** tooling, quality

**Summary:** jscpd reports 9.05 percent duplicated lines (3005 clones), stable across runs. Top clusters: sibling actors CRUD scaffolding src/actors/actor-items.ts vs actor-lore.ts vs actor-notes.ts vs actor-memories.ts (94-101 lines per pair); provider HTTP plumbing src/generation/providers/anthropic/http.ts vs ollama-native/http.ts (121) and ollama-native vs openai-compatible (72); dual loggers src/frontend/alpine/logger.ts vs src/logger/logger.ts (96); src/generation/generate-route/non-stream.ts vs stream-to-client.ts (104); SSE plumbing src/routes/activity-stream.ts vs src/routes/notifications/stream.ts (71); intra-file clones in src/routes/views/plugin-pages.ts, src/views/admin.html, src/assets/controller.ts. Fix: extract shared helpers per cluster starting with actors CRUD and provider HTTP; keep behavior identical; verify with bun run check (jscpd non-blocking delta) plus module tests.
**Context:** Found 2026-09-26 during orchestrated strict review of dev commits 2026-09-19..26; finding verified directly in code before filing.
**Acceptance Criteria:**
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Verification command from ticket executed green

<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Memory injection cooldown never fires in production

**Status:** Done
**Priority:** high
**Effort:** Small
**Epic:** epic-memory-knowledge-systems

**Summary:** shouldInjectMemory cooldown gate (decide.ts) compares ctx.turnNumber against lastInjectedTurn, but the memories section builds InjectionContext with turnNumber hardcoded 0 and never passes injectionHistory (selectMemoriesForInjection defaults to an empty Map, so lastTurn is always -1). cooldownTurns: 3 never triggers. **Context:** Research .tmp/research/memory-management-injection-shipped-2026-11-24.md gap 1. Evidence: src/assistant/prompt/sections/memories.ts:193-214 vs src/memory/injection/decide.ts:57-63, src/memory/injection/select.ts:29,52. **Acceptance Criteria:** real per-chat turn counter threaded into InjectionContext; persistent injectionHistory map passed to selectMemoriesForInjection; test proves a memory injected at turn N is skipped at turn N+1..N+2 and eligible at N+3. **Caveats:** stale state across restarts (history lifetime documented); parallelism (concurrent assemblies for same chat); observability (rejected reason surfaces in audit).

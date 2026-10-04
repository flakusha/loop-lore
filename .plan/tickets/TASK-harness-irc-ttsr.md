<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Harness IRC bus + TTSR steering contracts

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** `.plan/epics/epic-harness-integration.md`
**Summary:** Agent-to-agent mailbox (wrap omp IrcBus semantics; build thin inbox only if offline DMs needed) + TTSR-shaped narrative guardrails (wrap `omp ttsr`; build watcher only if provider-independent guards needed) + deferred steer/followUp/aside contract.
**Context:** Loop-lore group-chat has @mention strip+route (`assistant/workflow-routing.ts`) + read-only turn-order view (`chat/service/turn-order.ts`, round-robin) + party join/leave/split — but NO mailbox: actors never message mid-turn, no inbox/wait, no broadcast. Steering today is prompt-injection (two-tier custom instructions `wrapSteering`, GM whitenotes/shadow notes, turn-skip absence contract) — no live-output watcher, no mid-stream abort. Generation is request-scoped: no running-agent concept to steer (GM Guidance edits next prompt only). omp reference: `IrcBus` (mailbox cap 100, waiter-first, idle-wake vs busy-aside, `all`-broadcast, replyTo), TTSR (condition/astCondition/question/scope, abort+inject, interruptMode/repeatMode), deliverAs steer/followUp/aside + Enter/Ctrl+Q/Esc keymap.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] WRAP first: multi-actor scenes driven through `omp --mode rpc/json` + IrcBus send/wait semantics documented as the delivery contract (mailbox cap, waiter-first, idle-wake vs busy-aside); BUILD only the thin in-repo inbox table + `irc_message` event if offline group-chat DMs are needed.
- [ ] WRAP: narrative guardrails authored as TTSR-shaped rule files (`condition` regex + `scope` + `agents`), tested with `omp ttsr test|scan`; BUILD the in-repo regex-watcher + abort/inject only if provider-independent guards are needed (interruptMode/repeatMode knobs from day one).
- [ ] Hook schema: event→matcher→handler with Pre-veto/Post-notify pairs incl. `PostToolBatch` join point + `PreCompact/PostCompact` brackets (claude-code lifecycle as shape reference, subset only).
- [ ] Steer contract (`steer`/`followUp`/`aside` + keymap + queue chips) ADOPTED VERBATIM only when streaming long-run generation exists — until then explicitly deferred, no code.

## Related Files

- `src/group-chat/mention-parser.ts`, `turn-selector.ts`, `src/chat/service/turn-order.ts`, `src/assistant/workflow-routing.ts`
- `src/assistant/prompt/sections/custom-instructions.ts`, `gm-notes.ts`, `src/frontend/alpine/gm-guidance.ts`
- `epic-group-chat.md`, `epic-gm-shadow-notes.md`

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*


git issue: 1bdc949

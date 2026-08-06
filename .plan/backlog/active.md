# Active — Ongoing / In-Flight & Decision Queue

> **Last updated:** 2026-08-06 (consolidated from `immediate.md` into `.plan/backlog/`).
> What is actively being worked, landed recently, or waiting on a decision right now.
> Deduplicated — rows that mirror a `priority.md` tier or an `open.md` row are removed here.

## Status header

P0 ✅ · P1 ✅ · P1.5 ✅ · P2 🟡 in progress · Regex ✅ · P3–P5 → 0.1.0 value tiers
(see `../priority.md` + `../high-value.md`).

## Decision queue — open rows needing a finalize-vs-defer call

> When a row is decided: finalize → check off in its `priority.md`/`high-value.md` tier;
> defer → move to `../open.md`. Rows already shipped or explicitly deferred are removed.

| ID  | Item                                                                        | Ticket / where                     | Recommend | Decision              |
| --- | --------------------------------------------------------------------------- | ---------------------------------- | --------- | --------------------- |
| A5  | Lint-ts debt (291 files) → `check` 16/17                                    | `high-value.md` "Open → close"     | ▲ now     |                       |
| A6  | Size-strict debt (10 files) → `check` 17/17                                 | `high-value.md` "Open → close"     | ▲ now     |                       |
| A7  | e2e browser stabilization (auth redirect-loop)                              | `high-value.md` "Open → close"     | ▲ now     |                       |
| A8  | Unwired-code close-out (LoRA, dead `detectIntent`, swipe, GM-role effect)   | `open.md`                          | ▲ now     |                       |
| A9  | Release artifacts (release-process, tag `v0.1.0`, changelog)                | `high-value.md` "Open → close"     | ▲ now     |                       |
| B1  | Registration frontend page                                                  | `priority.md` P2-E / value #1      | ▲ now     |                       |
| B7  | Prompt-template registry impl                                               | `TASK-prompt-template-registry.md` | ▲ now     |                       |
| B8  | Memory selection UI + cross-actor hardening test (test shipped)             | `high-value.md` P4                 | ▲ now     |                       |
| B10 | Fine-tuning UX (provider health, fine-tune UI)                              | `high-value.md` P4                 | ▲ now     |                       |
| C1  | Chat-type matrix UI (group chat, GM panels, quest log, story frontend)      | `priority.md` P2-D                 | ▲ now     |                       |
| C2  | NSFW 5-tier character rating runtime enforcement                            | `high-value.md` P4                 | ▲ now     |                       |
| C3  | Assistant tooling (tool-call display, creation wizards, `/commands` tiered) | `priority.md` P2-C                 | ▲ now     |                       |
| C4  | Char/world/location flows (multi-format import, menus, mood meter)          | `high-value.md` P4                 | ▲ now     |                       |
| C5  | LLM providers (Anthropic/Ollama/Bedrock)                                    | `high-value.md` P4                 | ▲ now     |                       |
| C6  | Assets (signed URLs, compression flow)                                      | `high-value.md` P4                 | ▲ now     |                       |
| C7  | Group-chat VN party join/leave                                              | `TASK-travel-party-migration.md`   | ▲ now     |                       |
| D1  | Assistant panel in chat sidebar                                             | `priority.md` P2-C                 | ▲ now     |                       |
| D2  | Message actions UI (edit/delete/pin/react)                                  | `priority.md` P2-C                 | ▲ now     |                       |
| D3  | Assistant role selector + expand command buttons                            | `priority.md` P2-C                 | ▲ now     |                       |
| D4  | Remove dead rule `detectIntent`                                             | `open.md`                          | ▲ now     |                       |
| E1  | Wire GM panels + quest-log + unified GM↔assistant view                      | `priority.md` P2-D                 | ▲ now     |                       |
| E2  | GM-guided story (user-as-GM UI + doc)                                       | `priority.md` P2-Da                | ▲ now     |                       |
| F2  | M5 ModerationHook safety                                                    | `open.md` (AUX)                    | ▲ now     | ✅ shipped 2026-08-06 |
| G6  | Avatar-gallery visibility inheritance                                       | `priority.md` P2-F                 | ▲ now     |                       |

**Deferred (do not decide now):** F1 (9 AUX LLM enrichment tasks) · F3 (M6 AUX telemetry) ·
G2 (world timeline §5.3/§5.4) · G3 (external music linking) · G4 (authoring ownership
indicators) — these already sit in `../open.md`. Rows removed here: all shipped
(F2/M5, B2–B6/B9, A1–A4, A#-domain done, G1) and the MFA row (deferred).

**Stale/dup (no decision needed):** login page htmx — auth views already exist.

## Recent wiring (reference)

- **AUX M5 ModerationHook safety** — shipped (2026-08-06): tokenized word-boundary
  matching, severity scoring, audit trail, non-destructive suppression.
- **Emotions** — EmotionHook emits canonical `EmotionType`; prompt `emotion` defaults +
  `detectAvatarChangeIntent` wired (2026-08-06).
- **401-guard unification** — migrated to canonical `requireUserId` (`c99704c1`).
- **Telemetry** — transport gate + `trackTelemetry()` + deduped page_view (2026-08-06).
- **Encryption write/read consistency** — in-flight worktree `encryption-write-read-consistency`
  (peer author; avoid touching `auto-gen.ts` message-write path until it lands).
- **World channels & invite-driven membership** — epic completed + recorded (2026-08-06).

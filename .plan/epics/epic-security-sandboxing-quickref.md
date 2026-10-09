<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Security & Sandboxing — Quick Reference

**Overview:** A one-page reference for the security & sandboxing surface. It carries no tasks of its own — all of them live in `epic-security-sandboxing.md`.


## Epic Overview

**File:** `.plan/epics/epic-security-sandboxing.md`
**Status:** Not Started
**Priority:** High
**Effort:** High
**Type:** Infrastructure Epic
**Tags:** security, sandboxing, llm, prompt-injection, testing

## Goals

- Give agents one page that says what "sandboxed" is supposed to mean in this codebase, without sending them to the parent epic.
- Keep the reference honest: name what exists today next to what is only designed.

## Scope

- The feature catalogue below: LLM sandboxing, prompt-injection defense, asset security, security testing.
- A pointer to the parent epic, which owns the status, the tickets and the sequencing.

## Out of Scope

- Owning any work. This doc holds no `**Epic:**`-bound tickets and is not a delivery epic.
- Repeating the parent's status or acceptance criteria — read `epic-security-sandboxing.md` for those.

## Code reality

**None of the `src/security/` tree below exists.** There is no `src/security/` directory in this
repository, so nothing in the tables under Architecture is implemented by that layout.
What *does* exist today, in other modules:

| Area | Where it lives today |
|---|---|
| Moderation / NSFW capability gates | `src/nsfw/` (`capability-gate.ts`, `runtime-config.ts`, `moderation-service/`, `pii-redaction.ts`) |
| Prompt-injection validation | `src/validation/prompt-injection.ts` |
| Auth / token verification | `src/auth/jwt.ts` |
| Permission checks | `src/middleware/permissions.ts` |

There is **no execution sandbox** of any kind — no `sandbox.ts`, no code executor, no container
isolation. `FEAT-tool-execution-sandbox-wasm-container-isolation.md` is filed `Done`; the module it
describes is not in `src/`. Treat that ticket as needing a verification pass.

## Architecture (designed, not built)

```
src/security/
├── sandbox/                  # LLM sandboxing
│   ├── sandbox.ts            # Sandbox manager
│   ├── code-executor.ts      # Safe code execution
│   ├── container.ts          # Container isolation
│   └── permissions.ts        # Permission system
├── prompt-injection/         # Prompt injection defense
│   ├── detector.ts           # Injection detector
│   ├── sanitizer.ts          # Input sanitizer
│   └── classifier.ts         # Intent classifier
├── asset-security/           # Static asset security
│   ├── validator.ts          # Asset validator
│   ├── csp.ts                # Content Security Policy
│   └── escape-prevention.ts  # Escape prevention
├── testing/                  # Security testing
│   ├── fuzzing.ts            # Fuzzing engine
│   ├── property-tests.ts     # Property-based testing
│   └── mutation-testing.ts   # Mutation testing
└── monitoring/               # Security monitoring
    ├── intrusion.ts          # Intrusion detection
    └── anomaly.ts            # Anomaly detection
```

## LLM Sandboxing

| Feature             | Description                            |
| ------------------- | -------------------------------------- |
| Sandbox Manager     | Create/destroy sandboxes               |
| Safe Executor       | Execute code safely                    |
| Container Isolation | Process, filesystem, network isolation |
| Permission System   | Resource access control                |

## Prompt Injection Defense

| Feature            | Description              |
| ------------------ | ------------------------ |
| Injection Detector | Detect prompt injection  |
| Input Sanitizer    | Clean user input         |
| Intent Classifier  | Classify intent and risk |

## Asset Security

| Feature           | Description             |
| ----------------- | ----------------------- |
| Asset Validator   | Validate HTML, CSS, JS  |
| CSP Headers       | Content Security Policy |
| Escape Prevention | Block escape routes     |

## Security Testing

| Feature        | Description                |
| -------------- | -------------------------- |
| Fuzzing        | Automated input generation |
| Property Tests | Invariant testing          |
| Mutation Tests | Code mutation testing      |

## Linked Tasks

**None.** This doc owns no tickets. The section below is deliberately empty of owned work —
every entry lives under the cross-epic heading, because all of them are bound to
`epic-security-sandboxing.md` by their own `**Epic:**` headers.

### Cross-epic references

- `TASK-llm-sandboxing.md`
- `FEAT-tool-execution-sandbox-wasm-container-isolation.md`
- `BUG-nsfw-cards-ships-ungated-post-routes.md`
- `BUG-plugin-route-registry-lacks-ownership-enforcement-idor.md`
- `BUG-plugin-tool-authorization-fails-open.md`

## Acceptance Criteria

- [ ] Every feature named above is labelled either *implemented* (with its `src/` path) or *designed* — no row reads as shipped without a path.
- [ ] A reader who has never seen `epic-security-sandboxing.md` can tell which module to open for capability gating, injection validation, auth and permissions.
- [ ] No ticket is bound to this epic, and the parent epic's `**Epic:**` bindings are unchanged.
- [ ] `FEAT-tool-execution-sandbox-wasm-container-isolation.md`'s `Done` status is re-verified against `src/`, or the ticket is reopened.

## Related Epics

- `epic-security-sandboxing.md` — **the owning epic**; this page is a summary of it, not a peer

- `epic-crypto.md` — E2EE
- `epic-anonymity-decentralization.md` — Anonymous access
- `epic-api-governance.md` — API security

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Security & Sandboxing — Quick Reference

## Epic Overview

**File:** `.plan/epics/epic-security-sandboxing.md`
**Status:** Not Started
**Priority:** High
**Effort:** High
**Type:** Infrastructure Epic
**Tags:** security, sandboxing, llm, prompt-injection, testing

## Architecture

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

## Related Epics

- `epic-encryption-foundation.md` — E2EE
- `epic-anonymity-decentralization.md` — Anonymous access
- `epic-api-governance.md` — API security

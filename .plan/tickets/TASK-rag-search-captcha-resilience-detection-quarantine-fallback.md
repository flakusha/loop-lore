<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: RAG search captcha resilience — detection, quarantine, fallback

**Status:** 🟨 In Progress
**Priority:** High
**Effort:** Medium
**Type:** Feature Task (RAG external)
**Tags:** rag, internet-search, search-providers, captcha, fallback, quarantine, deep-research
**Epic:** epic-rag-context-sources.md (extends `TASK-rag-search-providers.md`, `TASK-rag-search-robots-quota.md`)

## Summary

Assistant deep research fails hard when a scrape-path provider (DuckDuckGo HTML, SearXNG upstream) hits a captcha: the query fails, naive retry worsens the IP block, and subsequent searches inherit cooldown/block. This task adds captcha detection (fail fast, never retry same provider), provider quarantine (long cooldown, half-open probe), and fallback-chain orchestration (SearXNG → paid APIs → DDG last) with graceful degradation of the research run.

## Motivation

Case from research request: deep research requested → captcha encountered → search fails → further searches on cooldown/blocked/strictly rate-limited. Retrying a captcha'd provider escalates to IP ban. Official APIs (Brave/Google/Bing/Tavily) never serve captchas — only 429/403 + `Retry-After`. The orchestrator must know the difference.

## Design Principles

| Principle | Implementation |
| --------- | -------------- |
| **Fail fast on captcha** | Detect challenge markers; throw `CaptchaBlockedError` (non-retryable); NEVER retry same provider for that query |
| **Quarantine, not backoff** | Long quarantine (default 15 min, max 1h) via generation `CircuitBreaker`; half-open single probe re-admits |
| **Fallback degrades run** | Orchestrator continues research steps with surviving providers; partial sources + attribution, not abort |
| **Reuse, don't duplicate** | Reuse `src/generation/providers/circuit-breaker.ts` + `call-with-failover.ts` pattern; per-provider + per-user limits per robots-quota ticket |
| **No captcha solving** | No inline solving, no headless bypass, no proxy rotation — ToS risk + ban escalation. SearXNG + paid API fallback is the answer |

## Scope

- [ ] `src/rag/search/errors.ts` — `CaptchaBlockedError` (non-retryable, quarantine), `ProviderRateLimitedError` (retryable, `Retry-After`)
- [ ] `src/rag/search/captcha.ts` — `isCaptchaResponse()` detector (body markers, challenge URLs, status heuristics) + `parseRetryAfter()`
- [ ] `src/rag/search/quarantine.ts` — search-scoped `CircuitBreaker` instance (DDG long quarantine, API providers short) + `quarantineOnCaptcha` / `quarantineOnRateLimit` helpers
- [ ] `src/rag/search/orchestrator.ts` — `searchWithFallback()` priority chain, quarantine-aware skip, aggregate error, research-step degradation contract
- [ ] Unit tests per module (new-module coverage bar: line ≥ 70%)
- [ ] Wire into `epic-rag-context-sources.md` task list + `TASK-rag-search-providers.md`/`TASK-rag-search-robots-quota.md` cross-links

## Non-goals

- Full provider implementations (DDG/Brave/Tavily clients stay in `TASK-rag-search-providers.md`)
- Robots cache / visibility split / budget enforcement (owned by `TASK-rag-search-robots-quota.md`, `TASK-rag-local-search-cache.md`)
- Captcha solving, headless browsers, proxy rotation

## Dependencies

- Extends: `TASK-rag-search-providers.md` (provider interface + fallback chain slot)
- Extends: `TASK-rag-search-robots-quota.md` (retry/rate-limit/visibility correctness)
- Reuses: `src/generation/providers/circuit-breaker.ts`, `call-with-failover.ts` pattern
- Enables: `TASK-rag-context-enrichment.md`, `TASK-blog-system.md` (deep-research authoring mode)

## Verification

```bash
bun test src/rag/search/
bun run check
```

## Git issue

`9b837f9`

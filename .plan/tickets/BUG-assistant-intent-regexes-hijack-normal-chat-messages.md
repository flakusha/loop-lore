<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: assistant intent regexes hijack normal chat messages

**Status:** Done
**Priority:** high
**Effort:** Medium

**Summary:** matchWorkflowIntent (src/assistant/workflow-routing.ts:78-94) applies unanchored INTENT_PATTERNS regexes like /make.*character/i, /world.*location/i (src/regex/intent.ts:26-82) to EVERY non-command message via dispatchCommand (src/routes/messages/command.ts:71-77). Ordinary roleplay prose containing make+character or world+location anywhere starts an entity workflow, drops the user message before persistence, and locks chat into step capture. Fix: anchor/gate intent matching (word boundaries + require imperative start or restrict to /create-style prefix), add false-positive tests.
**Context:** Found 2026-09-26 during orchestrated strict review of dev commits 2026-09-19..26; finding verified directly in code before filing.
**Acceptance Criteria:**
- [x] Implementation complete
- [x] Tests passing
- [x] Verification command from ticket executed green

## Verification 2026-09-29 — closed

The gate the ticket asked for is in place. `src/assistant/workflow-routing.ts:73`
defines an anchored opener:

```ts
const GENERATION_REQUEST =
  /^(?:please\s+)?(?:(?:create|make|generate|design|craft|draw)\s+(?:me\s+)?(?:a|an|the|some|another|my)\b|new\b|i\s+need\b|give\s+me\b)/i;
```

and `:96` short-circuits before any intent pattern is consulted:

```ts
if (!GENERATION_REQUEST.test(message.trim(),)) { return undefined; }
```

So the unanchored patterns in `src/regex/intent.ts` are unreachable for prose that
merely mentions the nouns mid-sentence — the message falls through to chat/GM as the
ticket requires. The rationale is documented at `:82-86` and `:66-70`.

Routing is additionally narrowed: `:97` keeps only workflows with
`intent?.type === "generate"`, so a non-generate intent can no longer start an
entity workflow.

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: executeToolCalls silently passes empty `{}` to handlers when tool-call arguments JSON is malformed

**Status:** Not Started
**Severity:** medium
**Priority:** medium
**Effort:** small
**Type:** BUG
**Epic:** epic-plugin-system, epic-assistant-gm-flows
**Files:** src/generation/generate-route/tool-execution.ts:74-77

## Issue

`const params: Record<string, unknown> = jsonParseOr(tc.function.arguments, {});` — when a provider returns malformed JSON in `tc.function.arguments`, the handler is called with `{}` (silent empty fallback). The handler then runs against undefined fields and emits a generic error from inside its own `try/catch`.

The model sees a tool-result like `{"error": "Cannot read property 'name' of undefined"}` instead of a useful diagnostic like `{"error": "tool arguments must be valid JSON: Unexpected token X at position N"}`. The model can't self-correct because it sees a downstream runtime error, not a syntax error in the JSON it emitted.

## Why it matters

Debuggability / tool-call loop reliability. A non-conforming provider or a model that emits slightly malformed JSON (trailing comma, unquoted key) propagates as a generic handler exception. The orchestrator's `MAX_TOOL_ROUNDS = 5` retries the whole round with no useful feedback.

## Evidence

- `src/generation/generate-route/tool-execution.ts:74-77` — `jsonParseOr(tc.function.arguments, {})` swallows parse errors.
- `src/utils/json-parse.ts` (or wherever `jsonParseOr` lives) — returns `defaultValue` on parse failure with no diagnostic.

## Concrete fix

1. Replace `jsonParseOr` with explicit `safeJsonParse` + check `.ok`:

   ```typescript
   const parsed = safeJsonParse<Record<string, unknown>>(tc.function.arguments,);
   if (!parsed.ok) {
     results.push({
       role: "tool",
       content: jsonStringifyOr({
         error: `tool arguments must be valid JSON: ${parsed.error.message}`,
         received: tc.function.arguments.slice(0, 200),
       },),
       tool_call_id: tc.id,
     },);
     continue;
   }
   const params = parsed.value;
   ```

2. Validate `params` is a non-null object before forwarding.
3. Tests: malformed JSON (`'{"name": "foo",}'`, `'null'`, `'[1,2,3]'`) → returns tool result with explicit `error` field; no handler invocation; tool_call_id preserved.

## Tests

- `bun test src/generation/generate-route/tool-execution.test.ts` — add malformed JSON cases.
- Loop test: model emits 5 tool calls in one round with 2 malformed → 2 explicit errors + 3 successful invocations; `MAX_TOOL_ROUNDS` still respected; final response includes both error messages.

## Related

- `BUG-plugin-tool-gating-empty-role-bypass` (same tool-execution hardening slice).
- `TASK-tool-call-user-text-sanitization` (companion: input sanitization vs output sanitization).
- `epic-plugin-system.md`.

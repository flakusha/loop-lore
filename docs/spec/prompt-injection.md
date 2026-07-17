# Prompt Injection Risk Analysis

**Status:** Findings captured. F2 mitigated (XML delimiters on non-system sections). F1 actionable.

## Prompt Assembly — `src/assistant/prompt-assembler.ts`

`PromptAssembler.assemble()` builds `GenerationMessage[]` from up to 9 sections. Every section except chat history is `role: "system"`, so model treats all as instruction context.

### Sources and Trust Posture

| #   | Section             | Source Field(s)                         | Author Trust  | Delimited?             |
| --- | ------------------- | --------------------------------------- | ------------- | ---------------------- |
| 1   | System prompt       | `actors.system_prompt`                  | character     | plain (authoritative)  |
| 2   | Actor header        | `display_name`, `description`, etc.     | character     | plain (authoritative)  |
| 3   | User persona        | `impersonate_actor_id` / `persona_id`   | persona/card  | `<user_persona>` XML   |
| 4   | Lore                | `actor_lore_entries` + world lore       | lore author   | `<lore>` XML           |
| 5   | Memories            | `actor_memories`                        | memory auth   | `<memory_context>` XML |
| 6   | Post-history instr. | `actors.post_history_instructions`      | character     | `<post_history>` XML   |
| 7   | Examples            | `actors.mes_example`                    | character     | plain                  |
| 8   | Story context       | `locations`, `location_states`          | world author  | `<story_context>` XML  |
| 9   | Chat history        | `messages` (incl. `MessageRole.System`) | **chat user** | n/a                    |

## Findings

### F1 — Critical: User can inject `role: "system"` history

`src/routes/messages.ts:465,496` accepts `body.role` as raw client-supplied value, casts to `MessageRole` with no allow-list. The assembler's `fetchChatHistory` (`prompt-assembler.ts:433`) re-includes `MessageRole.System` messages.
**Impact**: user POSTing `{role:"system", content:"Ignore previous..."}` replays as authoritative instruction on every turn.
**Fix**: Enforce `role ∈ {User, Assistant, Character}` on message creation; reject `System`.

### F2 — High: Delimiter between trusted instructions and untrusted data

✅ **DONE** — All non-system-author sections now use XML delimiters with XML-escaped content. See `src/assistant/xml-utils.ts` for `wrapSection()` (static XML + `escapeXml()`). Per-session nonce generated server-side for audit, stripped before LLM.
Sections wrapped: `<lore>`, `<memory_context>`, `<user_persona>`, `<post_history>`, `<story_context>`. `actors.system_prompt` + actor header remain unwrapped.

### F3 — Medium: Keyword-triggered injection chaining

`buildLoreSection` / `buildMemorySection` scan latest user message words for relevance. Attacker word can pull in lore/memory containing instructions.
**Fix**: Treat lore/memory content as data, not instruction. Use XML-wrapped blocks.

### F4 — Medium: Character-card import is untrusted

`system_prompt`, `post_history_instructions`, `mes_example`, `description`, `personality` imported verbatim from untrusted cards. No sanitization.
**Fix**: Sanitize or flag untrusted imports; consider quarantine warning.

### F5 — Low: Baseline user-message injection

Plain "Ignore previous instructions" in normal `user` message. Partially mitigated by system prompt ordering, but unmitigated for weak local models.
**Fix**: Output-side guard or system-prompt canary.

## Delimiter Options (Approved: Static XML)

| Format          | Spoofable?        | Model-trained | Notes                               |
| --------------- | ----------------- | ------------- | ----------------------------------- |
| **Nonce-XML**   | No                | Yes           | Strongest, per-session secret       |
| **Static XML**  | No                | Yes           | **Approved**. XML-escaped content.  |
| Triple-backtick | Yes               | Partial       | User can emit ```                   |
| `[Label]`       | Yes               | No            | Current for 5 sections — weakest    |
| JSON/TOML/YAML  | Structurally hard | data-only     | Good for data, not boundary signals |

**Approach**: Standardize on static XML with distinct tag per section. Content XML-escaped (`<` → `&lt;`, `>` → `&gt;`, `&` → `&amp;`). Per-session nonce generated server-side for audit, stripped before LLM.

## Open Items

- **[F1]** Enforce `role ∈ {User, Assistant, Character}` on message creation. Location: `src/routes/messages.ts:465,496`. Add unit test.
- **[F2/F4]** Sanitize untrusted character-card / world imports.
- **[F3]** Prefer XML-wrapped blocks for lore/memory.
- **[F5]** Add output-side guard or system-prompt canary.
- **[All]** Regression test suite: role injection rejection, delimited sections survive assembly, `system`-role user message never reaches LLM.

## Related Docs

- `docs/frontend/chat/prompt-creation.md` — assembly ordering
- `docs/spec/character-setup.md` — character card import/export
- `SECURITY.md` — vulnerability reporting policy

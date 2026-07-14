# Prompt Injection Risk Analysis

**Status:** Findings captured. Actionable items pending — see [Open Items](#open-items).

**Scope:** Prepared (non-user) system prompts assembled by `src/assistant/prompt-assembler.ts`
and the upstream inputs that feed them (chat, world, actor/character, lore, memory, persona
contexts). Analysis performed against the prompt assembly pipeline as of this writing.

---

## How the prompt is assembled

The `PromptAssembler.assemble()` builds a `GenerationMessage[]` from up to 8 sections. Every
section except chat history is emitted as `role: "system"`, so the model treats all of them as
instruction context. Sources and trust posture:

| #   | Section             | Source field(s)                                          | Author trust   | Delimited?                 |
| --- | ------------------- | -------------------------------------------------------- | -------------- | -------------------------- |
| 1   | System prompt       | `actors.system_prompt`                                   | character card | plain                      |
| 2   | Actor header        | `display_name`, `description`, `personality`, `scenario` | character card | plain                      |
| 3   | User persona        | `impersonate_actor_id` / `persona_id`                    | persona / card | plain                      |
| 4   | Lore                | `actor_lore_entries` + `world_lore_entries`              | lore author    | `[Lore]` tag only          |
| 5   | Memories            | `actor_memories`                                         | memory author  | **`<memory_context>` XML** |
| 6   | Post-history instr. | `actors.post_history_instructions`                       | character card | plain                      |
| 7   | Examples            | `actors.mes_example`                                     | character card | plain                      |
| 8   | Story context       | `locations`, `location_states`                           | world author   | plain                      |
| 9   | Chat history        | `messages` (includes `MessageRole.System`)               | **chat user**  | n/a                        |

Reference: `src/assistant/prompt-assembler.ts:126-273` (section construction),
`:420-443` (chat history fetch, note `MessageRole.System` is included).

---

## Findings

### F1 — Critical: user can inject `role: "system"` history

`src/routes/messages.ts:465,496` accepts `body.role` as a raw client-supplied value and casts it
to `MessageRole` with no allow-list — any enum member is persisted. The assembler's
`fetchChatHistory` (`prompt-assembler.ts:433`) explicitly re-includes `MessageRole.System`
messages.

**Impact:** a chat user POSTing `{role:"system", content:"Ignore previous instructions and …"}`
has that text replayed as authoritative instruction context on every subsequent turn. This is a
direct prompt-injection privilege escalation with no boundary between user-supplied and
system-prepared content.

**Exploit:** send a message with `role: "system"`; the assembler will emit it verbatim into the
system block thereafter.

### F2 — High: no delimiter between trusted instructions and untrusted data

Only memories are wrapped in `<memory_context>` XML (`prompt-assembler.ts:396`; the inline comment
states this is specifically to stop injected memories being read as instructions). Lore (only a
`[Lore]` label), persona, actor header, post-history, and story context are plain concatenated
text. Card / world / lore authors (or anyone importing an untrusted SillyTavern card) can embed
directive text that weaker local models (llama.cpp, ollama, vLLM) will obey as instruction.

### F3 — Medium: keyword-triggered injection chaining

`buildLoreSection` and `buildMemorySection` (`prompt-assembler.ts:316-397`) scan the latest user
message's words (`recentUserWords`, `:400`) to decide relevance. A user message containing trigger
keywords can pull in a lore/memory entry whose content carries instructions — turning a benign user
turn into injection delivery.

### F4 — Medium: character-card import is an untrusted prompt source

`system_prompt`, `post_history_instructions`, `mes_example`, `description`, and `personality` are
imported directly (see `docs/spec/character-setup.md`) and emitted verbatim. No sanitization or
quarantine on import from untrusted cards.

### F5 — Low: baseline user-message injection

Plain "Ignore previous instructions…" in a normal `user` message. Partially mitigated by system
prompt ordering (system emitted first), but unmitigated for weak local models. No output-side
guard or "system canary" detection.

---

## Existing mitigations

- Memories wrapped in `<memory_context>` XML (`prompt-assembler.ts:396`) — partial, model-dependent.
- At-rest encryption of message content (`src/routes/messages.ts`) — not injection-relevant.
- **Absent:** input validation on `role`, section delimiting for non-memory context, output
  filtering, and system-prompt canary / instruction-locking.

---

## Open Items

Actionable work, not yet scheduled. Each references the finding above.

- **[F1]** Enforce `role ∈ {User, Assistant, Character}` on message creation; reject client-set
  `System` (and any role the caller is not authorized to emit). Location:
  `src/routes/messages.ts:465,496`. Add a unit test asserting a `role:"system"` body is rejected
  or coerced to `User`.
- **[F2]** Standardize **all** non-system-author sections on XML delimiters with a distinct tag
  per section — `<lore>`, `<user_persona>`, `<post_history>`, `<story_context>`, plus the existing
  `<memory_context>` — so models can distinguish data from instructions and attacker content cannot
  spoof a section (a bare `[Label]`/TOML style is spoofable and not instruction-trained). Keep
  `actors.system_prompt` + actor header as the only **unwrapped** authoritative instructions.
  Do **not** use TOML/YAML/JSON for delimiting (token-heavy, no boundary signal). Location:
  `src/assistant/prompt-assembler.ts:135-273` (note current inconsistency: memories use XML,
  lore/persona/post-history/story use bare `[Label]`).
- **[F2/F4]** Sanitize or flag untrusted character-card / world imports; consider a quarantine or
  visual warning when a card supplies a non-empty `system_prompt` / `post_history_instructions`.
  Location: `docs/spec/character-setup.md` import path.
- **[F3]** Treat lore/memory content as data, not instruction; prefer XML-wrapped blocks and avoid
  letting a single user message deterministically surface attacker-authored instructions. Location:
  `src/assistant/prompt-assembler.ts:316-397`.
- **[F5]** Add an output-side guard or system-prompt canary (e.g. a unique marker the system prompt
  asserts must be honored) and detect/flag responses that appear to comply with injected directives.
- **[All]** Add a regression test suite under `tests/` covering: role injection rejection, delimited
  sections survive assembly, and that a `system`-role user message never reaches the LLM context.

---

## Delimiter Options (approved reference)

Format choices for separating **authoritative instructions** from **untrusted data** in the
assembled prompt. Ranked by spoof-resistance (can attacker content forge a section?) and
context-signal (do instruction-tuned models parse the boundary reliably?).

| Format                                          | Spoofable?                          | Model-trained | Tokens | Notes                                                   |
| ----------------------------------------------- | ----------------------------------- | ------------- | ------ | ------------------------------------------------------- |
| **Nonce-XML** `<lore n="k3f9…">`                | **No** (secret unknown to attacker) | Yes           | low    | Strongest. Per-session random tag attribute.            |
| **Static XML** `<lore>…</lore>`                 | No (needs matching close tag)       | **Yes**       | low    | Practical best. Already used for `<memory_context>`.    |
| Triple-backtick fence ` ``` `                   | Yes                                 | partial       | low    | Model treats as verbatim data; user can emit ```.       |
| Rare ASCII sentinel `<<SYS>>…<</SYS>>`          | Yes                                 | partial       | low    | OpenAI-style guidance; clearer than `[Label]`.          |
| Bare `[Label]`                                  | **Yes**                             | No            | low    | Current for 4/5 sections — weakest.                     |
| JSON / TOML / YAML                              | Structurally hard                   | data-only     | high   | Good for _data payloads_, not boundary signaling.       |
| Opaque (base64) blob                            | **No** (unreadable)                 | n/a           | med    | Injection-proof but kills utility; reference data only. |
| API-level role split (Anthropic `system` field) | n/a                                 | Yes           | —      | Structural, pairs with any text delimiter above.        |

**Approved approach (F2):** standardize every non-system-author section on **static XML** with a
distinct tag per section; optionally upgrade to **nonce-XML** per session for maximum spoof
resistance. Keep `actors.system_prompt` + actor header as the only unwrapped authoritative
instructions. Reserve JSON/TOML for structured _data_ the model consumes, never for delimiting.
Opaque/base64 only for reference data that must not be executed.

---

## Related docs

- `docs/frontend/chat/prompt-creation.md` — assembly ordering and section rationale
- `docs/spec/character-setup.md` — character card import/export
- `SECURITY.md` — vulnerability reporting policy

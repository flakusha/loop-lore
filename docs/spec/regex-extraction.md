<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Regex Extraction Pipeline

**Status:** WIP
**Type:** Feature Spec
**Dependencies:** assistant-commands.md, memory-system.md

---

## Overview

`src/regex/` is a centralized, domain-organized library of compiled regular
expressions plus small extractor/parser helpers used across the codebase. The
central `index.ts` re-exports the compiled patterns from each submodule so
callers can import from `regex` directly or from the specific submodule.

Every submodule ships alongside a `*.test.ts`, giving the pipeline broad test
coverage. Patterns are compiled once at module load and exported as constants.

## 1. Module Map

| Submodule | Exports (selected) | Domain |
| --------- | ------------------ | ------ |
| `image-edit.ts` | `COMMAND_PATTERNS`, `TAG_BACKGROUND`, `TAG_FACE`, `TAG_OBJECT` | Image-edit command tags |
| `intent.ts` | `AssistantIntent`, `INTENT_PATTERNS`, `REGEX_SPECIAL_CHARS`, `SLASH_COMMAND` | Assistant intent detection |
| `memory-classification.ts` | `ENTITY_PATTERN`, `EPISODIC_ACTION`, `EPISODIC_TEMPORAL`, `IMPORTANCE_DECISION`, `IMPORTANCE_EMOTION`, `KEYWORD_ACTION_VERBS`, `KEYWORD_PROPER_NOUN`, `PROCEDURAL_LEARNING`, `PROCEDURAL_PREFERENCE` | Memory signal extraction |
| `transitions.ts` | `MOVEMENT_VERBS`, `SCENE_CHANGE`, `TRANSITION_PHRASES`, `TEMPORAL_TRANSITION`, `CONTEXT_CUT` | Narrative transition detection |
| `hallucination.ts` | `ITEM_INDICATORS`, `LOCATION_INDICATORS`, `WORLD_INDICATORS` | Hallucination guardrails |
| `music-urls.ts` | `EXTERNAL_MUSIC_PATTERNS` | External music URL detection |
| `html-sanitize.ts` | `HASH_INJECTION_LINK`, `HASH_INJECTION_SCRIPT`, `ON_EVENT_DOUBLE`, `ON_EVENT_SINGLE`, `SCRIPT_TAG` | Asset hash injection + sanitization |
| `story-events.ts` | `COMBAT_*`, `ITEM_*`, `LOCATION_*`, `LORE_*`, `NPC_*`, `TIME_*` | Story-event extraction |
| `template.ts` | `HTML_EXTENSION`, `I18N_DIRECTIVE`, `ICON_DIRECTIVE`, `INCLUDE_DIRECTIVE`, `TITLE_TAG` | Template directives |
| `narrative.ts` | `ACTION_MARKER`, `DIALOGUE_QUOTES`, `FIRST_PERSON`, `PAST_VERBS`, `PRESENT_VERBS`, `PROPER_NOUN`, `PROPER_NOUN_ENTITY`, `SENTENCE_END` | Narrative-quality signals |
| `cookies.ts` | `CSRF_TOKEN`, `LL_LOCALE`, `LL_TOKEN` | Cookie parsing |
| `slugs.ts` | `FILENAME_SAFE`, `SLUG_SAFE`, `STRIP_HTML_TAGS`, `STRIP_QUOTES`, `HASHED_ASSET`, … | Slugification / sanitization |
| `commit.ts` | `CONVENTIONAL_COMMIT`, `RELEASE_BRANCH`, `SEMVER` | Commit / semver parsing |
| `dice.ts` | `DICE_SIMPLE`, `DICE_EXTENDED`, `DICE_ROLL_EXTRACT` | Dice notation |
| `code-fence.ts` | `CODE_FENCE_JSON`, `FENCE_OPEN`, `JSON_ARRAY` | Code-fence / JSON extraction |
| `placeholders.ts` | `DOUBLE_BRACE`, `SINGLE_BRACE`, `MENTION`, `MENTION_AT_END`, `OBJECT_TYPE`, `WORKFLOW_TAG` | Placeholder / i18n directives |

## 2. Story-Event Detail

`story-events.ts` is the largest consumer grouping. Its exported patterns cover:

- **Combat:** `COMBAT_ACTION`, `COMBAT_DAMAGE`, `COMBAT_PATTERNS`.
- **Items:** `ITEM_GIVE`, `ITEM_TAKE`, `ITEM_DROP`, `ITEM_PATTERNS`.
- **Locations:** `LOCATION_MOVEMENT`, `LOCATION_TRAVEL`, `LOCATION_PATTERNS`.
- **Lore:** `LORE_REVELATION`, `LORE_ANCIENT`, `LORE_PATTERNS`.
- **NPCs:** `NPC_DISPOSITION`, `NPC_STATE`, `NPC_REVELATION`, `NPC_PATTERNS`.
- **Time:** `TIME_CELESTIAL`, `TIME_HOURS`, `TIME_NEXT_PERIOD`, `TIME_PATTERNS`.

## 3. Usage

```typescript
import { INTENT_PATTERNS, SLUG_SAFE } from "regex";
// or
import { INTENT_PATTERNS } from "regex/intent";
```

Import the compiled constant from `regex` (central) or the specific submodule.
Submodules may additionally export parser/extractor functions; consult the
submodule source for those beyond the pattern constants listed above.

## 4. Current State

- Active and broadly used: patterns feed assistant intent detection, memory
  classification, story-event extraction, asset hash injection, and template
  rendering.
- The library is pattern/extractor-only — it does not own higher-level
  pipeline orchestration (that lives in the calling services).

# Multilingual Support (Internationalization)

## Overview

loop-lore supports four distinct layers of language handling:

1. **Application interface (UI)** — static labels, menus, system messages, error strings
2. **Chat / LLM language** — what language the LLM generates roleplay responses in
3. **Actor (user) preferred language** — per-actor language preference that shapes both UI and generation
4. **Machine-generated content** — image captions, narration, alt text, system prompts — stored in English, translated dynamically

Each layer has different storage, retrieval, and rendering semantics. A unified architecture ties them together without forcing all content into the same language.

---

## Design Principles

| Principle                                         | Rationale                                                                                                                                                                                                 |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Interface language ≠ generation language**      | A user may want the app in Spanish while roleplaying in Japanese                                                                                                                                          |
| **Content is stored in English**                  | English is the lowest-common-denominator anchor for LLM-generated content (captions, prompts, narration). Dynamic translation at read time avoids duplicating every generated string in N languages.      |
| **User-written content is preserved as-authored** | If a user types in French, the message is stored in French — never machine-retranslated back to English. Only machine-generated content (LLM outputs, auto-captions, narrator prose) is English-anchored. |
| **Translation is a reader-side concern**          | Translation happens at display time, not write time. The actor who generated the content sees it in the generation language; other actors see it in their preferred language (if translation is enabled). |
| **LLM-based translation, not static lookup**      | UI labels use static message catalogs. Everything else uses LLM translation — no dictionary/external API dependency.                                                                                      |

---

## Layer 1: Application Interface (Static i18n)

### Scope

Every server-rendered string visible to the user:

- Navigation labels, button text, form labels
- Toast/notification messages
- Error messages (both HTTP error pages and inline validation)
- Settings labels, help tooltips
- Placeholder text in inputs
- Footer text, about page, legal disclaimers

### Excluded from i18n

- User-authored content (message bodies, character descriptions, world lore)
- LLM-generated content (roleplay responses, image prompts, narration)
- Code blocks, debug output, token stats (always English)
- Slash command names (always English — `/swipe`, `/summary` — argument values may be localized)

### Architecture

```
src/
├── i18n/
│   ├── index.ts              # i18n loader + t() function
│   ├── types.ts              # TranslationKeys type (auto-derived)
│   ├── en.json               # English source catalog
│   ├── ja.json               # Japanese catalog
│   ├── zh-CN.json            # Simplified Chinese catalog
│   ├── zh-TW.json            # Traditional Chinese catalog
│   ├── ko.json               # Korean catalog
│   ├── ru.json               # Russian catalog
│   ├── de.json               # German catalog
│   ├── fr.json               # French catalog
│   ├── pt-BR.json            # Brazilian Portuguese catalog
│   └── es.json               # Spanish catalog
```

### Key Shape

```jsonc
// en.json
{
  "nav.chats": "Chats",
  "nav.characters": "Characters",
  "nav.worlds": "Worlds",
  "nav.settings": "Settings",
  "nav.gallery": "Gallery",

  "chat.input.placeholder": "Type a message...",
  "chat.input.send": "Send",
  "chat.input.attach": "Attach file",
  "chat.input.improve": "Improve message",
  "chat.input.model": "Model",

  "message.edit": "Edit",
  "message.copy": "Copy",
  "message.retry": "Retry",
  "message.remove": "Remove",
  "message.swipe": "Swipe variant {current} of {total}",

  "toast.saved": "Saved",
  "toast.error": "Something went wrong",
  "toast.connection_lost": "Connection lost",

  "settings.display_name": "Display name",
  "settings.theme": "Theme",
  "settings.theme.dark": "Dark",
  "settings.theme.light": "Light",
  "settings.language": "Language",

  "errors.404.title": "Page not found",
  "errors.404.body": "The page you're looking for doesn't exist.",
  "errors.500.title": "Server error",
  "errors.500.body": "Something went wrong. Please try again.",
}
```

### Server-Side Rendering

- The `t()` function accepts a key string and optional interpolations: `t("message.swipe", { current: 2, total: 4 })`
- The current language is stored on the user's session (not a cookie) and injected as `req.t` via middleware
- HTML templates use `&#123;&#123;&#123; t("nav.chats") &#125;&#125;&#125;` directly in server-rendered partials
- Alpine.js components get a `$t` magic property initialized from a data attribute on `<body>`:

  ```html
  <body data-t='{"swipe": "Swipe variant {current} of {total}"}'></body>
  ```

  Accessed as: `<span x-text="$t('swipe', { current: 2, total: 4 })"></span>`

### Fallback Chain

1. User's preferred interface language (from settings)
2. `Accept-Language` header (browser default)
3. `en` (English — always available, shipped in the repo as the source of truth)

If a key is missing in the user's language, the same key is looked up in `en.json`. If missing there too, the raw key is returned as a developer-visible fallback.

### v1 Scope

v1 ships with **English only**. The catalog infrastructure (`i18n/index.ts`, key-based lookup, `&#123;&#123; ... &#125;&#125;` template syntax, session language) is in place from day one so that:

- Every UI string uses `t("key")` rather than raw text
- Adding a new language is a matter of adding a JSON file
- Template authors write translations-aware code from the start (no retrofitting `"Chats"` → `t("nav.chats")` across 50 templates)

Additional languages ship as minor releases after v1.

### Translation Management

- `en.json` is the **single source of truth** and is maintained by developers
- Community translations via pull requests to `src/i18n/*.json`
- A `src/i18n/validate.ts` script checks every locale against `en.json`:
  - Missing keys → warning
  - Extra keys → warning (may be stale)
  - Interpolation mismatch → error (`&#123;verb&#125;` in key but `&#123;action&#125;` in value)
- CI runs `bun run src/i18n/validate.ts` on PRs that touch `src/i18n/`

---

## Layer 2: Chat / LLM Language

### Definition

The language the LLM is instructed to generate roleplay responses in. This is distinct from the application interface language and from the actor's preferred language.

### Where It Applies

- Character responses (AI-generated dialogue and narration)
- Assistant responses (suggestions, summaries, troubleshooting)
- Image generation prompts (the prompt sent to the image model)
- Narration / system-generated story text

### How It Works

When generating a response, the system prompt is augmented with a language directive:

```
You are a character in a roleplay. The user speaks in Japanese.
Generate your responses in Japanese. If the user switches to English,
match their language. Narrate actions and descriptions in Japanese.
```

The language directive is **not hardcoded** — it is a template parameter derived from the _chat's generation language_ setting.

### Chat-Level Setting

| Field                 | stored in                  | Default  | Behavior        |
| --------------------- | -------------------------- | -------- | --------------- |
| `generation_language` | `chats.settings` JSON blob | `"auto"` | See modes below |

**Modes:**

| Mode                 | Behavior                                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `"auto"` (default)   | LLM is instructed to match the language of the most recent user message. If the user writes in German, the character responds in German. If the user switches to English, the character follows. |
| `"en"`, `"ja"`, etc. | Fixed language. The LLM is always instructed to respond in that language regardless of the user's input.                                                                                         |
| `"inherit"`          | Inherit from the actor's preferred language (Layer 3). If the character actor has no preferred language, fall back to `"auto"`.                                                                  |

### Per-Generation Override (Future)

A dropdown or hotkey in the input area lets the user override the generation language for a single message, e.g.:

> User types in English but clicks a "Respond in Japanese" toggle → the character's response is generated in Japanese while the user message is stored in English as-typed.

This override applies to **one generation round** and resets after the response is received.

### Impact on Other Generated Content

| Content type                   | Language source                                                                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Character response             | `chats.settings.generation_language`                                                                                                         |
| Image generation prompt        | Translated from the triggering message's narrative content into English, then sent to image model. The image model prompt is always English. |
| Auto-generated summary         | Generated in the chat's `generation_language`.                                                                                               |
| Narration / action description | Generated in the chat's `generation_language`.                                                                                               |

---

## Layer 3: Actor (User) Preferred Language

### Definition

A per-actor (user, character) preference for language that feeds into both the application interface and the generation system.

### Storage

Add a `language` column to the `actors` table (or to the `settings` JSON blob). In v1 this is part of `actors.settings` JSON to avoid a schema migration:

```jsonc
// actors.settings (for a user actor)
{
  "language": {
    "interface": "ja", // UI language (from Layer 1)
    "generation": "auto", // Default generation mode (from Layer 2)
    "content": "en", // Content language preference (see Layer 4)
  },
}
```

### Actor Types

| Actor type  | `language` semantics                                                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user`      | Full language preferences: interface, generation, content. Controls the UI locale when this user is logged in.                                                                  |
| `character` | Only `generation` and `content` — characters have no interface preference. If a character has `generation: "ja"`, all chats with that character default to Japanese generation. |
| `narrator`  | Only `generation` — influences narration style language. Default: matches the chat's generation language.                                                                       |
| `system`    | Always English. No language preference stored.                                                                                                                                  |

### Cascade Resolution

When determining the effective generation language for a chat:

```
1. chat.settings.generation_language
   ↓ if "inherit" or not set
2. character actor's language.generation
   ↓ if not set
3. user actor's language.generation
   ↓ if not set
4. "auto" (match user's last message language)
```

### Settings UI

In the General section (see [settings.md](./settings.md)):

```
Language
├── Interface language     [select: en, ja, zh-CN, ...]  (user only)
├── Generation language    [select: auto | en | ja | ...] (default: auto)
└── Preferred content      [select: auto | en | user_language] (future)
```

Settings are stored per-actor. Interface language is user-only. Generation and content preferences exist for both user and character actors.

---

## Layer 4: Machine-Generated Content Translation

### The Storage Rule

All **machine-generated** content is authored in English and stored as-is:

| Content type                                                  | Authored in                | Stored as    |
| ------------------------------------------------------------- | -------------------------- | ------------ |
| Image generation prompt (auto-generated from context)         | English                    | English      |
| Image caption / alt text (auto-generated)                     | English                    | English      |
| Narration text (auto-generated by narrator AI)                | Chat's generation language | As-generated |
| System prompt fragments (world lore excerpts carried forward) | English                    | English      |
| Auto-extracted memory fact                                    | Chat's generation language | As-extracted |

### Why English as Anchor

1. **LLMs generate better content in English** — image models (DALL-E, Stable Diffusion) have English-trained CLIP backbones. Prompt engineering is overwhelmingly English. Narration quality drops measurably in non-English prompts.
2. **Translation quality improves with a single anchor** — translating `en → ja → de` has less quality loss than `en → ja` + a separate `en → de` pipeline. The source is always English, so only one translation path exists per target.
3. **Storage deduplication** — one prompt for all users. The English version is the canonical record; translations are ephemeral display-time artifacts.

### When Translation Happens

| Scenario                                            | Action                                                                                                                                                                       |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User A (English) views auto-generated image caption | Show stored English caption directly. No translation cost.                                                                                                                   |
| User B (Japanese) views same caption                | Server sends caption text + recipient's content language to an auxiliary LLM call for translation. Translated text is cached (see below).                                    |
| Chat generations in non-English                     | The generation language is set to `"ja"`. The LLM is instructed to respond in Japanese from the start — the response IS the translation. This is NOT a post-hoc translation. |
| Image prompt for a Japanese chat                    | The narrative context (in Japanese) is fed to the generation LLM with an instruction to produce an English image prompt. The prompt is stored in English.                    |

### Translation Cache

Translations are cached to avoid re-translating the same content for the same target language:

```jsonc
// Cache entry (in-memory LRU with TTL)
{
  "sourceId": "msg_uuid_123", // Message/asset ID
  "field": "alt_text", // Which field was translated
  "targetLang": "ja", // Target language
  "translated": "ドラゴンのイラスト",
  "createdAt": "2025-03-15T10:30:00Z",
  "ttl": 86400, // 24 hours
}
```

**Cache tiers**:

- **L1**: In-memory LRU (1000 entries, 24h TTL) — survives per-request, lost on restart
- **L2**: SQLite translation cache table `translation_cache` — persists across restarts, 7-day TTL

**Cache key**: `(source_id, field, target_lang)`

When the cache is empty and a translation is needed, the request blocks on the LLM call. The response is stored before being returned so subsequent viewers of the same content in the same language get an instant result.

### The Auxiliary LLM for Translation

#### Design Goals

1. No external translation API dependency (no Google Translate, DeepL, etc.)
2. Translation quality adequate for narrative content (roleplay, descriptions)
3. Low latency (< 500ms for typical caption/prompt lengths)
4. No additional cost beyond the LLM provider's token pricing

#### Implementation

The translation backend supports two modes:

**Mode 1 — Single model (default):** One LLM handles all target languages.

```env
# Optional dedicated translation LLM. If unset, the main generation LLM is used.
TRANSLATION_LLM_ENDPOINT=https://api.openai.com/v1/chat/completions
TRANSLATION_LLM_MODEL=gpt-4o-mini       # Cheap, fast
TRANSLATION_LLM_API_KEY=sk-...
```

**Mode 2 — Per-locale models (advanced):** A dictionary mapping locale tags to specific LLM endpoints. Useful when fine-tuned translation models exist for specific language pairs (e.g., a dedicated ja→en model, a ru→en model).

```env
# Per-locale translation LLMs. Falls back to the single model (or main generation LLM)
# for any locale not listed here.
TRANSLATION_LLM_MODELS_ja=https://custom-jp-translator.example.com/v1/chat/completions
TRANSLATION_LLM_API_KEY_ja=sk-custom-jp-...
TRANSLATION_LLM_MODELS_ru=https://custom-ru-translator.example.com/v1/chat/completions
TRANSLATION_LLM_API_KEY_ru=sk-custom-ru-...
TRANSLATION_LLM_MODELS_zh-CN=gpt-4o-mini   # Re-use an existing provider
```

The resolution order is:

1. Check `TRANSLATION_LLM_MODELS_{target_lang}` for a dedicated endpoint → use it
2. Check `TRANSLATION_LLM_ENDPOINT` + `TRANSLATION_LLM_MODEL` for a single model → use it
3. Fall back to the main generation LLM (the provider/config used for character responses)

This lets operators deploy fine-tuned translation models (e.g., a distilled NLLB-200 variant, a Locally fine-tuned Llama for Japanese→English) without changing any application code. The locale key in the env var uses the same BCP-47 format as all other language identifiers in this spec.

The translation call uses a minimal system prompt:

```
Translate the following text to [TARGET_LANGUAGE].
Preserve all markdown formatting. Keep names and proper nouns untranslated.
Output only the translation, no explanations.
```

#### Budget Control

| Setting                  | Default  | Description                                                                                                   |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------------------- |
| `TRANSLATION_ENABLED`    | `true`   | Master toggle. When `false`, all machine-generated content is shown in English regardless of user preference. |
| `TRANSLATION_MAX_LENGTH` | `2000`   | Characters. Text longer than this is not translated (shown in English).                                       |
| `TRANSLATION_CACHE_TTL`  | `604800` | Seconds (7 days). How long a cached translation lives before re-translation is considered.                    |
| `TRANSLATION_RATE_LIMIT` | `30`     | Max LLM translation calls per minute per server.                                                              |

### What Gets Translated vs. What Stays as-Is

| Content                                | Translated?                  | Reason                                                                               |
| -------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------ |
| Image auto-caption (`assets.alt_text`) | Yes (Layer 4)                | Machine-generated, English-anchored                                                  |
| Image generation prompt                | No (always English)          | Image model's CLIP is English                                                        |
| Character auto-description             | Yes (Layer 4)                | Machine-generated from character card                                                |
| Memory auto-extract                    | Per chat setting             | If chat generation language is non-English, the memory is extracted in that language |
| Message stats (tokens, speed)          | No                           | Always English, intended for dev/debug                                               |
| System / narrator messages             | Per chat generation language | Generated in the chat's active language                                              |
| User-authored alt text                 | As-authored                  | User wrote it deliberately, never retranslated                                       |
| Slash command names                    | No                           | `/swipe`, `/summarize` — always English                                              |
| Character name                         | No                           | Proper nouns, always as-authored                                                     |

### User Setting: Content Language Preference

In the actor's language settings:

```
Preferred content language: [auto | en | same as interface language]
```

- `auto` (default): If the chat's generation language is non-English, use that. If `"auto"` mode, match the user's interface language.
- `en`: Always show machine-generated content in English (disable translation).
- `same as interface language`: Translate machine-generated content to the user's interface language regardless of chat generation language.

---

## Interaction Between Layers

### Example Flows

#### Flow A: Monolingual English user

```
User settings:
  interface: en
  generation: auto

Chat sends user message in English.
→ LLM generates character response in English (matching input).
→ Image caption generated in English, shown in English.
→ No translation calls. All UI labels render in English.
```

#### Flow B: Japanese user, Japanese roleplay

```
User settings:
  interface: ja
  generation: ja

User types in Japanese.
→ LLM generates character response in Japanese (language directive set to ja).
→ Auto-generated image caption stored in English.
→ User sees caption translated to Japanese (via translation LLM + cache).
→ UI labels render in Japanese via en.json → ja.json lookup.
```

#### Flow C: English user, Japanese character

```
User settings:
  interface: en
  generation: auto
Character settings:
  generation: ja

User types in English.
→ LLM receives directive: "Generate responses in Japanese."
→ Character responds in Japanese.
→ User sees Japanese response. If user has content_language: en,
  they see captions and stats in English regardless.
```

#### Flow D: Bilingual chat (reality check)

```
User writes in English for 5 messages, then switches to German.
→ generation_language = "auto"
→ LLM detects language shift and switches to German.
→ Image caption from the English phase: stored in English, viewed in English.
→ Image caption from the German phase: stored in English, translated to German (if content_language = auto matches interface).
```

---

## Schema Impact

No schema changes required for v1. All language preferences are stored in existing `settings` JSON blobs:

| Entity            | Field | Key                   | Values                                |
| ----------------- | ----- | --------------------- | ------------------------------------- |
| `actors.settings` | JSON  | `language.interface`  | `"en"`, `"ja"`, `"zh-CN"`, etc.       |
| `actors.settings` | JSON  | `language.generation` | `"auto"`, `"en"`, `"ja"`, etc.        |
| `actors.settings` | JSON  | `language.content`    | `"auto"`, `"en"`, `"interface"`       |
| `chats.settings`  | JSON  | `generation_language` | `"auto"`, `"en"`, `"ja"`, `"inherit"` |

For the translation cache, a new table if L2 caching is desired:

```sql
CREATE TABLE IF NOT EXISTS translation_cache (
  source_id     TEXT NOT NULL,
  field         TEXT NOT NULL,      -- e.g. 'alt_text', 'auto_description'
  target_lang   TEXT NOT NULL,      -- BCP-47 tag
  translated    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  ttl_seconds   INTEGER NOT NULL DEFAULT 86400,
  PRIMARY KEY (source_id, field, target_lang)
);
```

Without L2 caching (v1 scope), the table is omitted and only L1 in-memory cache is used.

---

## Service Layer

New file: `src/i18n/index.ts`

```typescript
/**
 * Application i18n service.
 *
 * Provides:
 * - t(key, interpolations) — static UI string lookup
 * - translateContent(text, targetLang) — LLM-based content translation
 * - resolveGenerationLanguage(chat, userActor, characterActor) — cascade resolution
 * - loadLocale(lang) — switch active catalog
 */

export function t(key: string, params?: Record<string, string | number>): string;
export async function translateContent(
  text: string,
  targetLang: string,
  options?: { idempotencyKey?: string },
): Promise<string>;
export function resolveGenerationLanguage(chat: Chat, userActor: Actor, characterActor?: Actor): string;
```

### `translateContent` Flow

```
1. Check L1 cache (in-memory LRU)    → hit → return
2. Check L2 cache (DB)                → hit → return + warm L1
3. Check rate limit (30/min)          → exceeded → return English original
4. Check length < TRANSLATION_MAX_LENGTH → exceeded → return English original
5. Call translation LLM
6. Store in L2 cache (async, non-blocking)
7. Store in L1 cache
8. Return translation
```

---

## Roadmap Integration

### v1 (Current)

- [x] Application content is unlocked (user writes in any language)
- [ ] Translation cache table (`translation_cache`) — optional, only if L2 caching is needed
- [ ] `i18n/index.ts` service with `t()` function + locale loading
- [ ] `en.json` catalog (shipped with the repo)
- [ ] Session language middleware (`Accept-Language` → locale)
- [ ] Template authors use `t("key")` for all UI strings
- [ ] Generation language directive in system prompt template
- [ ] `actors.settings.language` JSON used for cascade resolution
- [ ] Chat setting `generation_language` (auto / fixed / inherit)

### v1.1

- [ ] Additional locale files (ja, zh-CN, ko, ru, de, fr, es)
- [ ] Community translation PR guidelines in CONTRIBUTING.md
- [ ] Translation cache with DB-backed L2
- [ ] Content translation (image captions, auto-descriptions)
- [ ] Settings UI for interface/generation language (replaces the read-only placeholder)

### Future

- [ ] Real-time language switching (no restart/reload)
- [ ] Per-message generation language override (input area dropdown)
- [ ] RTL language support (Arabic, Hebrew) — CSS logical properties audit
- [ ] Pluralization rules per locale (`zero`/`one`/`two`/`few`/`many`/`other`)
- [ ] Locale-aware date/time formatting (relative timestamps in chat)
- [ ] Locale-aware number formatting (token counts, cost)

---

## Appendix: BCP-47 Locale Tags

All language identifiers use BCP-47 format for consistency with the `Accept-Language` header standard.

| Tag     | Language              | v1 ship  |
| ------- | --------------------- | -------- |
| `en`    | English               | ✓ Source |
| `ja`    | Japanese              | v1.1     |
| `zh-CN` | Chinese (Simplified)  | v1.1     |
| `zh-TW` | Chinese (Traditional) | Future   |
| `ko`    | Korean                | v1.1     |
| `ru`    | Russian               | v1.1     |
| `de`    | German                | v1.1     |
| `fr`    | French                | v1.1     |
| `es`    | Spanish               | v1.1     |
| `pt-BR` | Portuguese (Brazil)   | v1.1     |
| `ar`    | Arabic                | Future   |
| `he`    | Hebrew                | Future   |

---

## Migration from v0 (No i18n)

Existing code that hardcodes UI strings (e.g., `res.send("<h1>Chats</h1>")`) needs to be updated to use `t("nav.chats")`:

1. Identify all hardcoded UI-facing strings in templates and route handlers
2. Extract them as keys into `en.json`
3. Replace raw strings with `t("key")` calls
4. Add the locale middleware to session handling
5. Add generation language directive to system prompt builder

There is no data migration — user-authored content is already stored as-authored and remains untouched.

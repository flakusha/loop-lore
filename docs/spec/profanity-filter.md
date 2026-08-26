<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Profanity Filter

**Status:** WIP
**Type:** Feature Spec
**Dependencies:** nsfw.md

---

## Overview

The profanity filter provides word-list-based profanity detection and masking for
chat and generated content. It is backed by the `obscenity` library, which
resolves leetspeak, confusable characters, and case variants rather than matching
fixed strings.

## 1. Implementation

Located in `src/profanity/service.ts`. A single module-level `RegExpMatcher` is
built once from `englishDataset` plus `englishRecommendedTransformers`, paired
with a `TextCensor` using `asteriskCensorStrategy`.

## 2. API

```typescript
filter(text: string): string
// Replaces detected matches with asterisks.
// Returns the input unchanged when no matches are found.
//   filter("fuck you")  // "*** you"
//   filter("hello")     // "hello"

containsProfanity(text: string): boolean
// Returns true if any profanity match is present.
//   containsProfanity("hello world") // false
```

## 3. Behavior

- **Leetspeak / confusables / case:** handled by `obscenity`'s recommended
  transformers, so `f*ck`, `phuck`, and `FUCK` are all detected.
- **Replacement:** matched spans are replaced with `*` of equal length via the
  asterisk censor strategy.
- **Shared instance:** one matcher/censor pair is reused for the process lifetime.

## 4. Current State

- Functional for English using the recommended `obscenity` dataset.
- No custom wordlists, per-language datasets, or per-user allowlists yet — only
  the English recommended dataset is loaded.
- Not yet wired into a moderation gate; callers invoke `filter` /
  `containsProfanity` directly where needed.

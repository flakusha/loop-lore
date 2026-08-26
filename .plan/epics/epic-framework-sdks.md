<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Framework SDKs

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Type:** Feature Epic
**Tags:** sdk, react, preact, svelte, vue, next, nuxt, build-pipeline
**Parent Epic:** Headless Mode & Alternative Frontends (epic-headless-alternative-frontends.md)

> **Deferrable targets:** `@loop-lore/next`, `@loop-lore/nuxt`, and `@loop-lore/vue`
> are deferrable after the core trio (React / Preact / Svelte) ships. They reuse the
> same shared layer and differ mainly in state-management bindings and build targets.

## Summary

Framework-specific SDK packages over the shared layer (`@loop-lore/api-types` + `@loop-lore/client`, see `epic-shared-client-sdk.md`): React, Preact, Svelte, Vue, Next.js, and Nuxt packages with per-target build pipelines and usage documentation.

## Scope

- Six framework packages (`packages/react|preact|svelte|vue|next|nuxt`)
- Per-target build pipeline (Vite ESM bundles; Next.js/Nuxt CLI SSR)
- Usage docs per framework

## Design

### Framework SDK Matrix

| Framework | Package             | State Management             | Build Target       |
| --------- | ------------------- | ---------------------------- | ------------------ |
| React     | `@loop-lore/react`  | React Query + Context        | Vite + SWC         |
| Preact    | `@loop-lore/preact` | Preact signals + context     | Vite + SWC         |
| Svelte    | `@loop-lore/svelte` | Svelte stores                | Vite + Svelte      |
| Next.js   | `@loop-lore/next`   | React Query + Next.js client | Next.js app router |
| Nuxt      | `@loop-lore/nuxt`   | Vue composables              | Nuxt module        |
| Vue       | `@loop-lore/vue`    | Vue composables + Pinia      | Vite + Vue         |

### React Implementation

```typescript
// @loop-lore/react
import { useCharacter, useChat, useWorld, } from "@loop-lore/react";

function ChatPage() {
  const { messages, sendMessage, isLoading, } = useChat({ chatId: "abc123", },);
  const { character, } = useCharacter({ characterId: "char1", },);

  return (
    <div>
      <CharacterCard character={character} />
      <MessageList messages={messages} />
      <ChatInput onSend={sendMessage} disabled={isLoading} />
    </div>
  );
}
```

### Preact Implementation

```typescript
// @loop-lore/preact
import { useChat, } from "@loop-lore/preact";

function ChatWidget() {
  const { messages, sendMessage, } = useChat({ chatId: "abc123", },);

  return (
    <div class="chat-widget">
      <MessageList messages={messages} />
      <ChatInput onSend={sendMessage} />
    </div>
  );
}
```

### Svelte Implementation

```svelte
<script>
  import { useChat } from "@loop-lore/svelte";

  const { messages, sendMessage } = useChat({ chatId: "abc123" });
</script>

<MessageList {messages} />
<ChatInput onSend={sendMessage} />
```

### Build Pipeline Per Target

| Target  | Build Tool  | Output     | Deploy              |
| ------- | ----------- | ---------- | ------------------- |
| React   | Vite        | ESM bundle | Vercel, Netlify, S3 |
| Preact  | Vite        | ESM bundle | Vercel, Netlify, S3 |
| Svelte  | Vite        | ESM bundle | Vercel, Netlify, S3 |
| Next.js | Next.js CLI | SSR/ISR    | Vercel, Node server |
| Nuxt    | Nuxt CLI    | SSR/SSG    | Vercel, Node server |

## Tasks

- [ ] Implement `@loop-lore/react` (React hooks + components)
- [ ] Implement `@loop-lore/preact` (Preact hooks + components)
- [ ] Implement `@loop-lore/svelte` (Svelte stores + components)
- [ ] Implement `@loop-lore/vue` (Vue composables + components)
- [ ] Implement `@loop-lore/next` (Next.js integration)
- [ ] Implement `@loop-lore/nuxt` (Nuxt module)
- [ ] Set up per-target build pipelines (Vite ESM bundles for React/Preact/Svelte/Vue; Next.js/Nuxt CLI for SSR targets)
- [ ] Document SDK usage patterns

## Dependencies

- **Parent hub:** Headless Mode & Alternative Frontends (`epic-headless-alternative-frontends.md`)
- **Requires:** `epic-api-first-foundation.md` (API surface) →
  `epic-shared-client-sdk.md` (types, client, design tokens, monorepo workspace).
- Runs in parallel with `epic-fresh-alternative-frontend.md` once the shared layer lands.

## Related Epics

- `epic-api-library-distribution.md` — packaging/distribution of these libraries
- `epic-embeddable-engine-game-frontend.md` — embedder-facing frontend alternative

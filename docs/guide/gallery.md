<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Gallery

The Gallery is your asset library — images and audio you can link to chats,
characters, and worlds. This guide covers the current web UI (sidebar →
**Gallery**).

## Open the gallery

From the sidebar, open **Gallery**. You see the asset grid plus a search bar
and a grid/list view toggle.

## Upload an asset

1. Click **+ Upload** (top-right).
2. Pick one or more files (images, audio, video).
3. Confirm. Supported formats and any size limits follow the asset config.

## Search & filter

- Use the **search box** to filter by name/caption as you type.
- Toggle **grid / list** view with the button next to the search bar.
- The **type filter** narrows results (image / audio / video).

## Link an asset to a chat

While in a chat, open the **gallery sidebar**. Assets you upload or open there
are linked to that chat and available to the model as context (images are
referenced in the prompt; audio plays as ambient background).

## Link assets to worlds & locations

Worlds and locations have their own gallery sections on their detail pages.
Linked assets are injected into the prompt context for chats in that scope:

```
World assets     → visible in all chats within the world
Location assets  → visible only in chats bound to that location
Chat assets      → visible only in that specific chat
```

If a world and a location both have a `scene` asset, the location's takes
precedence.

## See Also

- [Your First Chat](/guide/first-chat)
- [Frontend: Gallery](/frontend/gallery) — UI spec and states
- [Assets](/spec/assets) — asset service and linking model

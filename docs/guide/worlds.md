# Worlds

Worlds are shared settings that multiple chats can reference. A world carries
lore, atmosphere, and rules; chats inside it contribute to one evolving story.
This guide covers the current web UI (sidebar → **Worlds**).

## Create a world

1. From the sidebar, open **Worlds**.
2. Click **Create World**.
3. Fill in:
   - **Name** (required)
   - **Description** — short summary shown on the world card
   - **Lore** — the full setting description (rules, history, tone)
   - **Tags** — comma-separated labels for filtering
4. Click **Save**. You're taken to the world detail page.

## World detail

The world page shows:

- **Lore** — the full setting text
- **Locations** — places inside the world, forming a travel graph
- **Linked chat rooms** — chats that reference this world
- **Linked assets** — images/audio tagged to the world

### Add locations

1. On the world detail page, go to the **Locations** section.
2. Click **Add Location**.
3. Give it a **name** and **description**.
4. Optionally connect it to other locations in the world (multi-select).
5. Save.

Locations can have their own gallery assets (maps, scene art, ambient sound)
via the **Location Gallery** section.

## Start a chat in a world

- On the world detail page, click **New Chat Room** — it opens the character
  browser so you can pick who to chat with.
- Chats created this way reference the world; the world's lore is injected as
  context for the model.

## Edit & delete

- **Edit** — top-right on the world detail page. Same form as create, plus a
  Locations tab.
- **Delete** — confirm in the dialog. Deleting a world removes its linked
  locations and assets associations.

## Location-scoped chats

Group chats bound to a location have their own visibility, separate from the
location's:

| Chat visibility | Meaning                                            |
| --------------- | -------------------------------------------------- |
| `public`        | Anyone in the world can discover and join the chat |
| `private`       | Only invited participants can see and access it    |

Default is `public` for location-bound chats.

## See Also

- [Your First Chat](/guide/first-chat)
- [Frontend: Worlds](/frontend/worlds) — UI spec and states
- [Actors & World Data](/spec/actors) — data model

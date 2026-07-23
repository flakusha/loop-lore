# EPIC: Blog System

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Issue:** `8b193c8`
**Type:** Feature Epic
**Tags:** blog, llm-authored, human-authored, comments, followings, privacy, assets, moderation, rag, creative-generation

## Overview

A blog subsystem supporting both **LLM-authored** and **human-authored** posts.
LLMs can fully author posts — with or without deep research, using external or
internal-only (RAG) information gathering. Humans create posts via a manual
authoring UI with markdown editing, media insertion, drafts, tags, and
scheduling. Both paths reuse the chat record schema for post content, assets,
attachments, gallery linkage, and comments. LLMs may creatively generate new
worlds, ideas, experiences, scenarios, and items as part of blog content.
Includes content moderation (hide/disable), tiered visibility (public,
followers, private), and a reader social layer.

This epic **reuses** chat infrastructure — blog records are chat-shaped and
lean on existing message, asset, generation, and comment pipelines.

---

## LLM-Authored Blogs

### Authoring Modes

| Mode                          | Information source                                 | Notes                                                                |
| ----------------------------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| **Automated (internal-only)** | World/character state, memories, lorebooks via RAG | No external calls; retrieval-augmented generation from local DB only |
| **Deep research**             | External web search + internal RAG                 | Requires research tooling; cites external sources                    |
| **News**                      | External feeds + internal RAG                      | Time-sensitive; feeds on curated or scraped sources                  |

### RAG — Retrieval-Augmented Generation

Internal-only information gathering uses the existing RAG pipeline:

- Retrieve from world lorebooks, character memories, previous chat history
- Semantic search over local assets (images, documents, audio descriptions)
- World state queries (locations, items, NPCs, factions)
- No external API calls — everything from the local database

```typescript
interface BlogRAGQuery {
  scope: "world" | "character" | "global";
  filters: {
    world_id?: string;
    character_id?: string;
    asset_types?: AssetType[];
    date_range?: { from: Date; to: Date };
  };
  max_tokens: number;
  rank_strategy: "relevance" | "recency" | "diversity";
}

interface BlogResearchSource {
  type: "internal_rag" | "external_web" | "external_api";
  uri: string;
  title: string;
  retrieved_at: Date;
  relevance_score: number;
  snippet: string;
}
```

### Behavior Controls

| Control                             | Description                                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| Disable questionable LLM behavior   | Gate off risky generation patterns (hallucinated facts, off-topic content, inappropriate material) |
| Disable questionable human behavior | Moderation on human-authored posts and comments                                                    |

---

## Human-Authored Blogs

Humans create and manage blog posts through a manual authoring interface.
The underlying storage and infrastructure is identical to LLM-authored posts
(chat-shaped records, same asset/comment pipelines) — only the creation
surface differs.

### Authoring Workflow

| Step         | Action                                | Notes                                |
| ------------ | ------------------------------------- | ------------------------------------ |
| **Draft**    | Author writes post in markdown editor | Auto-saved; private until published  |
| **Media**    | Insert images, audio, video inline    | Reuse asset upload + gallery linkage |
| **Tags**     | Assign categories / tags              | For discovery and filtering          |
| **Preview**  | Preview post as readers will see it   | WYSIWYG or rendered markdown         |
| **Publish**  | Make post visible at chosen tier      | Public / followers / private         |
| **Schedule** | Set future publish date               | Queued publish at specified time     |
| **Edit**     | Update published or draft post        | Version history; edits logged        |

### Post Management

| Feature              | Description                                             |
| -------------------- | ------------------------------------------------------- |
| **Draft management** | List, resume, delete drafts                             |
| **Version history**  | Track edits; restore previous versions                  |
| **Bulk operations**  | Multi-select: delete, archive, change visibility        |
| **Post analytics**   | View count, comment count, follower engagement          |
| **Re-publish**       | Unarchive or republish previously hidden/disabled posts |

### Tags & Categories

```typescript
interface BlogPostTags {
  post_id: string;
  tags: string[]; // user-defined free tags
  category?: string; // optional single category
  world_id?: string; // link to a world context
  character_id?: string; // link to a character context
}
```

### Scheduled Publishing

```typescript
interface BlogSchedule {
  post_id: string;
  scheduled_at: Date; // future publish time
  status: "pending" | "published" | "cancelled";
  visibility: PrivacyTier; // tier to apply on publish
}
```

### Rich Text Authoring

The editor supports:

- **Markdown** — full CommonMark + GFM (tables, task lists, footnotes)
- **Media insertion** — upload or pick from gallery; inline or hero display
  - Reuse chat attachment pipeline for upload + linking
  - Gallery linkage: inserted assets appear in asset gallery under blog context
- **Code blocks** — syntax-highlighted, fenced
- **Embeds** — world references, character cards, item links (inline previews)
- **Draft auto-save** — periodic persistence to prevent data loss

---

## Content Moderation

Generated and user-authored blog content is subject to moderation before
and after publication.

### Moderation Pipeline

| Stage                       | Action                                         | Trigger                               |
| --------------------------- | ---------------------------------------------- | ------------------------------------- |
| **Pre-publish review**      | Generated content queued for admin/user review | Auto-generated posts                  |
| **Post-publish moderation** | Hide or disable content that violates rules    | Flagged by users or automated filters |
| **Comment moderation**      | Per-comment approve/remove/hide                | User or admin action                  |
| **Bulk moderation**         | Admin batch operations on flagged content      | Admin panel                           |

### Moderation Actions

| Action      | Effect                                                               |
| ----------- | -------------------------------------------------------------------- |
| **Hide**    | Content invisible to non-admins; author can still see it             |
| **Disable** | Content removed from all views; soft-deleted with restore capability |
| **Approve** | Content cleared for public visibility                                |
| **Flag**    | Content marked for review; stays visible but enters moderation queue |

### Behavior Disable Gates

```typescript
interface ModerationConfig {
  // LLM behavior gates
  auto_moderate_generated: boolean; // queue all LLM posts for review
  blocked_content_patterns: string[]; // regex patterns to reject
  max_generated_posts_per_hour: number; // rate limit LLM authoring

  // Human behavior gates
  require_approval_for_comments: boolean; // pre-approve comments
  max_links_per_post: number; // anti-spam
  banned_words: string[]; // content filter

  // Hide/disable policies
  auto_hide_threshold: number; // flags before auto-hide
  auto_disable_threshold: number; // flags before auto-disable
}
```

---

## Chat Record Reuse

Blog records reuse the chat message schema and infrastructure — no new
storage model for post content.

### Record Schema Reuse

| Chat concept        | Blog reuse                                      |
| ------------------- | ----------------------------------------------- |
| Message record      | Blog post body — series of chat-shaped messages |
| Message metadata    | Post title, author, tags, timestamps            |
| Message attachments | Post media (images, audio, documents)           |
| Message threading   | Comment trees on posts                          |
| Detail levels       | Draft / published / archived states             |

### Asset Generation & Attachment

Blog posts reuse the full asset pipeline:

- **Generation**: Image/audio/video generation via existing providers
- **Attachment**: Upload + link assets to posts (same as chat attachments)
- **Gallery linkage**: Blog assets appear in the asset gallery, filterable by blog context
- **Inline media**: Assets embedded in post body at specific positions

```typescript
interface BlogPostAsset {
  asset_id: string;
  position: number; // inline position in post body
  display: "inline" | "hero" | "gallery" | "attachment";
  generation_params?: GenerationParams; // if LLM-generated
}
```

### Blog Record Comments

Comments are chat messages scoped to a blog post:

```typescript
interface BlogComment {
  id: string;
  post_id: string;
  author: ActorRef;
  parent_comment_id?: string; // threaded replies
  body: string;
  assets?: AssetRef[];
  moderation_state: ModerationState;
  created_at: Date;
  updated_at: Date;
}
```

- Reuse comment moderation from chat-lifecycle (Epic 36)
- Threaded replies with depth limits
- Rich content: text + inline assets
- Moderation: approve / hide / disable per comment

---

## Creative World Generation

LLMs creatively generate new worlds, ideas, experiences, scenarios, and
items as part of blog content — seeded from the blog or prompted by users.

### Generation Capabilities

| Output type                 | Description                                       | Feeds into                       |
| --------------------------- | ------------------------------------------------- | -------------------------------- |
| **World seeds**             | New world concepts, lore, geography, cultures     | World subsystem (Epic 38/44)     |
| **Idea proposals**          | Gameplay ideas, scenario hooks, narrative threads | Assistant scenario source        |
| **Experience descriptions** | Immersive location/experience writeups            | World detail, character memories |
| **Scenario blueprints**     | Structured encounters, events, quests             | Quest engine (Epic 22)           |
| **Item concepts**           | New items with stats, descriptions, lore          | Item system (Epic 39)            |
| **NPC profiles**            | Generated characters with backstories             | Actor/character system           |

### Structured Output

Creative generation outputs structured data that can be promoted into
the game world:

```typescript
interface CreativeGeneration {
  id: string;
  type: "world_seed" | "idea" | "experience" | "scenario" | "item" | "npc";
  title: string;
  description: string; // rich markdown
  structured_data?: WorldSeed | ItemBlueprint | ScenarioBlueprint;
  promotion_state: "draft" | "suggested" | "promoted" | "rejected";
  source_post_id?: string; // originating blog post
  tags: string[];
}

interface WorldSeed {
  name: string;
  lore: string;
  geography?: string;
  cultures?: string[];
  key_npcs?: string[];
  themes: string[];
  mood: string;
}

interface ItemBlueprint {
  name: string;
  description: string;
  type: ItemType;
  rarity: ItemRarity;
  stats?: ItemStats;
  lore: string;
  visual_description: string; // for asset generation
}

interface ScenarioBlueprint {
  title: string;
  premise: string;
  objectives: string[];
  enemies?: string[];
  rewards?: string[];
  difficulty: "easy" | "medium" | "hard" | "epic";
  estimated_duration: string;
}
```

### Promotion Workflow

Generated creative content can be promoted into the active game world:

1. LLM generates creative content in a blog post
2. Content is flagged as "promotable" (structured output detected)
3. User or admin reviews → **suggest** to world/character
4. On approval → **promote**: world seed becomes a world, item becomes inventory, scenario becomes quest
5. Promoted content is linked back to the originating blog post

---

## Visibility Tiers

Posts and profiles support tiered visibility with follower-based access.

### Post Visibility

| Tier          | Who can see                          | Notes                        |
| ------------- | ------------------------------------ | ---------------------------- |
| **Public**    | Everyone (including unauthenticated) | Discoverable, indexable      |
| **Followers** | Author's followers only              | Requires follow relationship |
| **Private**   | Author only                          | Drafts, personal notes       |

### Profile Visibility

| Tier          | Who can see the profile | Notes                                   |
| ------------- | ----------------------- | --------------------------------------- |
| **Public**    | Everyone                | Profile bio, post count, follower count |
| **Followers** | Followers only          | Detailed profile, activity feed         |
| **Private**   | Author only             | Full profile, analytics                 |

### Follower Tiers

Followers can be assigned tiers that gate access:

```typescript
type FollowerTier = "reader" | "subscriber" | "patron" | "vip";

interface FollowerRelationship {
  follower_id: string;
  author_id: string;
  tier: FollowerTier;
  followed_at: Date;
  notifications_enabled: boolean;
}

interface FollowerTierConfig {
  tier: FollowerTier;
  min_level?: number; // optional: follower must reach level N
  post_access: PrivacyTier; // what posts this tier can see
  comment_access: boolean; // can this tier comment
  asset_access: boolean; // can this tier see premium assets
}
```

### Default Tier Configuration

| Tier           | Post access                  | Comments          | Assets                    |
| -------------- | ---------------------------- | ----------------- | ------------------------- |
| **Reader**     | Public posts                 | Public posts only | Public only               |
| **Subscriber** | Public + Followers           | All posts         | All public assets         |
| **Patron**     | All posts                    | All posts         | All assets + premium      |
| **VIP**        | All posts + private previews | All posts         | All assets + early access |

---

## Tasks

- [ ] Blog post schema (chat-shaped record, reuse message model)
- [ ] LLM authoring modes (automated / deep research / news)
- [ ] RAG pipeline integration for internal-only information gathering
- [ ] Research-source gathering + citation (external + internal)
- [ ] Content moderation pipeline (pre-publish, post-publish, comments)
- [ ] Hide/disable moderation actions + moderation queue
- [ ] Behavior disable gates (LLM + human content filters)
- [ ] Asset generation reuse for blog posts (images, audio, video)
- [ ] Attachment pipeline reuse (upload, link, inline)
- [ ] Gallery linkage (blog assets in asset gallery, filterable)
- [ ] Blog record comments (threaded, chat-message reuse)
- [ ] Creative world generation (world seeds, ideas, experiences, scenarios, items, NPCs)
- [ ] Structured output schemas for creative generation
- [ ] Promotion workflow (generated content → game world)
- [ ] Post visibility tiers (public / followers / private)
- [ ] Profile visibility tiers (public / followers / private)
- [ ] Follower tiers (reader / subscriber / patron / vip)
- [ ] Follow relationships + notification preferences
- [ ] Blog post CRUD routes
- [ ] Blog frontend: post list, post detail, create/edit form
- [ ] Blog moderation UI (admin + author)
- [ ] Follower management UI
- [ ] Human authoring UI (markdown editor, media insertion, preview)
- [ ] Draft management (list, resume, delete, auto-save)
- [ ] Version history (edit tracking, restore previous versions)
- [ ] Tags & categories (free tags, categories, world/character links)
- [ ] Scheduled publishing (future publish date, queued activation)
- [ ] Post management (bulk ops, analytics, re-publish)
- [ ] Rich text editor (CommonMark + GFM, embeds, code blocks)

## Files

- `src/blog/post.ts` — blog post model + authoring
- `src/blog/research.ts` — deep-research / news / RAG gathering
- `src/blog/moderation.ts` — content moderation pipeline, hide/disable
- `src/blog/comments.ts` — threaded comments (chat-message reuse)
- `src/blog/social.ts` — followings, follower tiers
- `src/blog/profile.ts` — reader profile + visibility
- `src/blog/creative.ts` — creative generation (worlds, items, scenarios)
- `src/blog/promotion.ts` — promote generated content to game world
- `src/assistant/scenario-source.ts` — consume generated-world seeds
- `src/db/schema.ts` — blog_post, blog_comment, blog_follow, blog_follow_tier, creative_generation tables
- `src/routes/blog.ts` — blog API routes
- `src/views/blog/` — blog frontend templates

- `src/blog/editor.ts` — human authoring UI components (markdown editor, media picker)
- `src/blog/drafts.ts` — draft management, auto-save, version history
- `src/blog/schedule.ts` — scheduled publishing queue
- `src/routes/blog-admin.ts` — blog management routes (CRUD, bulk ops, analytics)

## Dependencies

- Chat lifecycle & moderation (Epic 36) — comment moderation reuse
- Asset support expansion (Epic 28) — asset generation, gallery linkage
- World & locations (Epic 38) — world seed promotion target
- Item system extensions (Epic 39) — item blueprint promotion target
- Assistant intelligence (Epic 30) — scenario source consumption
- Memory systems (Epic 25) — RAG retrieval from memories
- Plugin system (Epic 37) — research tool plugins

## Linked Tasks

- TASK-blog-system.md
